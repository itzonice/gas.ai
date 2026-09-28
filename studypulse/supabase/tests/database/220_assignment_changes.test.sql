begin;
delete from auth.users;
select plan(9);

select tests.create_user('ada@example.com') as ada \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio');
insert into public.assignments (id, course_id, title, due_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Essay', now() + interval '10 days');
select is((select count(*)::int from public.replan_requests where user_id = :'ada'), 1, 'creating an assignment queues a replan');
delete from public.replan_requests;

insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, locked) values
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days 1 hour', false),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '6 days', now() + interval '6 days 1 hour', false),
  (:'ada', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() + interval '8 days', now() + interval '8 days 1 hour', true);

select tests.authenticate_as(:'ada');
update public.assignments set title = 'Essay (draft)' where id = 'a0000000-0000-0000-0000-000000000001';
select tests.clear_authentication();
select is_empty('select 1 from public.replan_requests', 'edits that don''t affect planning don''t queue a replan');

select tests.authenticate_as(:'ada');
update public.assignments set due_at = now() + interval '5 days' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq($$ select count(*)::int from public.study_blocks $$, array[1],
  'moving the due date earlier removes blocks now past it, locked ones included');
select ok((select max(ends_at) from public.study_blocks) <= (select due_at from public.assignments),
  'no block ends after the new due date');
select tests.clear_authentication();
select is((select reason from public.replan_requests where user_id = :'ada'), 'update_assignment', 'and queues a replan');

select tests.authenticate_as(:'ada');
update public.assignments set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001';
select is_empty('select 1 from public.study_blocks where starts_at > now()', 'finishing an assignment frees its future blocks');

-- Queue processing: requests wait 20 s, then drain into one call.
select tests.clear_authentication();
select is(private.process_replan_requests(), 0, 'fresh requests wait for the debounce window');
update public.replan_requests set requested_at = now() - interval '1 minute';
select is(private.process_replan_requests(), 1, 'older requests are drained');
select is_empty('select 1 from public.replan_requests', 'the queue is empty afterwards');

select * from finish();
rollback;
