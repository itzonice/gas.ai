-- Launch safety S23–S24: consent, recorded and honored.
--
-- consent_log: every consent decision with its time and the policy version it was given
-- under: marketing email (S15), product analytics and browser error reports (S23), and
-- the Terms (S21 keeps its own table, terms_acceptances). Rows are appended, never edited.
--
-- profiles.analytics_allowed: whether this student's product events may go to PostHog.
-- Off for students who rejected it (and, in the EU and UK, until they accept: the web
-- app sends the choice at sign-in). Events for students who haven't allowed it are never
-- stored, so they never leave the database.

create or replace function private.current_privacy_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-25'::text $$;

create table public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('marketing_email', 'analytics', 'error_reports')),
  granted boolean not null,
  policy_version text not null,
  -- Where the choice was made: banner, settings, signup, unsubscribe_link.
  source text not null check (char_length(source) between 1 and 40),
  recorded_at timestamptz not null default now()
);
create index consent_log_user_idx on public.consent_log (user_id, kind, recorded_at desc);
alter table public.consent_log enable row level security;
revoke all on public.consent_log from anon, authenticated;
grant select on public.consent_log to authenticated;
create policy "Users can view their own consent history" on public.consent_log
for select to authenticated using ((select auth.uid()) = user_id);

alter table public.profiles
  add column analytics_allowed boolean not null default true,
  add column error_reports_allowed boolean not null default true;

-- The signed-in student's choices for product analytics and error reports.
create or replace function public.set_privacy_choices(
  p_analytics boolean,
  p_error_reports boolean,
  p_source text default 'settings'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_old record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_source not in ('banner', 'settings', 'signin') then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  select analytics_allowed, error_reports_allowed into v_old from public.profiles where id = v_user;
  update public.profiles
  set analytics_allowed = p_analytics, error_reports_allowed = p_error_reports
  where id = v_user;
  if v_old.analytics_allowed is distinct from p_analytics or p_source = 'banner' then
    insert into public.consent_log (user_id, kind, granted, policy_version, source)
    values (v_user, 'analytics', p_analytics, private.current_privacy_version(), p_source);
  end if;
  if v_old.error_reports_allowed is distinct from p_error_reports or p_source = 'banner' then
    insert into public.consent_log (user_id, kind, granted, policy_version, source)
    values (v_user, 'error_reports', p_error_reports, private.current_privacy_version(), p_source);
  end if;
  -- Withdrawn: drop what hasn't been sent yet.
  if not p_analytics then
    delete from public.analytics_events where user_id = v_user and sent_at is null;
  end if;
end;
$$;
revoke execute on function public.set_privacy_choices(boolean, boolean, text) from public, anon;
grant execute on function public.set_privacy_choices(boolean, boolean, text) to authenticated;

-- Events for students who haven't allowed analytics are never stored.
create or replace function private.analytics_require_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select p.analytics_allowed from public.profiles p where p.id = new.user_id), false) then
    return new;
  end if;
  return null;
end;
$$;
revoke execute on function private.analytics_require_consent() from public, anon, authenticated;
create trigger analytics_events_require_consent
before insert on public.analytics_events
for each row execute function private.analytics_require_consent();

-- Marketing email consent (S15) is logged too, with the policy version.
create or replace function private.log_marketing_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not new.marketing_emails then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.marketing_emails is not distinct from old.marketing_emails then
    return new;
  end if;
  insert into public.consent_log (user_id, kind, granted, policy_version, source)
  values (
    new.user_id, 'marketing_email', new.marketing_emails, private.current_privacy_version(),
    case when (select auth.uid()) is null then 'unsubscribe_link' else 'settings' end
  );
  return new;
end;
$$;
revoke execute on function private.log_marketing_consent() from public, anon, authenticated;
create trigger notification_prefs_log_marketing_consent
after insert or update of marketing_emails on public.notification_prefs
for each row execute function private.log_marketing_consent();

-- get_settings also returns the privacy choices.
create or replace function public.get_settings()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'profile', jsonb_build_object(
        'display_name', p.display_name,
        'school', p.school,
        'timezone', p.timezone,
        'daily_study_minutes', p.daily_study_minutes,
        'study_start_time', to_char(p.study_start_time, 'HH24:MI'),
        'card_tasks_enabled', p.card_tasks_enabled,
        'plan_tier', p.plan_tier,
        'onboarded_at', p.onboarded_at,
        'analytics_allowed', p.analytics_allowed,
        'error_reports_allowed', p.error_reports_allowed
      ),
      'notifications', (
        select jsonb_build_object(
          'push_enabled', n.push_enabled,
          'email_digest_enabled', n.email_digest_enabled,
          'marketing_emails', n.marketing_emails,
          'remind_24h', n.remind_24h,
          'remind_2h', n.remind_2h,
          'exam_countdown', n.exam_countdown,
          'morning_digest', n.morning_digest,
          'morning_digest_time', to_char(n.morning_digest_time, 'HH24:MI'),
          'quiet_hours_enabled', n.quiet_hours_enabled,
          'quiet_hours_start', to_char(n.quiet_hours_start, 'HH24:MI'),
          'quiet_hours_end', to_char(n.quiet_hours_end, 'HH24:MI'),
          'daily_cap', n.daily_cap
        )
        from public.notification_prefs n where n.user_id = v_user
      ),
      -- Devices that can receive reminders, so the screen can say where they go.
      'devices', jsonb_build_object(
        'mobile', (select count(*) from public.notification_tokens t
                   where t.user_id = v_user and t.provider = 'expo' and t.invalidated_at is null),
        'web', (select count(*) from public.notification_tokens t
                where t.user_id = v_user and t.provider = 'web_push' and t.invalidated_at is null)
      )
    )
    from public.profiles p
    where p.id = v_user
  );
end;
$$;
