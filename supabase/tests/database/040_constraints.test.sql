begin;
select plan(16);

select tests.create_user('ada@example.com') as ada \gset
insert into public.courses (id, user_id, name)
values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology');
insert into public.assignments (id, course_id, title, points_possible)
values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Quiz 1', 10);

-- weights
select lives_ok($$ insert into public.grade_categories (course_id, name, weight)
  values ('c0000000-0000-0000-0000-000000000001', 'Zero', 0), ('c0000000-0000-0000-0000-000000000001', 'All', 100) $$,
  'weights of 0 and 100 are allowed');
select throws_ok($$ insert into public.grade_categories (course_id, name, weight)
  values ('c0000000-0000-0000-0000-000000000001', 'Too much', 100.5) $$, '23514', null, 'weight above 100 rejected');
select throws_ok($$ insert into public.grade_categories (course_id, name, weight)
  values ('c0000000-0000-0000-0000-000000000001', 'Negative', -1) $$, '23514', null, 'negative weight rejected');
select throws_ok($$ update public.courses set target_grade = 101 $$, '23514', null, 'target grade above 100 rejected');

-- status enum
select throws_ok($$ update public.assignments set status = 'finished' $$, '22P02', null, 'unknown status rejected');
update public.assignments set status = 'done';
select isnt((select completed_at from public.assignments), null, 'marking done sets completed_at');
update public.assignments set status = 'todo';
select is((select completed_at from public.assignments), null, 'reopening clears completed_at');

-- scores
select lives_ok($$ update public.assignments set points_earned = 12 $$, 'extra credit above points_possible allowed');
select throws_ok($$ update public.assignments set points_earned = 25 $$, '23514', null, 'more than 2x points_possible rejected');
select throws_ok($$ update public.assignments set points_earned = -1 $$, '23514', null, 'negative score rejected');
select throws_ok($$ update public.assignments set points_possible = 0 $$, '23514', null, 'zero points_possible rejected');
select throws_ok($$ update public.assignments set points_possible = null $$, '23514', null,
  'a score needs points_possible');

-- durations
select throws_ok($$ update public.assignments set estimated_minutes = 0 $$, '23514', null, 'zero estimate rejected');
select throws_ok($$ insert into public.study_sessions (user_id, course_id, started_at, ended_at)
  select user_id, id, '2027-02-01 15:00Z', '2027-02-01 15:00Z' from public.courses $$,
  '23514', null, 'zero-length session rejected');
select throws_ok($$ insert into public.study_sessions (user_id, course_id, started_at, ended_at)
  select user_id, id, '2027-02-01 15:00Z', '2027-02-02 16:00Z' from public.courses $$,
  '23514', null, 'session longer than 24h rejected');
select lives_ok($$ insert into public.study_sessions (user_id, course_id, started_at)
  select user_id, id, now() from public.courses $$, 'running session (no end) allowed');

select * from finish();
rollback;
