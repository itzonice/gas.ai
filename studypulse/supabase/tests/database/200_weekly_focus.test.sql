begin;
delete from auth.users;
select plan(6);

select tests.create_user('ada@example.com', '{"timezone": "America/Los_Angeles"}') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name, code, letter_scale) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology', 'BIO 201', null),
  ('c0000000-0000-0000-0000-000000000002', :'ada', 'Seminar', 'SEM 1', '[{"letter":"P","min":60},{"letter":"F","min":0}]');
insert into public.assignments (course_id, title, points_earned, points_possible) values
  ('c0000000-0000-0000-0000-000000000001', 'Quiz', 88, 100),
  ('c0000000-0000-0000-0000-000000000002', 'Essay', 7, 10);

-- Sunday 2027-03-07 20:00 PST is Monday 04:00 UTC: it belongs to the week starting
-- Monday 2027-03-01 locally, not the week of 2027-03-08.
insert into public.study_sessions (user_id, course_id, started_at, ended_at) values
  (:'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-08 04:00Z', '2027-03-08 05:00Z'),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-02 18:00Z', '2027-03-02 18:30Z'),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', '2027-03-09 18:00Z', '2027-03-09 18:45Z'),
  (:'ada', 'c0000000-0000-0000-0000-000000000002', '2027-03-09 20:00Z', '2027-03-09 20:20Z'),
  (:'ada', 'c0000000-0000-0000-0000-000000000002', '2027-03-10 20:00Z', null); -- running: not counted

select tests.authenticate_as(:'ada');
select results_eq(
  $$ select course_code, week_start::text, focus_minutes, session_count from public.weekly_focus_by_course order by 1, 2 $$,
  $$ values ('BIO 201', '2027-03-01', 90, 2), ('BIO 201', '2027-03-08', 45, 1), ('SEM 1', '2027-03-08', 20, 1) $$,
  'minutes grouped by course and local Monday-start week; running sessions excluded');
select results_eq($$ select distinct course_code, current_grade, current_letter from public.weekly_focus_by_course order by 1 $$,
  $$ values ('BIO 201', 88.00, 'B+'), ('SEM 1', 70.00, 'P') $$, 'current grade and letter (course scale) alongside');

select is(public.letter_for(92.999), 'A', 'letter_for rounds to 2 decimals like letterFor()');
select is(public.letter_for(59.99), 'F', 'below every minimum is the last letter');
select is(public.letter_for(null), null, 'no grade, no letter');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.weekly_focus_by_course', 'other users see nothing');

select * from finish();
rollback;
