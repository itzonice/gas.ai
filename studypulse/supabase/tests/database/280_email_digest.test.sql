begin;
delete from auth.users;
select plan(11);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.create_user('pushy@example.com', '{"timezone": "America/Chicago"}') as pushy \gset
select tests.create_user('unconfirmed@example.com', '{"timezone": "America/Chicago"}') as unc \gset
update auth.users set email_confirmed_at = now() where id in (:'ada', :'pushy');
insert into public.courses (id, user_id, name, code) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology', 'BIO 201');
insert into public.assignments (course_id, title, due_at, status) values
  ('c0000000-0000-0000-0000-000000000001', 'Lab 3', timestamptz '2027-03-01 23:59 America/Chicago', 'todo'),
  ('c0000000-0000-0000-0000-000000000001', 'Far', timestamptz '2027-03-20 12:00 America/Chicago', 'todo');
insert into public.notification_tokens (user_id, provider, token, platform) values (:'pushy', 'expo', 'ExponentPushToken[p]', 'ios');

select tests.authenticate_as_service_role();
select is((select email_digest_enabled from public.notification_prefs where user_id = :'ada'), true,
  'email digest is on by default');

select results_eq(
  $$ select email, digest_time, jsonb_array_length(assignments) from public.email_digest_batch(timestamptz '2027-03-01 08:00 America/Chicago') $$,
  $$ values ('ada@example.com', '07:30', 1) $$,
  'only confirmed users push does not reach, with work due in the next 8 days');
select is_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-01 07:29 America/Chicago') $$,
  'nobody before their digest time');
select is_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-01 10:31 America/Chicago') $$,
  'nobody more than 3 hours after it');

update public.notification_prefs set morning_digest_time = '23:00' where user_id = :'ada';
select is_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-02 00:30 America/Chicago') $$,
  'a late digest time does not wrap past midnight');
update public.notification_prefs set morning_digest_time = '07:30' where user_id = :'ada';

update public.notification_prefs set push_enabled = false where user_id = :'pushy';
select is((select count(*)::integer from public.email_digest_batch(timestamptz '2027-03-01 08:00 America/Chicago')), 2,
  'users who turned push off get the digest even with a device');
update public.notification_prefs set push_enabled = true where user_id = :'pushy';

select public.claim_reminders(:'ada', 'America/Chicago', 1000, '[{"key": "email_digest:2027-03-01", "kind": "email_digest"}]');
select is_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-01 08:15 America/Chicago') $$,
  'once sent today, not again');
select isnt_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-02 08:00 America/Chicago') $$,
  'again the next day');

select is(public.unsubscribe_email_digest(:'ada'), true, 'unsubscribe finds the user');
select is_empty($$ select 1 from public.email_digest_batch(timestamptz '2027-03-02 08:00 America/Chicago') $$,
  'unsubscribed users get no digest');

select tests.authenticate_as(:'ada');
select throws_ok($$ select public.email_digest_batch(now()) $$, '42501', null, 'clients cannot list digest recipients');

select * from finish();
rollback;
