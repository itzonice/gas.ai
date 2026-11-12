begin;
delete from auth.users;
select plan(7);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.create_user('notoken@example.com') as nt \gset
insert into public.courses (id, user_id, name, code) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology', 'BIO 201'),
  ('c0000000-0000-0000-0000-000000000002', :'nt', 'Other', null);
insert into public.assignments (course_id, title, due_at, status) values
  ('c0000000-0000-0000-0000-000000000001', 'Lab 3', now() + interval '5 hours', 'todo'),
  ('c0000000-0000-0000-0000-000000000001', 'Done lab', now() + interval '5 hours', 'todo'),
  ('c0000000-0000-0000-0000-000000000001', 'Far off', now() + interval '20 days', 'todo'),
  ('c0000000-0000-0000-0000-000000000002', 'No device', now() + interval '5 hours', 'todo');
update public.assignments set status = 'done' where title = 'Done lab';
insert into public.notification_tokens (user_id, provider, token, platform) values (:'ada', 'expo', 'ExponentPushToken[a]', 'ios');

select tests.authenticate_as_service_role();
select results_eq($$ select user_id, timezone, jsonb_array_length(assignments) from public.reminder_batch(now()) $$,
  format($$ values (%L::uuid, 'America/Chicago', 1) $$, :'ada'),
  'only users with an active device; only open work due within 8 days');
select is((select assignments -> 0 ->> 'course' from public.reminder_batch(now())), 'BIO 201', 'course label included');
select is((select prefs ->> 'daily_cap' from public.reminder_batch(now())), '6', 'prefs included');

select is(public.claim_reminders(:'ada', 'America/Chicago', 6, '[{"key": "due_24h:x"}, {"key": "due_24h:y"}]'), array['due_24h:x', 'due_24h:y'], 'first claim wins both');
select is(public.claim_reminders(:'ada', 'America/Chicago', 6, '[{"key": "due_24h:x"}, {"key": "due_24h:z"}]'), array['due_24h:z'], 'already-claimed keys are not claimed again');

update public.notification_prefs set push_enabled = false where user_id = :'ada';
select is_empty('select 1 from public.reminder_batch(now())', 'users who turned push off are skipped');

select tests.authenticate_as(:'ada');
select throws_ok($$ select public.claim_reminders(auth.uid(), 'UTC', 6, '[]') $$, '42501', null, 'clients cannot claim reminders');

select * from finish();
rollback;
