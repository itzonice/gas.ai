-- Product analytics (PostHog), captured server-side through an outbox.
--
-- Triggers write events into analytics_events in the same transaction as the action,
-- so an event exists exactly when the thing happened (no lost or phantom events, no
-- client involvement, no latency in request paths). The flush-analytics function sends
-- pending rows to PostHog every few minutes; each row's id doubles as the PostHog event
-- uuid, so a retried batch can't double-count.
--
-- Events carry the user id and non-personal properties only: never emails, names,
-- course or assignment titles, grades, or syllabus content.
--
-- Activation (see docs/analytics.md): a user is activated once, within 7 days of
-- signing up, they have committed a course from a syllabus AND logged a study session.
-- The first time that becomes true, an `activated` event is recorded.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event text not null check (event in (
    'signed_up', 'syllabus_parsed', 'course_committed', 'session_logged', 'upgraded', 'activated'
  )),
  properties jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0
);
create index analytics_events_pending_idx on public.analytics_events (occurred_at) where sent_at is null;
-- One activation per user, ever.
create unique index analytics_events_one_activation on public.analytics_events (user_id) where event = 'activated';

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

create or replace function private.track(p_user uuid, p_event text, p_properties jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signed_up timestamptz;
begin
  insert into public.analytics_events (user_id, event, properties) values (p_user, p_event, p_properties);

  -- Activation: both milestones within 7 days of signup, recorded once.
  if p_event in ('course_committed', 'session_logged') then
    select created_at into v_signed_up from public.profiles where id = p_user;
    if now() <= v_signed_up + interval '7 days'
       and exists (select 1 from public.analytics_events e where e.user_id = p_user and e.event = 'course_committed')
       and exists (select 1 from public.analytics_events e where e.user_id = p_user and e.event = 'session_logged') then
      insert into public.analytics_events (user_id, event, properties)
      values (p_user, 'activated', jsonb_build_object(
        'hours_since_signup', round(extract(epoch from now() - v_signed_up) / 3600.0, 1)))
      on conflict (user_id) where event = 'activated' do nothing;
    end if;
  end if;
end;
$$;
revoke execute on function private.track(uuid, text, jsonb) from public, anon, authenticated;

-- Triggers -------------------------------------------------------------------------------

create or replace function private.analytics_on_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.track(new.id, 'signed_up', '{}');
  elsif new.plan_tier = 'pro' and old.plan_tier is distinct from 'pro' then
    perform private.track(new.id, 'upgraded', jsonb_build_object(
      'provider', (select s.provider from public.subscriptions s where s.user_id = new.id
                   order by s.updated_at desc limit 1),
      'store', (select s.store from public.subscriptions s where s.user_id = new.id
                order by s.updated_at desc limit 1)));
  end if;
  return new;
end;
$$;

create or replace function private.analytics_on_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'parsed' and old.status is distinct from 'parsed' then
    perform private.track(new.user_id, 'syllabus_parsed', jsonb_build_object(
      'source', new.source,
      'extraction_method', new.extraction_method,
      'page_count', new.page_count,
      -- Guarded: analytics must never break the parse flow on an unexpected shape.
      'assignments_found', case when jsonb_typeof(new.parse_result -> 'assignments') = 'array'
                                then jsonb_array_length(new.parse_result -> 'assignments') else 0 end,
      'seconds_to_parse', round(extract(epoch from coalesce(new.parsed_at, now()) - new.created_at))));
  elsif new.status = 'committed' and old.status is distinct from 'committed' then
    perform private.track(new.user_id, 'course_committed', jsonb_build_object(
      'source', new.source,
      'assignments', (select count(*) from public.assignments a where a.course_id = new.course_id),
      'categories', (select count(*) from public.grade_categories g where g.course_id = new.course_id)));
  end if;
  return new;
end;
$$;

create or replace function private.analytics_on_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ended_at is not null and (tg_op = 'INSERT' or old.ended_at is null) then
    perform private.track(new.user_id, 'session_logged', jsonb_build_object(
      'minutes', new.duration_minutes,
      'source', new.source,
      'has_assignment', new.assignment_id is not null));
  end if;
  return new;
end;
$$;

revoke execute on function private.analytics_on_profile() from public, anon, authenticated;
revoke execute on function private.analytics_on_upload() from public, anon, authenticated;
revoke execute on function private.analytics_on_session() from public, anon, authenticated;

create trigger profiles_analytics after insert or update of plan_tier on public.profiles
for each row execute function private.analytics_on_profile();
create trigger syllabus_uploads_analytics after update of status on public.syllabus_uploads
for each row execute function private.analytics_on_upload();
create trigger study_sessions_analytics after insert or update of ended_at on public.study_sessions
for each row execute function private.analytics_on_session();

-- Flushing (service role) --------------------------------------------------------------

-- Claims up to p_limit pending events (oldest first), skipping rows another flush holds.
create or replace function public.analytics_claim_batch(p_limit integer default 500)
returns table (id uuid, user_id uuid, event text, properties jsonb, occurred_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.analytics_events e set attempts = e.attempts + 1
  where e.id in (
    select x.id from public.analytics_events x
    where x.sent_at is null and x.attempts < 10
    order by x.occurred_at
    limit p_limit
    for update skip locked
  )
  returning e.id, e.user_id, e.event, e.properties, e.occurred_at;
$$;

create or replace function public.analytics_mark_sent(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.analytics_events set sent_at = now() where id = any (p_ids);
$$;

-- Sent events only need to stay long enough to rule out re-sends.
create or replace function private.cleanup_analytics_events()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (
    delete from public.analytics_events
    where (sent_at is not null and sent_at < now() - interval '30 days')
       or (sent_at is null and attempts >= 10 and occurred_at < now() - interval '30 days')
    returning 1
  )
  select count(*)::integer from d;
$$;

revoke execute on function public.analytics_claim_batch(integer) from public, anon, authenticated;
revoke execute on function public.analytics_mark_sent(uuid[]) from public, anon, authenticated;
revoke execute on function private.cleanup_analytics_events() from public, anon, authenticated;
grant execute on function public.analytics_claim_batch(integer) to service_role;
grant execute on function public.analytics_mark_sent(uuid[]) to service_role;

select cron.schedule('flush-analytics', '*/5 * * * *', $$ select private.invoke_edge_function('flush-analytics') $$);
select cron.schedule('cleanup-analytics-events', '23 5 * * *', $$ select private.cleanup_analytics_events() $$);
