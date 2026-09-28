begin;
select plan(9);

select tests.create_user('cal@example.com') as u \gset
select tests.create_user('cal-other@example.com') as o \gset
update public.profiles set timezone = 'America/Chicago' where id in (:'u', :'o');

insert into public.courses (id, user_id, name, code) values
  ('00000000-0000-0000-0000-00000000c101', :'u', 'Biology', 'BIO 201'),
  ('00000000-0000-0000-0000-00000000c102', :'o', 'Other', 'OTH 100');

-- 2027-03-01 23:30 Chicago is 2027-03-02 05:30 UTC: it belongs to March 1 locally.
insert into public.assignments (course_id, title, kind, due_at, status) values
  ('00000000-0000-0000-0000-00000000c101', 'Late night lab', 'lab', '2027-03-02 05:30Z', 'todo'),
  ('00000000-0000-0000-0000-00000000c101', 'Out of range', 'quiz', '2027-04-20 15:00Z', 'todo'),
  ('00000000-0000-0000-0000-00000000c101', 'Past due', 'assignment', '2027-03-03 15:00Z', 'todo'),
  ('00000000-0000-0000-0000-00000000c102', 'Not mine', 'exam', '2027-03-02 15:00Z', 'todo');
insert into public.study_blocks (user_id, course_id, starts_at, ends_at, kind) values
  (:'u', '00000000-0000-0000-0000-00000000c101', '2027-03-02 15:00Z', '2027-03-02 16:00Z', 'study');

select tests.authenticate_as(:'u');
create temp table c as select public.get_calendar('2027-03-01', '2027-03-31') as j;

select is((select j ->> 'timezone' from c), 'America/Chicago', 'returns the user timezone');
select is((select jsonb_array_length(j -> 'items') from c), 3, 'only own items in range');
select is((select j -> 'items' -> 0 ->> 'title' from c), 'Late night lab', 'items are in date order');
select is((select j -> 'items' -> 0 ->> 'date' from c), '2027-03-01', 'dates are local, not UTC');
select is((select j -> 'items' -> 1 ->> 'type' from c), 'study', 'study blocks are included');
select is((select (j -> 'items' -> 2 ->> 'overdue')::boolean from c), now() > '2027-03-03 15:00Z'::timestamptz,
  'open work past its due time is overdue');
select is((select jsonb_array_length(j -> 'courses') from c), 1, 'course chips are the user''s own');

select throws_ok($$ select public.get_calendar('2027-01-01', '2027-06-01') $$, '22023', null, 'long ranges are refused');
select tests.authenticate_as_anon();
select throws_ok($$ select public.get_calendar('2027-03-01', '2027-03-31') $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
