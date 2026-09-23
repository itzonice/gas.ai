begin;
delete from auth.users;
select plan(7);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio');
insert into public.assignments (id, course_id, title) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Lab');
insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, source, locked, status) values
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduler', false, 'planned'),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduler', true, 'planned'),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '3 days', now() + interval '3 days 1 hour', 'manual', false, 'planned'),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() - interval '23 hours', 'scheduler', false, 'planned');

select tests.authenticate_as(:'ada');
select is(public.replace_study_plan(:'ada', now(), jsonb_build_array(
  jsonb_build_object('assignment_id', 'a0000000-0000-0000-0000-000000000001', 'course_id', 'c0000000-0000-0000-0000-000000000001',
    'starts_at', now() + interval '4 days', 'ends_at', now() + interval '4 days 45 minutes', 'kind', 'exam_prep'),
  jsonb_build_object('assignment_id', 'a0000000-0000-0000-0000-000000000001', 'course_id', 'c0000000-0000-0000-0000-000000000001',
    'starts_at', now() - interval '2 days', 'ends_at', now() - interval '47 hours')
)), 1, 'inserts only blocks from p_from on');
select is((select count(*)::int from public.study_blocks where source = 'scheduler' and not locked and starts_at > now()), 1,
  'future unlocked scheduler blocks are replaced');
select is((select count(*)::int from public.study_blocks where locked), 1, 'locked blocks are kept');
select is((select count(*)::int from public.study_blocks where source = 'manual'), 1, 'manual blocks are kept');
select is((select count(*)::int from public.study_blocks where starts_at < now()), 1, 'past blocks are kept');

select throws_ok(format($$ select public.replace_study_plan(%L, now(), '[]') $$, :'bob'),
  '42501', null, 'a user cannot replace another user''s plan');

select tests.authenticate_as(:'bob');
select throws_ok($$ select public.replace_study_plan(auth.uid(), now(), jsonb_build_array(
  jsonb_build_object('assignment_id', 'a0000000-0000-0000-0000-000000000001', 'course_id', 'c0000000-0000-0000-0000-000000000001',
    'starts_at', now() + interval '1 day', 'ends_at', now() + interval '1 day 1 hour'))) $$,
  null::char(5), null, 'a user cannot plan blocks in someone else''s course');

select * from finish();
rollback;
