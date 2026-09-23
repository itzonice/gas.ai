begin;
delete from auth.users;
select plan(13);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
update public.profiles set daily_study_minutes = 180 where id = :'ada';

insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology'),
  ('c0000000-0000-0000-0000-000000000002', :'ada', 'Archived'),
  ('c0000000-0000-0000-0000-00000000000b', :'bob', 'Bob course');
update public.courses set archived_at = now() where id = 'c0000000-0000-0000-0000-000000000002';
insert into public.grade_categories (id, course_id, name, weight) values
  ('ca000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Exams', 60),
  ('ca000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Quizzes', 40);

-- Midterm: 30% of the grade, due in 5 days, 300 min. Quiz: ~2%, due tomorrow, 30 min.
insert into public.assignments (id, course_id, category_id, title, kind, due_at, points_possible, estimated_minutes) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Midterm', 'exam', now() + interval '5 days', 100, 300),
  ('a0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Final', 'exam', now() + interval '60 days', 100, 600),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'Quiz 1', 'quiz', now() + interval '1 day', 5, 30),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'Quiz 2', 'quiz', now() + interval '8 days', 95, null),
  ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'Done quiz', 'quiz', now() + interval '1 day', 5, 30),
  ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', null, 'Archived work', 'assignment', now() + interval '1 day', 10, 60),
  ('a0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', null, 'Bob work', 'assignment', now() + interval '1 day', 10, 60);
update public.assignments set status = 'done' where title = 'Done quiz';

select tests.authenticate_as(:'ada');

select results_eq('select title from public.get_today_feed() order by rank',
  $$ values ('Midterm'), ('Quiz 2'), ('Quiz 1') $$,
  'ranked by priority; done, archived, far-off, and other users'' work excluded');
select is((select rank from public.get_today_feed() where title = 'Midterm'), 1,
  'a 30% midterm in 5 days outranks a 2% quiz tomorrow');
select is((select planned_minutes from public.get_today_feed() where title = 'Midterm'), 50,
  'multi-day work gets its share for today (300 min over 6 days)');
select is((select minutes_remaining from public.get_today_feed() where title = 'Quiz 2'), 45,
  'tasks without estimates use the default for their kind');
select is((select sum(planned_minutes)::int from public.get_today_feed()), 50 + 25 + 25,
  'planned minutes add up (the quiz due tomorrow is spread over 2 days, min 25)');
select is((select distinct capacity_minutes from public.get_today_feed()), 180, 'capacity from the profile');

-- Logging time reduces what's left of the task and of today's capacity.
insert into public.study_sessions (course_id, assignment_id, started_at, ended_at)
values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '30 minutes');
select is((select minutes_remaining from public.get_today_feed() where title = 'Midterm'), 210,
  'logged session time comes off the estimate');
select is((select distinct studied_minutes from public.get_today_feed()), 90, 'studied minutes counted');

-- Capacity caps the feed
update public.profiles set daily_study_minutes = 120;
select is((select sum(planned_minutes)::int from public.get_today_feed()), 30,
  'the feed stops when the day''s minutes are used up');
update public.profiles set daily_study_minutes = 100;
select is_empty('select 1 from public.get_today_feed()', 'nothing is planned once capacity is spent');

-- Per-weekday override
update public.profiles set daily_study_minutes = 0, study_minutes_by_weekday = array[400, 400, 400, 400, 400, 400, 400]::smallint[];
select is((select distinct capacity_minutes from public.get_today_feed()), 400, 'per-weekday minutes override the default');

select tests.authenticate_as_anon();
select throws_ok('select * from public.get_today_feed()', '42501', null, 'anon cannot read a feed');

select tests.clear_authentication();
select results_eq(
  $$ select k::text, public.default_task_minutes(k) from unnest(enum_range(null::public.assignment_kind)) k order by 1 $$,
  $$ values ('assignment', 90), ('discussion', 30), ('exam', 240), ('lab', 120), ('other', 60), ('project', 300), ('quiz', 45), ('reading', 45) $$,
  'default minutes match DEFAULT_MINUTES_BY_KIND in packages/core/src/priority');

select * from finish();
rollback;
