begin;
delete from auth.users;
select plan(11);

select tests.create_user('on@example.com') as u \gset
select tests.create_user('on-other@example.com') as o \gset

select tests.authenticate_as(:'u');
select ok((select public.get_settings() -> 'profile' ->> 'onboarded_at') is null, 'new accounts start onboarding');
select is(public.get_settings() -> 'notifications' ->> 'quiet_hours_start', '22:00', 'times come as HH:MM');
select is((public.get_settings() -> 'devices' ->> 'mobile')::int, 0, 'device counts');

select throws_ok($$ select public.complete_onboarding('Ada', 'Mars/Olympus', 90, '17:00') $$,
  '22023', null, 'unknown timezones are refused');
select throws_ok($$ select public.complete_onboarding('Ada', 'Asia/Kolkata', 2000, '17:00') $$,
  '23514', null, 'minutes out of range are refused');
select lives_ok($$ select public.complete_onboarding('  Ada  ', 'Asia/Kolkata', 90, '17:00') $$, 'onboarding completes');
select results_eq(
  $$ select display_name, timezone, daily_study_minutes::int, study_start_time::text, onboarded_at is not null
     from public.profiles $$,
  $$ values ('Ada', 'Asia/Kolkata', 90, '17:00:00', true) $$,
  'answers saved on the caller''s profile only');

select throws_ok($$ update public.profiles set onboarded_at = null $$, '42501', null,
  'clients cannot reset onboarded_at directly');
update public.profiles set card_tasks_enabled = false;
select is((select card_tasks_enabled from public.profiles), false, 'users can turn off post-class card tasks');

select tests.authenticate_as(:'o');
select ok((select public.get_settings() -> 'profile' ->> 'onboarded_at') is null, 'another user is unaffected');

select tests.authenticate_as_anon();
select throws_ok('select public.get_settings()', '42501', null, 'anon cannot read settings');

select * from finish();
rollback;
