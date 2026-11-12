-- Launch safety S7: a hard daily AI spend cap per user, on top of the count limits
-- (3/25 parses a day, 5/50 card generations). Once a user's AI cost for their local day
-- reaches the cap, new syllabus parses and card generations are refused (SPB01) until
-- their next local day, and work already queued stops before its next AI call.
--
-- Costs use the same prices as the cost alerts (ai_model_prices; unknown models at the
-- highest rate). A single parse can finish past the cap, so the most anyone can spend in
-- a day is the cap plus one request (bounded by max_tokens).

create table public.ai_daily_caps (
  plan_tier public.plan_tier primary key,
  cents integer not null check (cents > 0)
);
alter table public.ai_daily_caps enable row level security;
revoke all on public.ai_daily_caps from anon, authenticated;

-- Change without a deploy: update public.ai_daily_caps set cents = ... where plan_tier = ...
insert into public.ai_daily_caps (plan_tier, cents) values ('free', 100), ('pro', 500);

-- AI cost (cents) of a user's parses and card generations since their local midnight.
create or replace function private.ai_spent_today_cents(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with day as (
    select date_trunc('day', now() at time zone p.timezone) at time zone p.timezone as start
    from public.profiles p where p.id = p_user_id
  )
  select coalesce((
    select sum(private.ai_usage_cost_cents(u.ai_usage))
    from public.syllabus_uploads u, day
    where u.user_id = p_user_id and u.created_at >= day.start
  ), 0) + coalesce((
    select sum(private.ai_usage_cost_cents(g.ai_usage))
    from public.card_generations g, day
    where g.user_id = p_user_id and g.created_at >= day.start
  ), 0);
$$;

create or replace function private.ai_daily_cap_cents(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.cents from public.profiles p join public.ai_daily_caps c on c.plan_tier = p.plan_tier
     where p.id = p_user_id),
    (select min(cents) from public.ai_daily_caps)
  );
$$;

-- Refuses new AI work once today's spend reaches the cap.
create or replace function private.enforce_ai_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.ai_spent_today_cents(new.user_id) >= private.ai_daily_cap_cents(new.user_id) then
    raise exception 'You''ve reached today''s limit for AI features. It resets at midnight.'
      using errcode = 'SPB01', hint = 'ai_budget_exceeded';
  end if;
  return new;
end;
$$;

create trigger syllabus_uploads_enforce_ai_cap
before insert on public.syllabus_uploads
for each row execute function private.enforce_ai_daily_cap();

create trigger card_generations_enforce_ai_cap
before insert on public.card_generations
for each row execute function private.enforce_ai_daily_cap();

-- For the edge functions, right before each AI call (service role only).
create or replace function public.ai_budget_status(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'spent_cents', round(private.ai_spent_today_cents(p_user_id), 4),
    'cap_cents', private.ai_daily_cap_cents(p_user_id),
    'exceeded', private.ai_spent_today_cents(p_user_id) >= private.ai_daily_cap_cents(p_user_id)
  );
$$;

revoke execute on function private.ai_spent_today_cents(uuid) from public, anon, authenticated;
revoke execute on function private.ai_daily_cap_cents(uuid) from public, anon, authenticated;
revoke execute on function private.enforce_ai_daily_cap() from public, anon, authenticated;
revoke execute on function public.ai_budget_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_budget_status(uuid) to service_role;
