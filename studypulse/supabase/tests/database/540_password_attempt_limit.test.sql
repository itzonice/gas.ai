-- Launch safety S6: 10 wrong passwords in 15 minutes lock password sign-in for 15
-- minutes, and the lockout answers exactly like a wrong password.
begin;
delete from auth.users;
select plan(7);

select tests.create_user('lock@example.com') as u \gset
create temp table ev(bad jsonb, good jsonb);
insert into ev values (json_build_object('user_id', :'u', 'valid', false)::jsonb,
                       json_build_object('user_id', :'u', 'valid', true)::jsonb);

select is(public.hook_password_verification_attempt((select good from ev)) ->> 'decision', 'continue',
  'a right password continues');
select is(public.hook_password_verification_attempt((select bad from ev)) ->> 'decision', 'continue',
  'a wrong password is just a wrong password');
select public.hook_password_verification_attempt((select bad from ev)) from generate_series(1, 8);
select is(public.hook_password_verification_attempt((select good from ev)) ->> 'decision', 'continue',
  '9 failures, then the right password: still allowed, and the count resets');

select public.hook_password_verification_attempt((select bad from ev)) from generate_series(1, 10);
select is(public.hook_password_verification_attempt((select good from ev)),
  '{"decision": "reject", "message": "Invalid login credentials", "should_logout_user": false}'::jsonb,
  'after 10 failures even the right password is refused, worded like a wrong one');

-- The lock lifts after 15 minutes.
update private.password_attempts set locked_until = now() - interval '1 second' where user_id = :'u';
select is(public.hook_password_verification_attempt((select good from ev)) ->> 'decision', 'continue',
  'the lock expires');

-- Failures spread over more than 15 minutes don't add up.
select public.hook_password_verification_attempt((select bad from ev)) from generate_series(1, 9);
update private.password_attempts set window_start = now() - interval '16 minutes' where user_id = :'u';
select public.hook_password_verification_attempt((select bad from ev));
select is((select failures from private.password_attempts where user_id = :'u'), 1,
  'an old window starts over');

select tests.authenticate_as(:'u');
select throws_ok($$ select public.hook_password_verification_attempt('{}') $$, '42501', null,
  'users cannot call the hook');

select * from finish();
rollback;
