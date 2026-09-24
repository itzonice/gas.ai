-- Nightly maintenance of study plans: mark missed blocks, then (in the nightly-replan
-- edge function) re-rank and reschedule, and flag overloaded days.

-- Marks planned blocks that have ended. A block counts as done instead of missed when
-- the user logged study time in the same course overlapping at least half of it.
-- Returns one row per affected user. Service role only.
create or replace function public.mark_missed_blocks(p_before timestamptz default now())
returns table (user_id uuid, missed integer, done integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with ended as (
    select b.id, b.user_id, b.course_id, b.starts_at, b.ends_at
    from public.study_blocks b
    where b.status = 'planned' and b.ends_at <= p_before
    for update skip locked
  ),
  coverage as (
    select e.id,
      -- filter: greatest()/least() ignore NULLs, so an unmatched row would count as full coverage
      coalesce(sum(extract(epoch from (least(e.ends_at, coalesce(s.ended_at, p_before)) - greatest(e.starts_at, s.started_at))))
        filter (where s.id is not null), 0)
        / extract(epoch from (e.ends_at - e.starts_at)) as covered
    from ended e
    left join public.study_sessions s
      on s.user_id = e.user_id
     and s.course_id = e.course_id
     and s.started_at < e.ends_at
     and coalesce(s.ended_at, p_before) > e.starts_at
    group by e.id, e.starts_at, e.ends_at
  ),
  updated as (
    update public.study_blocks b
    set status = case when c.covered >= 0.5 then 'done'::public.study_block_status else 'missed'::public.study_block_status end
    from coverage c
    where b.id = c.id
    returning b.user_id, b.status
  )
  select u.user_id,
         count(*) filter (where u.status = 'missed')::integer,
         count(*) filter (where u.status = 'done')::integer
  from updated u
  group by u.user_id;
end;
$$;

-- Users whose local time is p_local_hour (the nightly run) and who have something to
-- plan: open work due in the next four weeks, or future planned blocks.
create or replace function public.users_due_for_replan(p_local_hour integer default 3, p_now timestamptz default now())
returns table (user_id uuid, timezone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.timezone
  from public.profiles p
  where extract(hour from p_now at time zone p.timezone) = p_local_hour
    and (
      exists (
        select 1 from public.assignments a
        join public.courses c on c.id = a.course_id
        where c.user_id = p.id and c.archived_at is null
          and a.status in ('todo', 'in_progress')
          and a.due_at between p_now and p_now + interval '28 days'
      )
      or exists (
        select 1 from public.study_blocks b
        where b.user_id = p.id and b.status = 'planned' and b.starts_at > p_now
      )
    );
$$;

-- Overloaded days found by the last replan. The user can see them; notifications use
-- them to warn about days that can't fit the planned work.
create table public.study_plan_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  kind text not null default 'overloaded' check (kind in ('overloaded')),
  -- { "unscheduled_minutes": 90, "assignment_ids": [...] }
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint study_plan_alerts_user_date_kind_key unique (user_id, local_date, kind)
);

alter table public.study_plan_alerts enable row level security;

create policy "Users can view their own plan alerts"
on public.study_plan_alerts for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.study_plan_alerts from anon;
revoke insert, update, delete on public.study_plan_alerts from authenticated;

-- Replaces a user's future alerts with the latest findings.
create or replace function public.set_plan_alerts(p_user_id uuid, p_from date, p_alerts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.study_plan_alerts where user_id = p_user_id and local_date >= p_from;
  insert into public.study_plan_alerts (user_id, local_date, kind, details)
  select p_user_id, (a ->> 'local_date')::date, 'overloaded', coalesce(a -> 'details', '{}'::jsonb)
  from jsonb_array_elements(p_alerts) a
  on conflict (user_id, local_date, kind) do update set details = excluded.details, created_at = now();
end;
$$;

revoke execute on function public.mark_missed_blocks(timestamptz) from public, anon, authenticated;
revoke execute on function public.users_due_for_replan(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.set_plan_alerts(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.mark_missed_blocks(timestamptz) to service_role;
grant execute on function public.users_due_for_replan(integer, timestamptz) to service_role;
grant execute on function public.set_plan_alerts(uuid, date, jsonb) to service_role;

-- Scheduling ------------------------------------------------------------------------
-- pg_cron calls edge functions through pg_net. The project URL and the shared cron
-- secret come from Vault, so no environment-specific values live in migrations:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random>', 'cron_secret');   -- same as CRON_SECRET
-- Without those secrets the job is a no-op (e.g. local dev).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'invoke_edge_function(%): project_url/cron_secret not in vault; skipping', p_name;
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke execute on function private.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Hourly: each run replans the users for whom it's 3 AM.
select cron.schedule('nightly-replan', '5 * * * *', $$ select private.invoke_edge_function('nightly-replan') $$);
