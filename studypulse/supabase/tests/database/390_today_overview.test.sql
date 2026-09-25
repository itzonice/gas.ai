begin;
select plan(10);

select tests.create_user('today@example.com') as u \gset
select tests.create_user('other@example.com') as o \gset
update public.profiles set timezone = 'America/Chicago' where id in (:'u', :'o');

insert into public.courses (id, user_id, name, code, color, target_grade) values
  ('00000000-0000-0000-0000-00000000c001', :'u', 'Biology', 'BIO 201', '#1E88E5', 90),
  ('00000000-0000-0000-0000-00000000c002', :'u', 'Chemistry', 'CHEM 230', '#E53935', 80),
  ('00000000-0000-0000-0000-00000000c003', :'o', 'Other', 'OTH 100', null, 99);

-- BIO: 70% against a 90 target (at risk). CHEM: 85% against 80 (fine).
insert into public.assignments (course_id, title, kind, due_at, status, points_earned, points_possible) values
  ('00000000-0000-0000-0000-00000000c001', 'Quiz 1', 'quiz', now() - interval '3 days', 'done', 7, 10),
  ('00000000-0000-0000-0000-00000000c002', 'Quiz 1', 'quiz', now() - interval '3 days', 'done', 85, 100),
  ('00000000-0000-0000-0000-00000000c003', 'Other quiz', 'quiz', now() - interval '3 days', 'done', 1, 10);

-- Open work: one due in an hour, one next month, one done, and an upcoming exam.
insert into public.assignments (id, course_id, title, kind, due_at, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c001', 'Lab 1', 'lab', now() + interval '1 hour', 'todo'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000c001', 'Paper', 'project', now() + interval '40 days', 'todo'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000c002', 'Done lab', 'lab', now() + interval '1 hour', 'done'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c002', 'Midterm', 'exam', now() + interval '30 days', 'todo'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000c003', 'Other exam', 'exam', now() + interval '2 days', 'todo');

-- A review block today (local), a study block today, and a review block tomorrow.
insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, kind) values
  (:'u', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a4',
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '23 hours') at time zone 'America/Chicago',
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '23 hours 30 minutes') at time zone 'America/Chicago', 'review'),
  (:'u', '00000000-0000-0000-0000-00000000c001', null,
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '1 hour') at time zone 'America/Chicago',
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '2 hours') at time zone 'America/Chicago', 'study'),
  (:'u', '00000000-0000-0000-0000-00000000c001', null,
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '25 hours') at time zone 'America/Chicago',
   (date_trunc('day', now() at time zone 'America/Chicago') + interval '26 hours') at time zone 'America/Chicago', 'review');

-- 45 finished minutes at the start of this local week, plus one still running.
insert into public.study_sessions (user_id, course_id, started_at, ended_at) values
  (:'u', '00000000-0000-0000-0000-00000000c001',
   date_trunc('week', now() at time zone 'America/Chicago') at time zone 'America/Chicago',
   (date_trunc('week', now() at time zone 'America/Chicago') + interval '45 minutes') at time zone 'America/Chicago'),
  (:'u', '00000000-0000-0000-0000-00000000c001', now() - interval '5 minutes', null);

select tests.authenticate_as(:'u');
create temp table o as select public.get_today_overview() as j;

select is((select j ->> 'today' from o), (now() at time zone 'America/Chicago')::date::text, 'today is the local date');
select is((select j ->> 'week_start' from o),
  date_trunc('week', now() at time zone 'America/Chicago')::date::text, 'weeks start Monday');
select is((select (j ->> 'due_this_week')::int from o),
  case when (now() at time zone 'America/Chicago' + interval '1 hour')::date
            <= date_trunc('week', now() at time zone 'America/Chicago')::date + 6 then 1 else 0 end,
  'due this week counts only open work due before Sunday ends');
select is((select (j ->> 'focus_minutes_this_week')::int from o), 45, 'focus minutes count finished sessions only');
select is((select jsonb_agg(jsonb_build_array(r ->> 'code', round((r ->> 'current')::numeric), round((r ->> 'target')::numeric)))
    from o, jsonb_array_elements(j -> 'courses_at_risk') r),
  '[["BIO 201", 70, 90]]'::jsonb, 'courses below target are at risk; other users are invisible');
select is((select jsonb_array_length(j -> 'reviews') from o), 1, 'only review blocks on the local day');
select is((select j -> 'reviews' -> 0 ->> 'title' from o), 'Midterm', 'reviews carry the assignment title');
select is((select j -> 'next_exam' ->> 'title' from o), 'Midterm', 'next exam is the user''s own');
select is((select jsonb_agg(c ->> 'code') from o, jsonb_array_elements(j -> 'courses') c),
  '["BIO 201", "CHEM 230"]'::jsonb, 'courses for chips');

select tests.authenticate_as_anon();
select throws_ok($$ select public.get_today_overview() $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
