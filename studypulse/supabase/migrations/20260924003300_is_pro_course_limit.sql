-- Entitlement: is_pro(user_id), computed from subscriptions on every platform, and the
-- free plan's 3-active-course limit enforced by a trigger.
--
-- is_pro is the source of truth. profiles.plan_tier is a cache of it (read by parse
-- limits and clients): webhooks refresh it on every change, and an hourly job catches
-- subscriptions that lapse by time alone (a period ends and no webhook arrives).

create or replace function private.subscription_grants_pro(
  p_status public.subscription_status,
  p_current_period_end timestamptz,
  p_grace_period_ends_at timestamptz,
  p_now timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_status
    -- Renewal webhooks can lag the period end a little; allow 3 days.
    when 'trialing' then p_current_period_end is null or p_current_period_end > p_now - interval '3 days'
    when 'active' then p_current_period_end is null or p_current_period_end > p_now - interval '3 days'
    -- A store grace period: access until it ends.
    when 'in_grace' then p_grace_period_ends_at is null or p_grace_period_ends_at > p_now
    -- Payment failed and the provider is retrying: until the grace period ends, or 7 days
    -- past the period end if the provider gave none.
    when 'past_due' then coalesce(p_grace_period_ends_at, p_current_period_end + interval '7 days', p_now) > p_now
    else false
  end;
$$;

-- Whether a user has Pro right now. Users may ask about themselves; the service role
-- and internal callers about anyone.
create or replace function public.is_pro(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- A signed-in caller may only ask about themselves. (current_user is this function's
  -- owner here, so the JWT decides; internal callers without one are trusted.)
  if (select auth.uid()) is not null
     and (select auth.role()) is distinct from 'service_role'
     and p_user_id is distinct from (select auth.uid()) then
    raise exception 'can only check your own plan' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and private.subscription_grants_pro(s.status, s.current_period_end, s.grace_period_ends_at, now())
  );
end;
$$;

revoke execute on function public.is_pro(uuid) from public, anon;
grant execute on function public.is_pro(uuid) to authenticated, service_role;

-- The cache now follows is_pro (same rules, including time-based lapses).
create or replace function private.refresh_plan_tier(p_user_id uuid)
returns public.plan_tier
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier public.plan_tier;
begin
  v_tier := case when exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and private.subscription_grants_pro(s.status, s.current_period_end, s.grace_period_ends_at, now())
  ) then 'pro'::public.plan_tier else 'free'::public.plan_tier end;
  update public.profiles set plan_tier = v_tier where id = p_user_id and plan_tier is distinct from v_tier;
  return v_tier;
end;
$$;

-- Hourly: fix cached tiers that changed by time alone.
create or replace function private.refresh_stale_plan_tiers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_old public.plan_tier;
  r record;
begin
  for r in
    select p.id from public.profiles p
    where p.plan_tier = 'pro'
    union
    select distinct s.user_id from public.subscriptions s
    where s.updated_at > now() - interval '2 hours'
  loop
    select plan_tier into v_old from public.profiles where id = r.id;
    if v_old is distinct from private.refresh_plan_tier(r.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function private.refresh_stale_plan_tiers() from public, anon, authenticated;

select cron.schedule('refresh-plan-tiers', '17 * * * *', $$ select private.refresh_stale_plan_tiers() $$);

-- Free plan: at most 3 active (non-archived) courses. Checked when a course is created
-- or unarchived; downgraded users keep courses they already have but can't add more.
create or replace function private.enforce_course_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if new.archived_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.archived_at is null and old.user_id = new.user_id then
    return new; -- already counted
  end if;
  -- Serialize per user so two concurrent inserts can't both see 2 courses.
  perform pg_advisory_xact_lock(hashtextextended('course_limit:' || new.user_id::text, 0));
  if exists (
    select 1 from public.subscriptions s
    where s.user_id = new.user_id
      and private.subscription_grants_pro(s.status, s.current_period_end, s.grace_period_ends_at, now())
  ) then
    return new;
  end if;
  select count(*) into v_active from public.courses c
  where c.user_id = new.user_id and c.archived_at is null and c.id <> new.id;
  if v_active >= 3 then
    raise exception 'The free plan includes 3 active courses. Archive one or upgrade to Pro.'
      using errcode = 'SPC01', hint = 'course_limit_reached';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_course_limit() from public, anon, authenticated;

create trigger courses_enforce_limit
before insert or update of archived_at, user_id on public.courses
for each row execute function private.enforce_course_limit();
