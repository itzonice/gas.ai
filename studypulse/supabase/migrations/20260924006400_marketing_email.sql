-- Launch safety S15: marketing email is separate from the email students ask for.
--
-- Transactional (sent because of something the student did or asked for): the daily
-- digest, subscription confirmations, renewal reminders, account and security email.
-- Marketing (product news, tips, offers): only to students who opted in (off by default),
-- always with our postal address and a one-click unsubscribe that takes effect at once.
-- The two are unsubscribed separately (tokens are scoped), so leaving marketing never
-- turns off reminders and vice versa. See packages/core/src/notify/email-policy.ts.

alter table public.notification_prefs
  add column marketing_emails boolean not null default false,
  -- When the student last opted in (the consent record); cleared on opt-out.
  add column marketing_opt_in_at timestamptz;

grant update (marketing_emails) on public.notification_prefs to authenticated;

create or replace function private.stamp_marketing_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.marketing_emails and not coalesce(old.marketing_emails, false) then
    new.marketing_opt_in_at := now();
  elsif not new.marketing_emails then
    new.marketing_opt_in_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.stamp_marketing_consent() from public, anon, authenticated;

create trigger notification_prefs_marketing_consent
before insert or update of marketing_emails on public.notification_prefs
for each row execute function private.stamp_marketing_consent();

-- One-click unsubscribe from marketing (service role, from a signed link). Immediate.
create or replace function public.unsubscribe_marketing(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notification_prefs set marketing_emails = false
    where user_id = p_user_id and marketing_emails
    returning 1
  )
  select exists (select 1 from public.notification_prefs where user_id = p_user_id);
$$;
revoke execute on function public.unsubscribe_marketing(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_marketing(uuid) to service_role;

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
