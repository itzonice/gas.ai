begin;
delete from auth.users;
select plan(12);

select tests.create_user('meet@example.com') as u \gset
select tests.create_user('meet-other@example.com') as o \gset

-- A timezone where the class below ended around local noon, so "yesterday/today" and the
-- 24-hour window never straddle midnight whatever time the test runs.
select name as tz from pg_timezone_names, (
  select 12 - extract(hour from (now() - interval '2 hours') at time zone 'UTC')::int as o) x
where public.is_valid_timezone(name)
order by abs(extract(epoch from utc_offset) / 3600 - x.o), name
limit 1 \gset
update public.profiles set timezone = :'tz' where id in (:'u', :'o');

-- Commit a parse that includes meetings (weekday names and ISO numbers both accepted).
insert into public.syllabus_uploads (id, user_id, source, extracted_text, status, parse_result) values (
  'd0000000-0000-0000-0000-000000000071', :'u', 'text', 'x', 'parsed',
  '{"course": {"name": "Linear Algebra", "code": "MATH 340", "term_start": null, "term_end": null},
    "categories": [], "assignments": [],
    "meetings": [
      {"weekday": "tue", "start_time": "10:00", "end_time": "10:50", "kind": "lecture", "location": "Hall 1"},
      {"weekday": "4", "start_time": "10:00", "end_time": "10:50", "kind": "lecture", "location": null},
      {"weekday": "tue", "start_time": "10:00", "end_time": "10:50", "kind": "lecture", "location": "dup"}
    ]}'::jsonb);

select tests.authenticate_as(:'u');
select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000071') as course_id \gset
select results_eq('select weekday, start_time::text, location from public.course_meetings order by weekday',
  $$ values (2::smallint, '10:00:00', 'Hall 1'), (4::smallint, '10:00:00', null) $$,
  'commit stores meetings and collapses duplicates');

-- RLS: the other user can't see or add meetings to this course.
select tests.authenticate_as(:'o');
select is_empty('select 1 from public.course_meetings', 'meetings are private to the course owner');
select throws_ok(format($$ insert into public.course_meetings (course_id, weekday, start_time, end_time)
  values (%L, 1, '09:00', '10:00') $$, :'course_id'), '42501', null, 'cannot add meetings to another user''s course');
select tests.clear_authentication();

-- A class that ended two hours ago (local noon-ish), added a day earlier.
insert into public.course_meetings (course_id, weekday, start_time, end_time, created_at)
select :'course_id', extract(isodow from l)::smallint, (l - interval '50 minutes')::time, l::time, now() - interval '1 day'
from (select date_trunc('minute', (now() - interval '2 hours') at time zone :'tz') as l) x
returning id as meeting_id \gset
-- Same weekday but added just now: its class ended before it existed, so no task.
insert into public.course_meetings (course_id, weekday, start_time, end_time, kind)
select :'course_id', extract(isodow from l)::smallint, (l - interval '50 minutes')::time, l::time, 'lab'
from (select date_trunc('minute', (now() - interval '2 hours') at time zone :'tz') as l) x;

select is(private.create_card_tasks(), 1, 'one card task for the class that just ended');
select results_eq(
  $$ select kind::text, source, estimated_minutes, due_at from public.assignments where source = 'study_system' $$,
  $$ values ('other', 'study_system', 20, date_trunc('minute', now() - interval '2 hours') + interval '24 hours') $$,
  'a 20-minute task due 24 hours after class ends');
select matches((select title from public.assignments where source = 'study_system'),
  '^Make 5–20 cards: MATH 340, ', 'the title names the course and class');
select is(private.create_card_tasks(), 0, 'running again creates nothing');

-- Students can turn card tasks off; archived courses and dates outside the term are skipped.
delete from public.assignments where source = 'study_system';
update public.profiles set card_tasks_enabled = false where id = :'u';
select is(private.create_card_tasks(), 0, 'no tasks when turned off');
update public.profiles set card_tasks_enabled = true where id = :'u';
update public.courses set term_end = current_date - 10 where id = :'course_id';
select is(private.create_card_tasks(), 0, 'no tasks after the term ends');
update public.courses set term_end = null, archived_at = now() where id = :'course_id';
select is(private.create_card_tasks(), 0, 'no tasks for archived courses');

-- The composite key keeps a task's meeting inside its own course.
update public.courses set archived_at = null where id = :'course_id';
insert into public.courses (id, user_id, name) values ('00000000-0000-0000-0000-00000000c171', :'u', 'Other');
select throws_ok(format($$ insert into public.assignments (course_id, title, meeting_id, class_date)
  values ('00000000-0000-0000-0000-00000000c171', 'x', %L, current_date) $$, :'meeting_id'),
  '23503', null, 'a task cannot point at another course''s meeting');

select is((select count(*)::int from cron.job where jobname = 'create-card-tasks'), 1, 'scheduled every 15 minutes');

select * from finish();
rollback;
