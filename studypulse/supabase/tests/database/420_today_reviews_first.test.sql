begin;
delete from auth.users;
select plan(11);

select tests.create_user('rf@example.com') as u \gset
select tests.create_user('rf-other@example.com') as o \gset
-- A timezone where it's daytime now, so today's blocks can be placed at local hours
-- relative to now without crossing midnight.
update public.profiles set daily_study_minutes = 120, timezone = (
  select tz from unnest(array['America/Chicago', 'Europe/London', 'Asia/Tokyo', 'Pacific/Honolulu', 'Asia/Kolkata', 'Pacific/Auckland']) tz
  where extract(hour from now() at time zone tz) between 8 and 18
  limit 1
) where id = :'u';

insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-0000000000f1', :'u', 'Biology');
insert into public.assignments (id, course_id, title, kind, due_at, estimated_minutes) values
  ('a0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-0000000000f1', 'Midterm', 'exam', now() + interval '3 days', 600),
  ('a0000000-0000-0000-0000-0000000000f2', 'c0000000-0000-0000-0000-0000000000f1', 'Lab', 'lab', now() + interval '1 day', 60);

-- Today: a review for the midterm (60 min, later today), a practice quiz (20 min, earlier),
-- a done review, and a missed one. Tomorrow's review doesn't show.
insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, kind, source, status) values
  (:'u', 'c0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', now() + interval '2 hours', now() + interval '3 hours', 'review', 'review_plan', 'planned'),
  (:'u', 'c0000000-0000-0000-0000-0000000000f1', null, now() + interval '1 hour', now() + interval '80 minutes', 'practice_quiz', 'practice_plan', 'planned'),
  (:'u', 'c0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', now() - interval '3 hours', now() - interval '150 minutes', 'review', 'review_plan', 'done'),
  (:'u', 'c0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', now() - interval '2 hours', now() - interval '90 minutes', 'review', 'review_plan', 'missed'),
  (:'u', 'c0000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', now() + interval '1 day', now() + interval '1 day 1 hour', 'review', 'review_plan', 'planned');

select tests.authenticate_as(:'u');
create temp table f as select * from public.get_today_feed();

select results_eq('select item_type, title from f order by rank',
  $$ values ('review', 'Review: Midterm'), ('review', 'Closed-note practice quiz'),
            ('review', 'Review: Midterm'), ('task', 'Midterm') $$,
  'review items come first in time order (done kept, missed and tomorrow left out), then tasks');
select is((select block_status::text from f where rank = 1), 'done', 'finished reviews stay so they can be unchecked');
select is((select assignment_id from f where title = 'Closed-note practice quiz'), null::uuid, 'practice quizzes have no assignment');
select is((select item_id from f where item_type = 'task'), 'a0000000-0000-0000-0000-0000000000f1'::uuid,
  'tasks use the assignment as their item');
select is((select sum(planned_minutes)::int from f where item_type = 'task'), 120 - 60 - 20,
  'planned review time comes out of the day before tasks are ranked (so the lab waits)');

-- replace_practice_plan: swaps future planned quizzes, keeps locked/finished ones.
update public.study_blocks set locked = true where kind = 'practice_quiz';
select is(public.replace_practice_plan(:'u', now(), jsonb_build_array(
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-0000000000f1', 'starts_at', now() + interval '90 minutes', 'ends_at', now() + interval '110 minutes'),
  jsonb_build_object('course_id', 'c0000000-0000-0000-0000-0000000000f1', 'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 20 minutes')
)), 1, 'a locked quiz the same day is kept, the other is added');
select is((select count(*)::int from public.study_blocks where kind = 'practice_quiz'), 2, 'no duplicates');
select is(public.replace_practice_plan(:'u', now(), '[]'::jsonb), 0, 'replacing with nothing inserts nothing');
select is((select count(*)::int from public.study_blocks where kind = 'practice_quiz'), 1,
  'unlocked planned quizzes are removed; the locked one stays');

select tests.authenticate_as(:'o');
select throws_ok(format($$ select public.replace_practice_plan(%L, now(), '[]'::jsonb) $$, :'u'),
  '42501', null, 'users cannot replace someone else''s plan');
select is_empty('select 1 from public.get_today_feed()', 'and see nothing of theirs');

select * from finish();
rollback;
