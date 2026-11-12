begin;
delete from auth.users;
select plan(10);

select tests.create_user('res@example.com') as u \gset
select tests.create_user('res-other@example.com') as o \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-0000000000e1', :'u', 'Biology'),
  ('c0000000-0000-0000-0000-0000000000e2', :'u', 'Chemistry');
insert into public.assignments (id, course_id, title) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'Midterm');

select tests.authenticate_as(:'u');
select lives_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url, title) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'khan_academy',
   'https://www.khanacademy.org/science/biology/cellular-respiration', 'Cellular respiration'),
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'notebooklm',
   'https://notebooklm.google.com/notebook/abc123', null),
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'anki_deck',
   'https://ankiweb.net/shared/info/123456789', 'Bio deck'),
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other',
   'https://example.edu/notes.pdf', 'Lecture notes') $$, 'owners add links of each kind');

select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'khan_academy', 'https://evil.example/khanacademy.org') $$,
  '23514', null, 'a Khan Academy link must point at khanacademy.org');
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'http://example.edu/x') $$,
  '23514', null, 'https only');
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'javascript:alert(1)') $$,
  '23514', null, 'no script links');
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e2', 'other', 'https://example.edu/y') $$,
  '23503', null, 'the course must be the assignment''s own');
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'https://example.edu/notes.pdf') $$,
  '23505', null, 'the same link once per assignment');

-- Up to 20 per assignment.
insert into public.assignment_resources (assignment_id, course_id, kind, url)
select 'a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'https://example.edu/' || g
from generate_series(1, 16) g;
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'https://example.edu/21') $$,
  '23514', null, 'at most 20 links per assignment');

select tests.authenticate_as(:'o');
select is_empty('select 1 from public.assignment_resources', 'others see nothing');
select throws_ok($$ insert into public.assignment_resources (assignment_id, course_id, kind, url) values
  ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'other', 'https://example.edu/z') $$,
  '42501', null, 'or add to someone else''s assignment');

select tests.clear_authentication();
delete from public.assignments where id = 'a0000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from public.assignment_resources), 0, 'links go with their assignment');

select * from finish();
rollback;
