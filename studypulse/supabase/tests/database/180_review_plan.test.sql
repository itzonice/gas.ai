begin;
delete from auth.users;
select plan(4);

select tests.create_user('ada@example.com', '{"timezone": "America/New_York"}') as ada \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio');
insert into public.assignments (id, course_id, title, kind, due_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Midterm', 'exam', '2030-03-18 14:00Z');

-- Fixed times so the test doesn't depend on the time of day it runs.
\set blocks '''[{"assignment_id": "a0000000-0000-0000-0000-000000000001", "course_id": "c0000000-0000-0000-0000-000000000001", "starts_at": "2030-03-15T20:00:00Z", "ends_at": "2030-03-15T21:00:00Z"}, {"assignment_id": "a0000000-0000-0000-0000-000000000001", "course_id": "c0000000-0000-0000-0000-000000000001", "starts_at": "2030-03-17T20:00:00Z", "ends_at": "2030-03-17T21:30:00Z"}]'''

select tests.authenticate_as(:'ada');
select is(public.replace_review_plan(:'ada', '2030-03-01', array['a0000000-0000-0000-0000-000000000001']::uuid[], :blocks::jsonb),
  2, 'review blocks inserted');
select results_eq($$ select kind::text, source from public.study_blocks group by 1, 2 $$, $$ values ('review', 'review_plan') $$,
  'blocks are review kind from the review plan');

-- The user moves (locks) the Mar 15 review an hour later; regenerating keeps it and
-- doesn't add a second review that day.
update public.study_blocks set locked = true, starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
where starts_at = '2030-03-15T20:00:00Z';
select is(public.replace_review_plan(:'ada', '2030-03-01', array['a0000000-0000-0000-0000-000000000001']::uuid[], :blocks::jsonb),
  1, 'regenerating skips the day the user already has a locked review');
select is((select count(*)::int from public.study_blocks), 2, 'no duplicates');

select * from finish();
rollback;
