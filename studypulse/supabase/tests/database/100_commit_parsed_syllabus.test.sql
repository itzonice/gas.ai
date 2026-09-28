begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(20);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset

-- A parsed upload with a stored result, and one still processing.
insert into public.syllabus_uploads (id, user_id, source, extracted_text, status, parse_result) values (
  'd0000000-0000-0000-0000-000000000001', :'alice', 'text', 'x', 'parsed',
  '{
    "course": {"name": "Cell Biology", "code": "BIO 201", "instructor": "Dr. Okafor", "term_start": "2027-01-12", "term_end": "2027-05-08"},
    "categories": [{"name": "Exams", "weight": 60}, {"name": "Labs", "weight": 40}],
    "assignments": [
      {"title": "Lab 1", "kind": "lab", "category_name": "labs", "due_at": "2027-01-23T05:59:00Z", "points_possible": 50},
      {"title": "Midterm", "kind": "exam", "category_name": "Exams", "due_at": "2027-03-04T16:00:00Z"},
      {"title": "Reading", "kind": "reading", "category_name": null, "due_at": null}
    ]
  }'::jsonb
), (
  'd0000000-0000-0000-0000-000000000002', :'alice', 'text', 'x', 'processing', null
);

select tests.authenticate_as(:'alice');

-- Happy path using the stored result
select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001') as course_id \gset
select results_eq('select name, code, term_start::text from public.courses',
  $$ values ('Cell Biology', 'BIO 201', '2027-01-12') $$, 'course created from the stored result');
select results_eq('select name, weight from public.grade_categories order by position',
  $$ values ('Exams', 60::numeric(5,2)), ('Labs', 40::numeric(5,2)) $$, 'categories created in order');
select results_eq(
  $$ select a.title, gc.name, a.kind::text, a.source from public.assignments a
     left join public.grade_categories gc on gc.id = a.category_id order by a.due_at nulls last $$,
  $$ values ('Lab 1', 'Labs', 'lab', 'syllabus'), ('Midterm', 'Exams', 'exam', 'syllabus'), ('Reading', null, 'reading', 'syllabus') $$,
  'assignments linked to categories case-insensitively');
select is((select due_at from public.assignments where title = 'Midterm'), '2027-03-04T16:00:00Z'::timestamptz,
  'due_at stored as the UTC instant');
select results_eq('select status::text, course_id from public.syllabus_uploads where id = ''d0000000-0000-0000-0000-000000000001''',
  format($$ values ('committed', %L::uuid) $$, :'course_id'), 'upload marked committed with the course id');

-- Idempotent retry
select is(commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001'), :'course_id'::uuid,
  'retrying returns the same course');
select results_eq('select count(*)::int from public.courses', array[1], 'retry creates nothing new');

-- Validation failures roll back everything
select tests.clear_authentication();
update public.syllabus_uploads set status = 'parsed', course_id = null where id = 'd0000000-0000-0000-0000-000000000001';
delete from public.courses;
select tests.authenticate_as(:'alice');

select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "X"}, "categories": [{"name": "Exams", "weight": 50}],
    "assignments": [{"title": "Quiz", "category_name": "Quizzes"}]}') $$,
  '22023', 'assignment category "Quizzes" is not in categories', 'unknown category name rejected');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "X"}, "categories": [{"name": "Exams", "weight": 150}], "assignments": []}') $$,
  '23514', null, 'weight over 100 rejected by the table constraint');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "X"}, "categories": [], "assignments": [{"title": "A", "kind": "homework"}]}') $$,
  '22P02', null, 'unknown assignment kind rejected');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "X"}, "categories": [{"name": "Labs", "weight": 10}, {"name": "labs", "weight": 10}], "assignments": []}') $$,
  '22023', 'category names must be unique', 'duplicate category names rejected');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "X"}, "categories": [], "assignments": [{"title": "A", "due_at": "not a date"}]}') $$,
  '22007', null, 'bad due_at rejected');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001', '{"categories": []}') $$,
  '22023', 'payload.course must be an object', 'missing course rejected');
select is_empty('select 1 from public.courses union all select 1 from public.grade_categories union all select 1 from public.assignments',
  'failed commits leave no partial rows');
select is((select status::text from public.syllabus_uploads where id = 'd0000000-0000-0000-0000-000000000001'), 'parsed',
  'failed commits leave the upload parsed');

-- Edited payload is used instead of the stored result
select lives_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "Cell Bio (edited)", "target_grade": 90}, "categories": [{"name": "All", "weight": 100}],
    "assignments": [{"title": "Only item", "category_name": "All", "estimated_minutes": 45}]}') $$,
  'edited payload commits');
select results_eq('select c.name, c.target_grade, a.title, a.estimated_minutes from public.courses c join public.assignments a on a.course_id = c.id',
  $$ values ('Cell Bio (edited)', 90::numeric(5,2), 'Only item', 45) $$, 'edited values stored');

-- Upload state and ownership
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000002') $$,
  '55000', null, 'an upload that is still processing cannot be committed');

select tests.authenticate_as(:'bob');
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001') $$,
  'P0002', null, 'another user''s upload is not found');

select tests.authenticate_as_anon();
select throws_ok($$ select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot call it');

select * from finish();
rollback;
