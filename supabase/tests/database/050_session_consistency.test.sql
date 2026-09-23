begin;
select plan(7);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology'),
  ('c0000000-0000-0000-0000-000000000002', :'ada', 'Chemistry'),
  ('c0000000-0000-0000-0000-00000000000b', :'bob', 'Bob course');
insert into public.assignments (id, course_id, title) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Bio lab');

select tests.authenticate_as(:'ada');

select throws_ok($$ insert into public.study_sessions (course_id, assignment_id, started_at)
  values ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', now()) $$,
  '23514', null, 'session course must match the assignment''s course');

select results_eq($$ insert into public.study_sessions (id, assignment_id, started_at)
  values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now())
  returning course_id $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid) $$,
  'course_id is filled in from the assignment');

select throws_ok($$ update public.study_sessions set course_id = 'c0000000-0000-0000-0000-000000000002'
  where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'cannot move a linked session to another course');

select lives_ok($$ update public.study_sessions set assignment_id = null, course_id = 'c0000000-0000-0000-0000-000000000002'
  where id = '50000000-0000-0000-0000-000000000001' $$,
  'unlinking the assignment allows changing course');

update public.study_sessions set assignment_id = 'a0000000-0000-0000-0000-000000000001', course_id = 'c0000000-0000-0000-0000-000000000001'
where id = '50000000-0000-0000-0000-000000000001';
update public.assignments set course_id = 'c0000000-0000-0000-0000-000000000002'
where id = 'a0000000-0000-0000-0000-000000000001';
select is((select course_id from public.study_sessions where id = '50000000-0000-0000-0000-000000000001'),
  'c0000000-0000-0000-0000-000000000002'::uuid,
  'moving an assignment carries its sessions along');

-- Service role bypasses RLS, but the trigger still guards ownership.
select tests.clear_authentication();
select tests.authenticate_as_service_role();
select throws_ok(format($$ insert into public.study_sessions (user_id, course_id, started_at)
  values (%L, 'c0000000-0000-0000-0000-00000000000b', now()) $$, :'ada'),
  '23514', null, 'service role cannot attach a session to another user''s course');
select throws_ok($$ insert into public.study_sessions (user_id, assignment_id, started_at)
  values (gen_random_uuid(), gen_random_uuid(), now()) $$,
  '23503', null, 'unknown assignment is rejected');

select * from finish();
rollback;
