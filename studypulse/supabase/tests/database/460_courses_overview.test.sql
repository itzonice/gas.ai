begin;
delete from auth.users;
select plan(7);

select tests.create_user('co@example.com') as u \gset
select tests.create_user('co-other@example.com') as o \gset
insert into public.courses (id, user_id, name, code, target_grade) values
  ('c0000000-0000-0000-0000-0000000000d1', :'u', 'Biology', 'BIO 201', 90),
  ('c0000000-0000-0000-0000-0000000000d2', :'u', 'Archived', 'OLD 100', null),
  ('c0000000-0000-0000-0000-0000000000d3', :'o', 'Theirs', 'X 1', null);
update public.courses set archived_at = now() where id = 'c0000000-0000-0000-0000-0000000000d2';
insert into public.assignments (course_id, title, kind, due_at, status, points_earned, points_possible) values
  ('c0000000-0000-0000-0000-0000000000d1', 'Quiz 1', 'quiz', now() - interval '3 days', 'done', 87, 100),
  ('c0000000-0000-0000-0000-0000000000d1', 'Lab 2', 'lab', now() + interval '2 days', 'todo', null, 10),
  ('c0000000-0000-0000-0000-0000000000d1', 'Final', 'exam', now() + interval '40 days', 'todo', null, 100),
  ('c0000000-0000-0000-0000-0000000000d1', 'Late', 'assignment', now() - interval '1 day', 'todo', null, 10);

select tests.authenticate_as(:'u');
create temp table o as select public.get_courses_overview() -> 'courses' as j;
select is((select jsonb_array_length(j) from o), 1, 'only active courses of the caller');
select is((select (j -> 0 ->> 'current_grade')::numeric from o), 87.00::numeric, 'current grade');
select is((select j -> 0 ->> 'letter' from o), 'B+', 'letter from the default scale');
select is((select j -> 0 -> 'next_due' ->> 'title' from o), 'Lab 2', 'next due is the soonest upcoming open item');
select is((select (j -> 0 ->> 'open_count')::int from o), 3, 'open work counted, overdue included');
select is(public.get_courses_overview() ->> 'timezone', 'UTC', 'the user''s timezone comes along');
select tests.authenticate_as_anon();
select throws_ok('select public.get_courses_overview()', '42501', null, 'anon cannot call it');

select * from finish();
rollback;
