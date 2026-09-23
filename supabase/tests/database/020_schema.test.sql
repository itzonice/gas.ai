-- Structural behaviour of the core tables (run as superuser; RLS is tested separately).
begin;
select plan(9);

select tests.create_user('ada@example.com') as ada \gset

insert into public.courses (id, user_id, name, term_start, term_end)
values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Biology 101', '2027-01-12', '2027-05-08'),
       ('c0000000-0000-0000-0000-000000000002', :'ada', 'Calculus II', '2027-01-12', '2027-05-08');

insert into public.grade_categories (id, course_id, name, weight)
values ('ca000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Exams', 60),
       ('ca000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Homework', 40);

select lives_ok(
  $$ insert into public.assignments (id, course_id, category_id, title)
     values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
             'ca000000-0000-0000-0000-000000000001', 'Midterm') $$,
  'assignment can use a category from its own course'
);
select lives_ok(
  $$ insert into public.assignments (course_id, title)
     values ('c0000000-0000-0000-0000-000000000001', 'Uncategorized reading') $$,
  'category_id is nullable'
);
select throws_ok(
  $$ insert into public.assignments (course_id, category_id, title)
     values ('c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'Wrong') $$,
  '23503', null,
  'assignment cannot use a category from another course'
);

delete from public.grade_categories where id = 'ca000000-0000-0000-0000-000000000001';
select is(
  (select category_id from public.assignments where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'deleting a category keeps its assignments and clears category_id'
);
select is(
  (select course_id from public.assignments where id = 'a0000000-0000-0000-0000-000000000001'),
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'clearing the category leaves course_id intact'
);

insert into public.study_sessions (id, user_id, course_id, started_at, ended_at)
values ('50000000-0000-0000-0000-000000000001', :'ada', 'c0000000-0000-0000-0000-000000000001',
        '2027-02-01 15:00Z', '2027-02-01 15:45:30Z');
select is(
  (select duration_minutes from public.study_sessions where id = '50000000-0000-0000-0000-000000000001'),
  45,
  'duration_minutes is derived from start and end'
);

select throws_ok(
  $$ insert into public.courses (user_id, name, term_start, term_end)
     select id, 'Backwards', '2027-05-01', '2027-01-01' from public.profiles limit 1 $$,
  '23514', null,
  'term_end cannot precede term_start'
);

delete from public.courses where id = 'c0000000-0000-0000-0000-000000000001';
select is_empty(
  $$ select 1 from public.assignments where course_id = 'c0000000-0000-0000-0000-000000000001'
     union all
     select 1 from public.study_sessions where course_id = 'c0000000-0000-0000-0000-000000000001' $$,
  'deleting a course removes its assignments and sessions'
);

delete from auth.users where id = :'ada';
select is_empty('select 1 from public.courses', 'deleting the user removes everything they own');

select * from finish();
rollback;
