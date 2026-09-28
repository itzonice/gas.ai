begin;
delete from auth.users;
select plan(12);

select tests.create_user('ada@example.com') as ada \gset
select is((select count(*)::int from public.analytics_events where user_id = :'ada' and event = 'signed_up'), 1, 'signup is tracked');

-- Syllabus parsed, then committed.
insert into public.courses (id, user_id, name) values ('c2000000-0000-0000-0000-000000000001', :'ada', 'Bio');
insert into public.syllabus_uploads (id, user_id, source, status, file_path) values ('d2000000-0000-0000-0000-000000000001', :'ada', 'pdf', 'processing', :'ada' || '/bio.pdf');
update public.syllabus_uploads set status = 'parsed', parse_result = '{"assignments": [{}, {}, {}]}', parsed_at = now()
where id = 'd2000000-0000-0000-0000-000000000001';
select is((select properties ->> 'assignments_found' from public.analytics_events where event = 'syllabus_parsed'), '3',
  'parsed syllabi are tracked with counts, not content');
update public.syllabus_uploads set status = 'parsed', parse_result = '{"assignments": "oops"}' where id = 'd2000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.analytics_events where event = 'syllabus_parsed'), 1,
  'no duplicate event without a status change (and odd shapes never break the flow)');
update public.syllabus_uploads set status = 'committed', course_id = 'c2000000-0000-0000-0000-000000000001'
where id = 'd2000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.analytics_events where event = 'course_committed'), 1, 'commits are tracked');
select is((select count(*)::int from public.analytics_events where event = 'activated'), 0, 'not activated yet (no session)');

-- A study session: running, then stopped.
insert into public.study_sessions (id, user_id, course_id, started_at) values
  ('e2000000-0000-0000-0000-000000000001', :'ada', 'c2000000-0000-0000-0000-000000000001', now() - interval '40 minutes');
select is((select count(*)::int from public.analytics_events where event = 'session_logged'), 0, 'a running session is not logged yet');
update public.study_sessions set ended_at = now() where id = 'e2000000-0000-0000-0000-000000000001';
select is((select properties ->> 'minutes' from public.analytics_events where event = 'session_logged'), '40', 'stopped sessions are logged with minutes');
select is((select count(*)::int from public.analytics_events where event = 'activated'), 1, 'commit + session within 7 days activates');

insert into public.study_sessions (user_id, course_id, started_at, ended_at) values
  (:'ada', 'c2000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour');
select is((select count(*)::int from public.analytics_events where event = 'activated'), 1, 'activation is recorded once');

-- A user who gets there after day 7 is not counted as activated.
select tests.create_user('late@example.com') as late \gset
update public.profiles set created_at = now() - interval '8 days' where id = :'late';
insert into public.courses (id, user_id, name) values ('c2000000-0000-0000-0000-000000000002', :'late', 'Chem');
insert into public.syllabus_uploads (user_id, source, status, course_id, parse_result, parsed_at) values (:'late', 'text', 'parsed', 'c2000000-0000-0000-0000-000000000002', '{"assignments": []}', now());
update public.syllabus_uploads set status = 'committed' where user_id = :'late';
insert into public.study_sessions (user_id, course_id, started_at, ended_at) values
  (:'late', 'c2000000-0000-0000-0000-000000000002', now() - interval '1 hour', now());
select is((select count(*)::int from public.analytics_events where user_id = :'late' and event = 'activated'), 0,
  'milestones after day 7 do not activate');

-- Upgrades.
update public.profiles set plan_tier = 'pro' where id = :'ada';
select is((select count(*)::int from public.analytics_events where event = 'upgraded'), 1, 'upgrades are tracked');

select tests.authenticate_as(:'ada');
select throws_ok($$ select * from public.analytics_events $$, '42501', null, 'clients cannot read the outbox');

select * from finish();
rollback;
