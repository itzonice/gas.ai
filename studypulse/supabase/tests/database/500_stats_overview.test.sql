begin;
delete from auth.users;
select plan(9);

-- Chicago: weeks start Monday, local time.
select tests.create_user('st@example.com', '{"timezone": "America/Chicago"}') as u \gset
select tests.create_user('st-other@example.com') as o \gset
insert into public.courses (id, user_id, name, code, target_grade) values
  ('c0000000-0000-0000-0000-0000000000e1', :'u', 'Biology', 'BIO 201', 90),
  ('c0000000-0000-0000-0000-0000000000e2', :'u', 'Calculus', 'MATH 221', null),
  ('c0000000-0000-0000-0000-0000000000e3', :'u', 'Empty', 'NEW 100', null),
  ('c0000000-0000-0000-0000-0000000000e4', :'o', 'Theirs', 'X 1', null);
insert into public.assignments (course_id, title, due_at, status, points_earned, points_possible) values
  ('c0000000-0000-0000-0000-0000000000e1', 'Quiz 1', now() - interval '3 days', 'done', 90, 100),
  ('c0000000-0000-0000-0000-0000000000e2', 'PS 1', now() - interval '3 days', 'done', 70, 100);

create temp table t as
select date_trunc('week', (now() at time zone 'America/Chicago')::date::timestamp)::date as monday;
grant select on t to authenticated;

-- This week: 60 min BIO (Monday 10:00 local). 3 weeks ago: 30 min MATH. 5 weeks ago: outside
-- the 4-week window. The other user's time never counts.
insert into public.study_sessions (user_id, course_id, started_at, ended_at)
select :'u'::uuid, 'c0000000-0000-0000-0000-0000000000e1'::uuid,
  (monday + time '10:00') at time zone 'America/Chicago', (monday + time '11:00') at time zone 'America/Chicago' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000e2',
  (monday - 21 + time '10:00') at time zone 'America/Chicago', (monday - 21 + time '10:30') at time zone 'America/Chicago' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000e2',
  (monday - 35 + time '10:00') at time zone 'America/Chicago', (monday - 35 + time '12:00') at time zone 'America/Chicago' from t
union all select :'o', 'c0000000-0000-0000-0000-0000000000e4',
  (monday + time '13:00') at time zone 'America/Chicago', (monday + time '14:00') at time zone 'America/Chicago' from t;

select tests.authenticate_as(:'u');
create temp table s as select public.get_stats_overview() as j;
grant select on s to authenticated;
select is((select (j ->> 'this_week_minutes')::int from s), 60, 'this week counts from Monday, local time');
select is((select jsonb_array_length(j -> 'weekly') from s), 4, 'four weeks, oldest first');
select is((select (j -> 'weekly' -> 0 ->> 'minutes')::int from s), 30, 'the oldest week in range');
select is((select (j -> 'weekly' -> 3 ->> 'minutes')::int from s), 60, 'this week last');
select is((select (j ->> 'average_grade')::numeric from s), 80.00::numeric, 'average of courses that have a grade');
select results_eq(
  $$ select c ->> 'code', (c ->> 'focus_minutes')::int, (c ->> 'current_grade')::numeric
     from s, jsonb_array_elements(j -> 'courses') c $$,
  $$ values ('BIO 201', 60, 90.00::numeric), ('MATH 221', 30, 70.00::numeric), ('NEW 100', 0, null::numeric) $$,
  'per course: focus minutes in the window and current grade');
select is(public.get_stats_overview(8) -> 'courses' -> 1 ->> 'focus_minutes', '150', 'a longer window reaches older sessions');
select is(public.get_stats_overview(99) ->> 'weeks', '26', 'the window is capped');

select tests.authenticate_as_anon();
select throws_ok('select public.get_stats_overview()', '42501', null, 'anon cannot call it');

select * from finish();
rollback;
