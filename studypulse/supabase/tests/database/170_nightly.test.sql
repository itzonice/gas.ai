begin;
delete from auth.users;
select plan(10);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.create_user('bob@example.com', '{"timezone": "Asia/Tokyo"}') as bob \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio'),
  ('c0000000-0000-0000-0000-000000000002', :'ada', 'Chem');
insert into public.assignments (id, course_id, title, due_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Lab', '2027-03-05 12:00Z');

-- Three blocks that ended; Ada studied Bio for 40 of the 60 minutes of block 1.
insert into public.study_blocks (id, user_id, course_id, starts_at, ends_at) values
  ('b0000000-0000-0000-0000-000000000001', :'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-01 22:00Z', '2027-03-01 23:00Z'),
  ('b0000000-0000-0000-0000-000000000002', :'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-02 22:00Z', '2027-03-02 23:00Z'),
  ('b0000000-0000-0000-0000-000000000003', :'ada', 'c0000000-0000-0000-0000-000000000002', '2027-03-01 22:00Z', '2027-03-01 23:00Z'),
  ('b0000000-0000-0000-0000-000000000004', :'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-04 22:00Z', '2027-03-04 23:00Z');
insert into public.study_sessions (user_id, course_id, started_at, ended_at)
values (:'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-01 22:10Z', '2027-03-01 22:50Z');

select tests.authenticate_as_service_role();
select results_eq($$ select user_id, missed, done from public.mark_missed_blocks('2027-03-03 00:00Z') $$,
  format($$ values (%L::uuid, 2, 1) $$, :'ada'), 'ended blocks are marked; one per user row');
select is((select status::text from public.study_blocks where id = 'b0000000-0000-0000-0000-000000000001'), 'done',
  'a block covered by logged study time in the same course is done');
select is((select status::text from public.study_blocks where id = 'b0000000-0000-0000-0000-000000000003'), 'missed',
  'study time in another course does not count');
select is((select status::text from public.study_blocks where id = 'b0000000-0000-0000-0000-000000000004'), 'planned',
  'future blocks are untouched');
select is_empty($$ select * from public.mark_missed_blocks('2027-03-03 00:00Z') $$, 'running again changes nothing');

-- 09:00 UTC is 03:00 in Chicago (CST) and 18:00 in Tokyo.
select results_eq($$ select user_id from public.users_due_for_replan(3, '2027-03-04 09:00Z') $$,
  format($$ values (%L::uuid) $$, :'ada'), 'only users at their local 3 AM with something to plan');
select is_empty($$ select 1 from public.users_due_for_replan(3, '2027-03-04 18:00Z') $$,
  'Tokyo user with nothing to plan is skipped');

select public.set_plan_alerts(:'ada', '2027-03-04', '[{"local_date": "2027-03-06", "details": {"unscheduled_minutes": 90}}]');
select public.set_plan_alerts(:'ada', '2027-03-04', '[{"local_date": "2027-03-07", "details": {"unscheduled_minutes": 30}}]');
select results_eq($$ select local_date::text, (details ->> 'unscheduled_minutes')::int from public.study_plan_alerts $$,
  $$ values ('2027-03-07', 30) $$, 'alerts are replaced with the latest findings');

select tests.authenticate_as(:'ada');
select throws_ok($$ select * from public.mark_missed_blocks() $$, '42501', null, 'clients cannot run the nightly functions');
select results_eq('select count(*)::int from public.study_plan_alerts', array[1], 'users can read their alerts');

select * from finish();
rollback;
