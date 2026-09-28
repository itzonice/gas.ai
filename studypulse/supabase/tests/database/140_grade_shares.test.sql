-- assignment_grade_shares mirrors gradeShare() in packages/core/src/priority (same example
-- as priority.test.ts) and respects RLS through security_invoker.
begin;
delete from auth.users;
select plan(4);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio');
insert into public.grade_categories (id, course_id, name, weight) values
  ('ca000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Exams', 60),
  ('ca000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Quizzes', 40);
insert into public.assignments (id, course_id, category_id, title, points_possible) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'mid', 100),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'final', 200),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'q1', 10),
  ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'q2', null),
  ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', null, 'loose', 50);

select tests.authenticate_as(:'ada');
select results_eq(
  $$ select a.title, round(s.grade_share, 3) from public.assignment_grade_shares s
     join public.assignments a on a.id = s.assignment_id order by a.title $$,
  $$ values ('final', 40.000), ('loose', 0.000), ('mid', 20.000), ('q1', 20.000), ('q2', 20.000) $$,
  'shares match the TypeScript gradeShare() example');
select is((select round(sum(grade_share), 6) from public.assignment_grade_shares), 100.000000::numeric,
  'categorized shares add up to 100%');

-- The Today feed uses the per-user function (S8); it must match the view exactly.
select is_empty($$
  (select assignment_id, round(grade_share, 9) from public.assignment_grade_shares
   except select assignment_id, round(grade_share, 9) from private.user_grade_shares((select auth.uid())))
  union all
  (select assignment_id, round(grade_share, 9) from private.user_grade_shares((select auth.uid()))
   except select assignment_id, round(grade_share, 9) from public.assignment_grade_shares)
$$, 'user_grade_shares() matches the view');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.assignment_grade_shares', 'other users see no shares');



select * from finish();
rollback;
