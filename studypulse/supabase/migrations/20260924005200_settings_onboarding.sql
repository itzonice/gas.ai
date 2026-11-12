-- Onboarding and Settings (UI prompt 86).
--
-- profiles.onboarded_at: null until the user finishes onboarding (name, timezone, study
-- time). Accounts that existed before this migration count as onboarded.
alter table public.profiles add column onboarded_at timestamptz;
update public.profiles set onboarded_at = created_at where onboarded_at is null;

-- The post-class card task toggle (prompt 71) is the user's own setting.
grant update (card_tasks_enabled) on public.profiles to authenticated;

-- Everything the Settings screen shows, in one call (the email comes from the session). Runs as the caller, so RLS applies.
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
        'onboarded_at', p.onboarded_at
      ),
      'notifications', (
        select jsonb_build_object(
          'push_enabled', n.push_enabled,
          'email_digest_enabled', n.email_digest_enabled,
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

-- Finishes onboarding: saves the answers and stamps onboarded_at (first time only).
-- Security definer because clients can't write onboarded_at directly; it only ever
-- touches the caller's own row. Check constraints validate the name and minutes.
create or replace function public.complete_onboarding(
  p_display_name text,
  p_timezone text,
  p_daily_study_minutes int,
  p_study_start_time time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_valid_timezone(p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = '22023';
  end if;
  update public.profiles
  set display_name = nullif(btrim(p_display_name), ''),
      timezone = p_timezone,
      daily_study_minutes = p_daily_study_minutes,
      study_start_time = p_study_start_time,
      onboarded_at = coalesce(onboarded_at, now())
  where id = v_user;
end;
$$;

revoke execute on function public.get_settings() from public, anon;
revoke execute on function public.complete_onboarding(text, text, int, time) from public, anon;
grant execute on function public.get_settings() to authenticated;
grant execute on function public.complete_onboarding(text, text, int, time) to authenticated;
