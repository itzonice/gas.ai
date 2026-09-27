-- Launch audit L2-AI: ask before sending anything to the AI provider.
--
-- App Store guideline 5.1.2(i) and Google Play's user data policy both require an in-app
-- disclosure that names the AI provider, says what is sent and why, and gets an explicit
-- "yes" before the first transmission. A line in the privacy policy is not enough.
--
-- profiles.ai_processing_allowed: off until the student says yes in the app (the consent
-- prompt before their first syllabus or card generation, or Settings). Existing accounts
-- start off too, so everyone sees the prompt once.
--
-- Enforced in the database, not only in the apps: a syllabus upload or card generation
-- can't be created for an account that hasn't allowed it (errcode SPA15), and withdrawing
-- consent in Settings stops anything new from being sent. Every decision is appended to
-- consent_log with the policy version, like the other consents (S23).

alter table public.consent_log drop constraint consent_log_kind_check;
alter table public.consent_log add constraint consent_log_kind_check
  check (kind in ('marketing_email', 'analytics', 'error_reports', 'ai_processing'));

alter table public.profiles
  add column ai_processing_allowed boolean not null default false;

-- The signed-in student's choice. p_source: 'prompt' (the in-context consent screen) or
-- 'settings'.
create or replace function public.set_ai_consent(p_allowed boolean, p_source text default 'settings')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_old boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'choose yes or no' using errcode = '22023';
  end if;
  if p_source not in ('prompt', 'settings') then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  select ai_processing_allowed into v_old from public.profiles where id = v_user;
  update public.profiles set ai_processing_allowed = p_allowed where id = v_user;
  -- A prompt answer is always logged (it's the moment of consent); Settings only on change.
  if v_old is distinct from p_allowed or p_source = 'prompt' then
    insert into public.consent_log (user_id, kind, granted, policy_version, source)
    values (v_user, 'ai_processing', p_allowed, private.current_privacy_version(), p_source);
  end if;
end;
$$;
revoke execute on function public.set_ai_consent(boolean, text) from public, anon;
grant execute on function public.set_ai_consent(boolean, text) to authenticated;

-- Nothing is queued for the AI provider without consent. Named so it fires before the
-- quota and spend-cap triggers (triggers run in name order), so a refused request never
-- counts against the student's limits.
create or replace function private.require_ai_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select p.ai_processing_allowed from public.profiles p where p.id = new.user_id), false
  ) then
    raise exception 'Allow StudyPulse to send this to Anthropic, our AI provider, to continue.'
      using errcode = 'SPA15', hint = 'ai_consent_required';
  end if;
  return new;
end;
$$;
revoke execute on function private.require_ai_consent() from public, anon, authenticated;

create trigger syllabus_uploads_00_require_ai_consent
before insert on public.syllabus_uploads
for each row execute function private.require_ai_consent();
create trigger card_generations_00_require_ai_consent
before insert on public.card_generations
for each row execute function private.require_ai_consent();

-- get_settings also returns the AI choice (same as 20260924006800 plus one field).
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
        'error_reports_allowed', p.error_reports_allowed,
        'ai_processing_allowed', p.ai_processing_allowed
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
