begin;
delete from auth.users;
select plan(18);

select tests.create_user('admin@school.edu') as admin \gset
select tests.create_user('s1@school.edu') as s1 \gset
select tests.create_user('s2@school.edu') as s2 \gset
select tests.create_user('s3@school.edu') as s3 \gset
select tests.create_user('outsider@example.com') as outsider \gset

-- Each student studied 2 hours this week.
insert into public.courses (id, user_id, name) values
  ('c1000000-0000-0000-0000-000000000001', :'s1', 'Bio'),
  ('c1000000-0000-0000-0000-000000000002', :'s2', 'Bio'),
  ('c1000000-0000-0000-0000-000000000003', :'s3', 'Bio');
insert into public.study_sessions (user_id, course_id, started_at, ended_at)
select u, c, date_trunc('week', now()) + interval '1 hour', date_trunc('week', now()) + interval '3 hours'
from (values (:'s1'::uuid, 'c1000000-0000-0000-0000-000000000001'::uuid),
             (:'s2'::uuid, 'c1000000-0000-0000-0000-000000000002'::uuid),
             (:'s3'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid)) v(u, c);

select tests.authenticate_as(:'admin');
select organization_id as org, join_code as code from public.create_organization('Lincoln High') \gset
select is((select role::text from public.organization_memberships where user_id = auth.uid()), 'admin', 'the creator is admin');

select tests.authenticate_as(:'s1');
select is(public.join_organization(upper(:'code')), :'org'::uuid, 'students join with the code (any case)');
select is((select share_focus_hours from public.organization_memberships where user_id = auth.uid()), false,
  'sharing is off until the student opts in');
select throws_ok($$ select join_code from public.organizations $$, '42501', null, 'students cannot see the join code');
select tests.authenticate_as(:'s2');
select public.join_organization(:'code');
select tests.authenticate_as(:'s3');
select public.join_organization(:'code');

select tests.authenticate_as(:'admin');
select is((select count(*)::int from public.org_focus_summary(:'org') where not suppressed), 0,
  'nothing is shared before students opt in');

-- Two students opt in: still under the 3-student floor.
select tests.authenticate_as(:'s1');
select public.set_focus_sharing(:'org', true);
select tests.authenticate_as(:'s2');
select public.set_focus_sharing(:'org', true);
select tests.authenticate_as(:'admin');
select is((select suppressed from public.org_focus_summary(:'org') order by week_start desc limit 1), true,
  'weeks with fewer than 3 contributors are suppressed');

select tests.authenticate_as(:'s3');
select public.set_focus_sharing(:'org', true);
select tests.authenticate_as(:'admin');
select results_eq(format($$ select focus_hours, students_counted, suppressed from public.org_focus_summary(%L, 4) order by week_start desc limit 1 $$, :'org'),
  $$ values (6.0::numeric, 3, false) $$, 'with 3 opted-in students the week shows total hours only');
select is((select count(*)::int from public.org_focus_summary(:'org', 4)), 4, 'one row per week requested');
select is((select count(*)::int from public.organization_roster(:'org')), 4, 'admins see the roster');
select is_empty($$ select 1 from public.study_sessions $$, 'admins cannot read students'' sessions');
select is_empty($$ select 1 from public.courses $$, 'or their courses');

-- Opting out removes the student from every report, past weeks included.
select tests.authenticate_as(:'s3');
select public.set_focus_sharing(:'org', false);
select tests.authenticate_as(:'admin');
select is((select suppressed from public.org_focus_summary(:'org') order by week_start desc limit 1), true,
  'opting out removes a student''s data retroactively');

-- Students can't change anyone else's sharing, or see other students.
select tests.authenticate_as(:'s1');
select is((select count(*)::int from public.organization_memberships), 1, 'students see only their own membership');
select throws_ok(format($$ select * from public.org_focus_summary(%L) $$, :'org'), '42501', null, 'students cannot read the summary');
select throws_ok(format($$ select * from public.organization_roster(%L) $$, :'org'), '42501', null, 'or the roster');
select throws_ok($$ update public.organization_memberships set share_focus_hours = true $$, '42501', null,
  'memberships change only through the functions');

select tests.authenticate_as(:'outsider');
select is_empty($$ select 1 from public.organizations $$, 'outsiders cannot see the organization');
select throws_ok(format($$ select public.set_focus_sharing(%L, true) $$, :'org'), '42501', null,
  'non-members cannot opt in');

select * from finish();
rollback;
