-- Daily cap and repeat suppression for reminders, enforced where reminders are claimed.
--
-- claim_reminders now receives the planned reminders (most urgent first) and, holding a
-- per-user lock so overlapping cron runs can't both pass the checks, claims each one
-- unless:
-- - its key was already claimed (exact dedupe, as before)
-- - it is about an assignment that got a reminder in the last 6 hours (cooldown). This
--   stops "exam in 1 day" at 07:30 followed by "due in 24 hours" an hour later. The
--   2-hour reminder is exempt: it is the last nudge before the deadline.
-- - the user already got daily_cap reminders today (local day in their timezone).
-- Cooldown-suppressed reminders are recorded as suppressed so they are never retried;
-- cap-skipped ones are not recorded, so they can still go out after the day rolls over
-- if still relevant. Suppressed rows don't count toward the cap.

alter table public.notification_dedupe
  add column assignment_id uuid,
  add column kind text,
  add column suppressed boolean not null default false;

create index notification_dedupe_user_created_idx on public.notification_dedupe (user_id, created_at);

drop function public.claim_reminders(uuid, text[]);

create function public.claim_reminders(
  p_user_id uuid,
  p_timezone text,
  p_daily_cap integer,
  p_reminders jsonb
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;
  v_sent_today integer;
  v_claimed text[] := '{}'::text[];
  r record;
begin
  if jsonb_typeof(p_reminders) is distinct from 'array' then
    raise exception 'p_reminders must be a JSON array' using errcode = '22023';
  end if;

  -- Serialize claims per user.
  perform pg_advisory_xact_lock(hashtextextended('claim_reminders:' || p_user_id::text, 0));

  select count(*) into v_sent_today
  from public.notification_dedupe d
  where d.user_id = p_user_id and not d.suppressed and d.created_at >= v_day_start;

  for r in
    select e.value ->> 'key' as key, e.value ->> 'kind' as kind,
           nullif(e.value ->> 'assignmentId', '')::uuid as assignment_id
    from jsonb_array_elements(p_reminders) with ordinality as e (value, i)
    order by e.i
  loop
    continue when r.key is null
      or exists (select 1 from public.notification_dedupe d where d.user_id = p_user_id and d.dedupe_key = r.key);

    if r.assignment_id is not null and r.kind is distinct from 'due_2h' and exists (
      select 1 from public.notification_dedupe d
      where d.user_id = p_user_id and d.assignment_id = r.assignment_id
        and not d.suppressed and d.created_at > now() - interval '6 hours'
    ) then
      insert into public.notification_dedupe (user_id, dedupe_key, assignment_id, kind, suppressed)
      values (p_user_id, r.key, r.assignment_id, r.kind, true);
      continue;
    end if;

    exit when v_sent_today >= p_daily_cap;

    insert into public.notification_dedupe (user_id, dedupe_key, assignment_id, kind)
    values (p_user_id, r.key, r.assignment_id, r.kind);
    v_sent_today := v_sent_today + 1;
    v_claimed := v_claimed || r.key;
  end loop;

  return v_claimed;
end;
$$;

revoke execute on function public.claim_reminders(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.claim_reminders(uuid, text, integer, jsonb) to service_role;
