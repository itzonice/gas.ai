begin;
select plan(12);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago", "display_name": "Ada"}') as ada \gset
select tests.create_user('bob@example.com', '{"timezone": "Not/AZone"}') as bob \gset
select tests.create_user('cy@example.com') as cy \gset

select results_eq(
  format('select timezone, display_name, plan_tier::text from public.profiles where id = %L', :'ada'),
  $$ values ('America/Chicago', 'Ada', 'free') $$,
  'signup creates a profile with the timezone from metadata'
);
select is(
  (select timezone from public.profiles where id = :'bob'), 'UTC',
  'invalid signup timezone falls back to UTC'
);
select is(
  (select timezone from public.profiles where id = :'cy'), 'UTC',
  'missing signup timezone defaults to UTC'
);

select ok(not public.is_valid_timezone('EST'), 'abbreviations are not valid timezones');
select ok(not public.is_valid_timezone('Etc/GMT+5'), 'fixed offsets are not valid timezones');
select ok(public.is_valid_timezone('Asia/Kolkata'), 'IANA names are valid timezones');

select tests.authenticate_as(:'ada');

select results_eq(
  $$ update public.profiles set timezone = 'Europe/Berlin', school = 'MIT' returning timezone, school $$,
  $$ values ('Europe/Berlin', 'MIT') $$,
  'user can update their timezone and school'
);
select results_eq(
  'select count(*)::int from public.profiles', array[1],
  'user sees only their own profile'
);
select is_empty(
  format('update public.profiles set school = %L where id = %L returning id', 'hacked', :'bob'),
  'user cannot update another profile'
);
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus' $$,
  '23514', null,
  'invalid timezone is rejected'
);
select throws_ok(
  $$ update public.profiles set plan_tier = 'pro' $$,
  '42501', null,
  'user cannot grant themselves Pro'
);
select throws_ok(
  format('insert into public.profiles (id) values (%L)', gen_random_uuid()),
  '42501', null,
  'user cannot insert profiles directly'
);

select * from finish();
rollback;
