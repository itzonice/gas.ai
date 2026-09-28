begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(10);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', :'alice', 'Alice Bio'),
  ('c0000000-0000-0000-0000-0000000000a2', :'alice', 'Alice Chem'),
  ('c0000000-0000-0000-0000-00000000000b', :'bob', 'Bob Physics');
insert into public.assignments (id, course_id, title) values
  ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Bio midterm');
insert into public.study_blocks (id, user_id, course_id, assignment_id, starts_at, ends_at)
values ('b0000000-0000-0000-0000-00000000000a', :'alice', 'c0000000-0000-0000-0000-00000000000a',
        'a0000000-0000-0000-0000-00000000000a', '2027-03-01 18:00Z', '2027-03-01 19:30Z');

select is((select duration_minutes from public.study_blocks), 90, 'duration derived from start/end');
select throws_ok($$ update public.study_blocks set ends_at = starts_at $$, '23514', null, 'zero-length block rejected');
select throws_ok($$ update public.study_blocks set status = 'skipped' $$, '22P02', null, 'status is planned/done/missed');
select throws_ok($$ update public.study_blocks set course_id = 'c0000000-0000-0000-0000-0000000000a2' $$,
  '23514', null, 'block course must match its assignment''s course');
update public.study_blocks set status = 'done';
select isnt((select completed_at from public.study_blocks), null, 'marking done sets completed_at');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.study_blocks', 'B cannot read A''s blocks');
select is_empty('update public.study_blocks set locked = true returning 1', 'B cannot update A''s blocks');
select is_empty('delete from public.study_blocks returning 1', 'B cannot delete A''s blocks');
select throws_ok($$ insert into public.study_blocks (course_id, starts_at, ends_at)
  values ('c0000000-0000-0000-0000-00000000000a', now(), now() + interval '1 hour') $$,
  null::char(5), null, 'B cannot schedule blocks in A''s course');

select tests.authenticate_as(:'alice');
delete from public.assignments where id = 'a0000000-0000-0000-0000-00000000000a';
select is_empty('select 1 from public.study_blocks', 'deleting an assignment removes its blocks');

select * from finish();
rollback;
