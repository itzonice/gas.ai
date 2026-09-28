-- Fix F1-F4: the hourly nightly-replan job replans each user at most once per local
-- day, whatever their UTC offset (+5:30, +5:45, -3:30, ...) and across DST changes.
--
-- Before: users_due_for_replan picked users whose local hour was exactly 3 on this run:
--   where extract(hour from p_now at time zone p.timezone) = p_local_hour
-- That already included half-hour and 45-minute zones (the job runs at minute 5), but
-- nothing stopped a retried or duplicate run from replanning the same user again, a
-- zone that springs forward at 3 AM (e.g. Europe/Athens) never had a local hour 3 that
-- day (skipped), and one that falls back at 4 AM had it twice (replanned twice).
--
-- After: claim_users_for_replan picks users whose local hour is 3 or later and whose
-- last_replanned_on is before their local today, and stamps last_replanned_on in the
-- same statement (rows locked, skip locked), so concurrent runs can't both claim a
-- user. A day whose 3 AM never happened is caught up at the next hourly run. If a
-- replan fails, the job releases the claim and a later run retries it that day.

alter table public.profiles add column last_replanned_on date;

drop function public.users_due_for_replan(integer, timestamptz);

create or replace function public.claim_users_for_replan(
  p_local_hour integer default 3,
  p_now timestamptz default now(),
  p_limit integer default 5000
)
returns table (user_id uuid, timezone text, local_date date, previous_date date)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select p.id, (p_now at time zone p.timezone)::date as local_date, p.last_replanned_on
    from public.profiles p
    where extract(hour from p_now at time zone p.timezone) >= p_local_hour
      and (p.last_replanned_on is null or p.last_replanned_on < (p_now at time zone p.timezone)::date)
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
      )
    order by p.id
    limit p_limit
    for update of p skip locked
  )
  update public.profiles p
  set last_replanned_on = d.local_date
  from due d
  where p.id = d.id
  returning p.id, p.timezone, d.local_date, d.last_replanned_on;
$$;

-- Undo a claim whose replan failed or was deferred, so a later run that day retries it.
create or replace function public.release_replan_claim(p_user_id uuid, p_local_date date, p_previous_date date default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_replanned_on = p_previous_date
  where id = p_user_id and last_replanned_on = p_local_date;
$$;

revoke execute on function public.claim_users_for_replan(integer, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.release_replan_claim(uuid, date, date) from public, anon, authenticated;
grant execute on function public.claim_users_for_replan(integer, timestamptz, integer) to service_role;
grant execute on function public.release_replan_claim(uuid, date, date) to service_role;
