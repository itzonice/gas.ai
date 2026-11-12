-- Launch safety S15: marketing email is opt-in, recorded, and unsubscribed separately.
begin;
select plan(7);

select tests.create_user('ada@example.com') as ada \gset
select is((select marketing_emails from public.notification_prefs where user_id = :'ada'), false,
  'marketing email is off by default');

select tests.authenticate_as(:'ada');
update public.notification_prefs set marketing_emails = true;
select tests.clear_authentication();
select isnt((select marketing_opt_in_at from public.notification_prefs where user_id = :'ada'), null,
  'opting in records when');
select throws_ok($$ select public.get_settings() $$, '42501', null, 'get_settings needs a user');
select tests.authenticate_as(:'ada');
select is((public.get_settings() -> 'notifications' ->> 'marketing_emails'), 'true',
  'settings show the choice');
select throws_ok(format('select public.unsubscribe_marketing(%L)', :'ada'), '42501', null,
  'only the unsubscribe link (service role) calls unsubscribe_marketing');
select tests.clear_authentication();

update public.notification_prefs set email_digest_enabled = true where user_id = :'ada';
select tests.authenticate_as_service_role();
select public.unsubscribe_marketing(:'ada');
select tests.clear_authentication();
select is(
  (select (marketing_emails, marketing_opt_in_at is null, email_digest_enabled)::text
   from public.notification_prefs where user_id = :'ada'),
  '(f,t,t)', 'unsubscribing from marketing is immediate and leaves the digest alone');

select tests.authenticate_as(:'ada');
select throws_ok($$ update public.notification_prefs set marketing_opt_in_at = now() - interval '1 year' $$,
  '42501', null, 'the consent time cannot be forged');
select * from finish();
rollback;
