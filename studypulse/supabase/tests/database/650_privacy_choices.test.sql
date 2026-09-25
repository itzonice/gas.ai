-- Launch safety S23–S24: consent decisions are logged with time and policy version, and
-- product analytics are only stored for students who allow them.
begin;
select plan(8);

select is(private.current_privacy_version(), '2026-09-25',
  'SQL and packages/core/src/privacy PRIVACY_VERSION agree (update both together)');

select tests.create_user('eu@example.com') as eu \gset
select tests.authenticate_as(:'eu');
select public.set_privacy_choices(false, false, 'banner');
select is((select (analytics_allowed, error_reports_allowed)::text from public.profiles where id = :'eu'),
  '(f,f)', 'rejecting in the banner turns both off on the account');
select is((select count(*)::int from public.consent_log where user_id = :'eu' and not granted
           and policy_version = '2026-09-25' and source = 'banner'), 2,
  'each decision is logged with the policy version and where it was made');
select throws_ok($$ insert into public.consent_log (user_id, kind, granted, policy_version, source)
  values (auth.uid(), 'analytics', true, 'x', 'y') $$, '42501', null, 'the log cannot be written directly');
select throws_ok($$ select public.set_privacy_choices(true, true, 'forged') $$, '22023', null,
  'only known sources');
select tests.clear_authentication();

insert into public.analytics_events (user_id, event) values (:'eu', 'session_logged');
select is((select count(*)::int from public.analytics_events where user_id = :'eu'), 0,
  'no analytics are stored for a student who said no');

select tests.authenticate_as(:'eu');
select public.set_privacy_choices(true, false, 'settings');
select tests.clear_authentication();
insert into public.analytics_events (user_id, event) values (:'eu', 'session_logged');
select is((select count(*)::int from public.analytics_events where user_id = :'eu'), 1,
  'after opting in, they are');

select tests.authenticate_as(:'eu');
update public.notification_prefs set marketing_emails = true;
select tests.clear_authentication();
select is((select (granted, policy_version)::text from public.consent_log
           where user_id = :'eu' and kind = 'marketing_email'), '(t,2026-09-25)',
  'marketing email consent is logged with the policy version too');

select * from finish();
rollback;
