begin;
delete from auth.users;
select plan(13);

-- India (+5:30): "today" and the streak follow the user's timezone, not UTC.
select tests.create_user('fo@example.com', '{"timezone": "Asia/Kolkata"}') as u \gset
select tests.create_user('fo-other@example.com') as o \gset
insert into public.courses (id, user_id, name, code) values
  ('c0000000-0000-0000-0000-0000000000f1', :'u', 'Biology', 'BIO 201'),
  ('c0000000-0000-0000-0000-0000000000f2', :'o', 'Theirs', 'X 1');
insert into public.assignments (id, course_id, title, kind, due_at, status) values
  ('a0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000f1', 'Lab 3', 'lab', now() + interval '2 days', 'todo'),
  ('a0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-0000000000f1', 'Quiz 1', 'quiz', now() - interval '2 days', 'done');
insert into public.study_blocks (id, user_id, course_id, assignment_id, starts_at, ends_at, kind) values
  ('b0000000-0000-0000-0000-0000000000f1', :'u', 'c0000000-0000-0000-0000-0000000000f1',
   'a0000000-0000-0000-0000-0000000000f1', now() + interval '1 hour', now() + interval '1 hour 45 minutes', 'study');

-- Local midnight today in Kolkata, as a timestamptz.
create temp table t as
select ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata' as midnight;
grant select on t to authenticated;

-- Yesterday (a session crossing midnight: 20 of its minutes are today), 2 and 3 days ago,
-- then a gap, then 5 days ago. The other user's session never counts.
insert into public.study_sessions (user_id, course_id, assignment_id, started_at, ended_at)
select :'u'::uuid, 'c0000000-0000-0000-0000-0000000000f1'::uuid, null::uuid, midnight - interval '30 minutes', midnight + interval '20 minutes' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1',
  midnight - interval '2 days' + interval '12 hours', midnight - interval '2 days' + interval '13 hours' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000f1', null,
  midnight - interval '3 days' + interval '12 hours', midnight - interval '3 days' + interval '12 hours 30 minutes' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000f1', null,
  midnight - interval '5 days' + interval '12 hours', midnight - interval '5 days' + interval '13 hours' from t
union all select :'u', 'c0000000-0000-0000-0000-0000000000f1', null,
  midnight - interval '5 days' + interval '14 hours', midnight - interval '5 days' + interval '14 hours 30 seconds' from t
union all select :'o', 'c0000000-0000-0000-0000-0000000000f2', null, midnight + interval '1 minute', midnight + interval '9 minutes' from t;

select tests.authenticate_as(:'u');
create temp table f1 as select public.get_focus_overview() as j;
select is((select (j ->> 'streak_days')::int from f1), 3,
  'streak counts back from yesterday when nothing is logged today yet, and stops at a gap');
select is((select (j ->> 'today_minutes')::int from f1), 20,
  'only the part of a session inside the local day counts toward today');
select is((select j ->> 'today' from f1), (now() at time zone 'Asia/Kolkata')::date::text, 'today is the local date');
select ok((select j -> 'running' = 'null'::jsonb from f1), 'nothing running');
select is((select jsonb_array_length(j -> 'history') from f1), 4, 'history lists the caller''s sessions of a minute or more');
select is((select j -> 'history' -> 1 ->> 'title' from f1), 'Lab 3', 'history is newest first and names the linked task');
select is((select j -> 'history' -> 0 ->> 'title' from f1), 'Study BIO 201', 'unlinked sessions are named after the course');
select is((select jsonb_array_length(j -> 'choices') from f1), 1, 'choices are open assignments only');

select is(public.get_focus_overview(p_block_id => 'b0000000-0000-0000-0000-0000000000f1') -> 'linked' ->> 'block_minutes',
  '45', 'a linked block brings its length');
select is(public.get_focus_overview(p_assignment_id => 'a0000000-0000-0000-0000-0000000000f1') -> 'linked' ->> 'course_code',
  'BIO 201', 'a linked assignment brings its course');

-- Start studying now: today joins the streak and the running session counts toward today.
select public.start_study_session('50000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000f1',
  'a0000000-0000-0000-0000-0000000000f1', now() - interval '5 minutes');
create temp table f2 as select public.get_focus_overview() as j;
select is((select (j ->> 'streak_days')::int from f2), 4, 'studying today extends the streak');
select is((select j -> 'running' ->> 'title' from f2), 'Lab 3', 'the running session is returned');

select tests.authenticate_as_anon();
select throws_ok('select public.get_focus_overview()', '42501', null, 'anon cannot call it');

select * from finish();
rollback;
