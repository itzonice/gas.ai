-- User B must not be able to read, update, delete, or write into user A's rows in
-- any table. Every new user-owned table should get a block here.
begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(34);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset

-- Alice's data, created as superuser.
insert into public.courses (id, user_id, name)
values ('c0000000-0000-0000-0000-00000000000a', :'alice', 'Alice Chem');
insert into public.grade_categories (id, course_id, name, weight)
values ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Labs', 30);
insert into public.assignments (id, course_id, category_id, title)
values ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a',
        'ca000000-0000-0000-0000-00000000000a', 'Lab 1');
insert into public.study_sessions (id, user_id, course_id, started_at, ended_at)
values ('50000000-0000-0000-0000-00000000000a', :'alice', 'c0000000-0000-0000-0000-00000000000a',
        '2027-02-01 15:00Z', '2027-02-01 16:00Z');

-- Bob's own course, used for "move into / out of" attempts.
insert into public.courses (id, user_id, name)
values ('c0000000-0000-0000-0000-00000000000b', :'bob', 'Bob Physics');

select tests.authenticate_as(:'bob');

-- profiles -----------------------------------------------------------------
select is_empty(format('select 1 from public.profiles where id = %L', :'alice'),
  'profiles: B cannot read A');
select is_empty(format('update public.profiles set school = %L where id = %L returning 1', 'x', :'alice'),
  'profiles: B cannot update A');
select throws_ok(format('delete from public.profiles where id = %L', :'alice'), '42501', null,
  'profiles: B cannot delete A');

-- courses ------------------------------------------------------------------
select is_empty($$ select 1 from public.courses where id = 'c0000000-0000-0000-0000-00000000000a' $$,
  'courses: B cannot read A');
select is_empty($$ update public.courses set name = 'pwned'
                   where id = 'c0000000-0000-0000-0000-00000000000a' returning 1 $$,
  'courses: B cannot update A');
select is_empty($$ delete from public.courses where id = 'c0000000-0000-0000-0000-00000000000a' returning 1 $$,
  'courses: B cannot delete A');
select throws_ok(format('insert into public.courses (user_id, name) values (%L, %L)', :'alice', 'Planted'),
  '42501', null, 'courses: B cannot create a course owned by A');
select throws_ok(format($$ update public.courses set user_id = %L
                            where id = 'c0000000-0000-0000-0000-00000000000b' $$, :'alice'),
  '42501', null, 'courses: B cannot give a course to A');

-- grade_categories ------------------------------------------------------------
select is_empty($$ select 1 from public.grade_categories where id = 'ca000000-0000-0000-0000-00000000000a' $$,
  'grade_categories: B cannot read A');
select is_empty($$ update public.grade_categories set weight = 99
                   where id = 'ca000000-0000-0000-0000-00000000000a' returning 1 $$,
  'grade_categories: B cannot update A');
select is_empty($$ delete from public.grade_categories
                   where id = 'ca000000-0000-0000-0000-00000000000a' returning 1 $$,
  'grade_categories: B cannot delete A');
select throws_ok($$ insert into public.grade_categories (course_id, name, weight)
                    values ('c0000000-0000-0000-0000-00000000000a', 'Planted', 10) $$,
  '42501', null, 'grade_categories: B cannot insert into A''s course');

-- assignments ----------------------------------------------------------------
select is_empty($$ select 1 from public.assignments where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'assignments: B cannot read A');
select is_empty($$ update public.assignments set title = 'pwned'
                   where id = 'a0000000-0000-0000-0000-00000000000a' returning 1 $$,
  'assignments: B cannot update A');
select is_empty($$ delete from public.assignments
                   where id = 'a0000000-0000-0000-0000-00000000000a' returning 1 $$,
  'assignments: B cannot delete A');
select throws_ok($$ insert into public.assignments (course_id, title)
                    values ('c0000000-0000-0000-0000-00000000000a', 'Planted') $$,
  '42501', null, 'assignments: B cannot insert into A''s course');

insert into public.assignments (id, course_id, title)
values ('a0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Bob HW');
select throws_ok($$ update public.assignments set course_id = 'c0000000-0000-0000-0000-00000000000a'
                    where id = 'a0000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'assignments: B cannot move an assignment into A''s course');

-- study_sessions -------------------------------------------------------------
-- Writes may be rejected by the consistency trigger (23514) before RLS (42501); any error passes.
select is_empty($$ select 1 from public.study_sessions where id = '50000000-0000-0000-0000-00000000000a' $$,
  'study_sessions: B cannot read A');
select is_empty($$ update public.study_sessions set notes = 'pwned'
                   where id = '50000000-0000-0000-0000-00000000000a' returning 1 $$,
  'study_sessions: B cannot update A');
select is_empty($$ delete from public.study_sessions
                   where id = '50000000-0000-0000-0000-00000000000a' returning 1 $$,
  'study_sessions: B cannot delete A');
select throws_ok($$ insert into public.study_sessions (course_id, started_at)
                    values ('c0000000-0000-0000-0000-00000000000a', now()) $$,
  null::char(5), null, 'study_sessions: B cannot log time in A''s course');
select throws_ok(format($$ insert into public.study_sessions (user_id, course_id, started_at)
                           values (%L, 'c0000000-0000-0000-0000-00000000000b', now()) $$, :'alice'),
  null::char(5), null, 'study_sessions: B cannot log a session as A');

-- B still has full access to their own data.
select lives_ok($$ insert into public.study_sessions (course_id, started_at)
                   values ('c0000000-0000-0000-0000-00000000000b', now()) $$,
  'study_sessions: B can log time in their own course');
select results_eq('select count(*)::int from public.courses', array[1], 'B sees exactly their own course');

-- anon sees nothing at all.
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.courses', '42501', null, 'anon: no access to courses');
select throws_ok('select 1 from public.assignments', '42501', null, 'anon: no access to assignments');
select throws_ok('select 1 from public.profiles', '42501', null, 'anon: no access to profiles');

-- Confirm A's data survived every attempt, as A.
select tests.authenticate_as(:'alice');
select results_eq('select name from public.courses', array['Alice Chem'], 'A: course unchanged');
select results_eq('select weight from public.grade_categories', array[30::numeric(5, 2)],
  'A: category unchanged');
select results_eq('select title from public.assignments', array['Lab 1'], 'A: assignment unchanged');
select results_eq('select notes from public.study_sessions', array[null::text], 'A: session unchanged');
select results_eq('select school from public.profiles', array[null::text], 'A: profile unchanged');
select is_empty($$ select 1 from public.assignments where id = 'a0000000-0000-0000-0000-00000000000b' $$,
  'A cannot see B''s assignment either');
select is_empty('select 1 from public.study_sessions where user_id <> auth.uid()',
  'A sees only their own sessions');

select * from finish();
rollback;
