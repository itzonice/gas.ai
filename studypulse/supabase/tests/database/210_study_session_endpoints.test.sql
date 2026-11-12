begin;
delete from auth.users;
select plan(14);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio'),
  ('c0000000-0000-0000-0000-00000000000b', :'bob', 'Bob');
insert into public.assignments (id, course_id, title) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Lab');

select tests.authenticate_as(:'ada');

select is((select id from public.start_study_session('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001', now() - interval '30 minutes')),
  '50000000-0000-0000-0000-000000000001'::uuid, 'start returns the session with the client id');
select is((select status::text from public.assignments where id = 'a0000000-0000-0000-0000-000000000001'), 'in_progress',
  'starting work moves the assignment to in progress');
select is((select started_at from public.start_study_session('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001', now())),
  (select started_at from public.study_sessions where id = '50000000-0000-0000-0000-000000000001'),
  'retrying start returns the original session unchanged');
select results_eq('select count(*)::int from public.study_sessions', array[1], 'no duplicate on retry');
select throws_ok($$ select public.start_study_session('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001') $$,
  '23505', null, 'reusing an id for different details is a conflict');

select throws_ok($$ select public.start_study_session('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001') $$,
  '23P01', 'another study session overlaps this one; stop it first', 'a second running session is rejected');

select isnt((select ended_at from public.stop_study_session('50000000-0000-0000-0000-000000000001')), null, 'stop ends the session');
select is((select duration_minutes from public.stop_study_session('50000000-0000-0000-0000-000000000001')), 30,
  'retrying stop returns the session unchanged');

select throws_ok($$ select public.start_study_session('50000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
    null, now() - interval '20 minutes') $$,
  '23P01', null, 'a session starting inside a finished one is rejected');
select lives_ok($$ select public.start_study_session('50000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001') $$,
  'a new session after the last one ended is fine');

select throws_ok($$ select public.start_study_session(gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', null, now() + interval '1 hour') $$,
  '22023', null, 'future start times are rejected');
select throws_ok($$ select public.stop_study_session('50000000-0000-0000-0000-000000000004', now() - interval '1 day') $$,
  '22023', null, 'ending before the start is rejected');

select tests.authenticate_as(:'bob');
select throws_ok($$ select public.stop_study_session('50000000-0000-0000-0000-000000000004') $$,
  'P0002', null, 'another user''s session is not found');
select throws_ok($$ select public.start_study_session(gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001') $$,
  null::char(5), null, 'cannot start a session in another user''s course');

select * from finish();
rollback;
