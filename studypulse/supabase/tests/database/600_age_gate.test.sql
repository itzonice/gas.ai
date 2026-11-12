-- Launch safety S12: no accounts under 13, no stored birth dates, and nothing created
-- before the age is confirmed.
begin;
delete from auth.users;
select plan(21);

-- Age math: the birthday counts as the last day of the birth month.
select is(private.age_in_years('2013-06', '2026-06-30'), 13, '13 on the last day of the birth month');
select is(private.age_in_years('2013-06', '2026-06-29'), 12, 'still 12 the day before');
select is(private.age_in_years('2012-02', '2025-02-28'), 12, 'leap February counts as the 29th (same as the app)');
select is(private.age_in_years('2012-02', '2025-03-01'), 13, 'and turns 13 on March 1 in a non-leap year');
select is(private.age_in_years('2013-13', '2026-06-30'), null, 'invalid month');
select is(private.age_in_years('2030-01', '2026-06-30'), null, 'future birth month');

-- Sign-up with a birth month.
select throws_ok(
  $$ select tests.create_user('kid@example.com', jsonb_build_object('birth_month', to_char(now() - interval '12 years', 'YYYY-MM'))) $$,
  'SPA13', null, 'an under-13 account is never created');
select is((select count(*)::int from auth.users where email = 'kid@example.com'), 0, 'no row left behind');

select tests.create_user('teen@example.com', jsonb_build_object('birth_month', to_char(now() - interval '14 years', 'YYYY-MM'))) as teen \gset
select is((select raw_user_meta_data ? 'birth_month' from auth.users where id = :'teen'), false,
  'the birth month is not stored');
select isnt((select age_confirmed_at from public.profiles where id = :'teen'), null,
  'only the confirmation time is kept');

-- Apple/Google: no birth month at sign-up, so nothing can be created until confirmed.
select tests.create_user('oauth@example.com', '{"no_birth_month": true}') as oauth \gset
select is((select age_confirmed_at from public.profiles where id = :'oauth'), null, 'starts unconfirmed');
select tests.authenticate_as(:'oauth');
select throws_ok($$ insert into public.courses (name) values ('Bio') $$, 'SPA14', null,
  'no courses before the age is confirmed');
select throws_ok($$ select public.complete_onboarding('O', 'UTC', 60, '16:00') $$, 'SPA14', null,
  'no onboarding before the age is confirmed');
select throws_ok($$ update public.profiles set age_confirmed_at = now() $$, '42501', null,
  'users cannot mark themselves confirmed');
select throws_ok($$ select public.confirm_age('nonsense') $$, '22023', null, 'a bad birth month is rejected');
select is(public.confirm_age(to_char(now() - interval '20 years', 'YYYY-MM')), 'confirmed', 'an adult confirms');
select lives_ok($$ insert into public.courses (name) values ('Bio') $$, 'and can then create a course');
select tests.clear_authentication();

select tests.create_user('oauthkid@example.com', '{"no_birth_month": true}') as oauthkid \gset
select tests.authenticate_as(:'oauthkid');
select is(public.confirm_age(to_char(now() - interval '10 years', 'YYYY-MM')), 'blocked', 'a child is blocked');
select tests.clear_authentication();
select is((select count(*)::int from auth.users where id = :'oauthkid'), 0, 'and their account is deleted');

-- The auth hook's answers.
select is(
  public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
    'app_metadata', jsonb_build_object('provider', 'email'),
    'user_metadata', jsonb_build_object('birth_month', to_char(now() - interval '11 years', 'YYYY-MM')))))
    -> 'error' ->> 'http_code',
  '403', 'the hook refuses an under-13 email sign-up');
select is(
  public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
    'app_metadata', jsonb_build_object('provider', 'apple'), 'user_metadata', '{}'::jsonb))),
  '{}'::jsonb, 'Apple sign-ups pass and are asked after sign-in');

select * from finish();
rollback;
