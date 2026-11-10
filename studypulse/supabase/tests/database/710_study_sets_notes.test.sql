-- Study: card sets, review state on cards, notes, and the Study screen's overview.
-- Ownership follows the course; nothing crosses between users; per-course limits hold.
begin;
delete from auth.users;
select plan(41);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.create_user('bob@example.com') as bob \gset

select tests.authenticate_as(:'bob');
insert into public.courses (name) values ('Bob course') returning id as bob_course \gset
insert into public.card_sets (course_id, title) values (:'bob_course', 'Bob set') returning id as bob_set \gset
insert into public.flashcards (course_id, set_id, front, back) values (:'bob_course', :'bob_set', 'bob term', 'bob definition') returning id as bob_card \gset
insert into public.notes (course_id, title, body) values (:'bob_course', 'Bob note', 'bob secret') returning id as bob_note \gset

select tests.authenticate_as(:'ada');
insert into public.courses (name, code) values ('Biology', 'BIO 201') returning id as bio \gset
insert into public.courses (name) values ('History') returning id as hist \gset

-- Sets and cards --------------------------------------------------------------------
select lives_ok(format($$insert into public.card_sets (id, course_id, title, description)
  values ('5e000000-0000-0000-0000-0000000000a1', %L, 'Cell structure', 'Organelles')$$, :'bio'),
  'an owner creates a set in their course');
insert into public.card_sets (id, course_id, title) values ('5e000000-0000-0000-0000-0000000000a2', :'hist', 'Dates');

select lives_ok(format($$insert into public.flashcards (id, course_id, set_id, front, back, position) values
  ('fc000000-0000-0000-0000-0000000000a1', %1$L, '5e000000-0000-0000-0000-0000000000a1', 'Mitochondrion', 'Makes ATP', 0),
  ('fc000000-0000-0000-0000-0000000000a2', %1$L, '5e000000-0000-0000-0000-0000000000a1', 'Ribosome', 'Builds proteins', 1),
  ('fc000000-0000-0000-0000-0000000000a3', %1$L, '5e000000-0000-0000-0000-0000000000a1', 'Nucleus', 'Holds DNA', 2)$$, :'bio'),
  'and adds cards to it');

select results_eq(
  $$select due_at is null, interval_days, ease, reps, lapses, starred, last_reviewed_at is null
    from public.flashcards where id = 'fc000000-0000-0000-0000-0000000000a1'$$,
  $$values (true, 0, 2.50::numeric, 0, 0, false, true)$$,
  'a new card has never been reviewed');

select throws_ok(format($$insert into public.flashcards (course_id, set_id, front, back)
  values (%L, '5e000000-0000-0000-0000-0000000000a1', 'x', 'y')$$, :'hist'),
  '23503', null, 'a card must be in a set of its own course');
select throws_ok(format($$insert into public.flashcards (course_id, front, back) values (%L, 'x', 'y')$$, :'bio'),
  '23502', null, 'a card must be in a set');
select throws_ok($$update public.flashcards set set_id = '5e000000-0000-0000-0000-0000000000a2'
  where id = 'fc000000-0000-0000-0000-0000000000a1'$$,
  '23503', null, 'a card cannot move to a set in another course');

select throws_ok(format($$insert into public.card_sets (course_id, title) values (%L, '   ')$$, :'bio'),
  '23514', null, 'a set needs a title');
select throws_ok(format($$insert into public.card_sets (course_id, title) values (%L, %L)$$, :'bio', repeat('x', 121)),
  '23514', null, 'a set title is at most 120 characters');
select throws_ok($$update public.flashcards set ease = 5 where id = 'fc000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'ease stays in range');
select throws_ok($$update public.flashcards set interval_days = -1 where id = 'fc000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'the review gap is never negative');
select throws_ok($$update public.flashcards set reps = -1 where id = 'fc000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'nor is the review count');

-- Another user's rows ------------------------------------------------------------------
select throws_ok(format($$insert into public.card_sets (course_id, title) values (%L, 'mine now')$$, :'bob_course'),
  '42501', null, 'no sets in another user''s course');
select throws_ok(format($$insert into public.flashcards (course_id, set_id, front, back) values (%L, %L, 'x', 'y')$$, :'bob_course', :'bob_set'),
  '42501', null, 'no cards in another user''s set');
select throws_ok(format($$insert into public.flashcards (course_id, set_id, front, back) values (%L, %L, 'x', 'y')$$, :'bio', :'bob_set'),
  '23503', null, 'nor a card of your own course in their set');
select throws_ok(format($$update public.card_sets set course_id = %L where id = '5e000000-0000-0000-0000-0000000000a2'$$, :'bob_course'),
  '42501', null, 'a set cannot be moved into another user''s course');
select throws_ok(format($$insert into public.notes (course_id, body) values (%L, 'x')$$, :'bob_course'),
  '42501', null, 'no notes in another user''s course');
select is_empty(format($$update public.flashcards set front = 'pwned', due_at = now() where id = %L returning 1$$, :'bob_card'),
  'another user''s card cannot be edited or rescheduled');
select is_empty(format($$delete from public.card_sets where id = %L returning 1$$, :'bob_set'),
  'another user''s set cannot be deleted');
select is_empty(format($$select 1 from public.notes where id = %L$$, :'bob_note'),
  'another user''s note cannot be read');
select is_empty(format($$update public.notes set body = 'pwned' where id = %L returning 1$$, :'bob_note'),
  'or changed');

-- Notes ---------------------------------------------------------------------------------
select lives_ok(format($$insert into public.notes (id, course_id, title, body, pinned) values
  ('40000000-0000-0000-0000-0000000000a1', %1$L, 'Lecture 9', E'# Signaling\n\nLigand :: binds a receptor', true),
  ('40000000-0000-0000-0000-0000000000a2', %1$L, '', '', false)$$, :'bio'),
  'an owner writes notes (a title and body may be empty)');
select throws_ok(format($$insert into public.notes (course_id, body) values (%L, %L)$$, :'bio', repeat('x', 100001)),
  '23514', null, 'a note is at most 100,000 characters');
select throws_ok(format($$insert into public.notes (course_id, title) values (%L, %L)$$, :'bio', repeat('x', 201)),
  '23514', null, 'a note title is at most 200 characters');
select throws_ok(format($$update public.notes set course_id = %L where id = '40000000-0000-0000-0000-0000000000a1'$$, :'bob_course'),
  '42501', null, 'a note cannot be moved into another user''s course');
select lives_ok(format($$update public.notes set course_id = %L where id = '40000000-0000-0000-0000-0000000000a2'$$, :'hist'),
  'but it can move between the owner''s courses');

-- The Study screen ------------------------------------------------------------------------
-- One card reviewed just now and due again later, one due now, one new and starred.
update public.flashcards set due_at = now() + interval '3 days', interval_days = 3, reps = 2, last_reviewed_at = now()
  where id = 'fc000000-0000-0000-0000-0000000000a1';
update public.flashcards set due_at = now() - interval '1 hour', interval_days = 1, reps = 1,
  last_reviewed_at = now() - interval '2 days' where id = 'fc000000-0000-0000-0000-0000000000a2';
update public.flashcards set starred = true where id = 'fc000000-0000-0000-0000-0000000000a3';

select public.get_study_overview() as overview \gset
select is((:'overview'::jsonb) ->> 'timezone', 'America/Chicago', 'the overview carries the student''s timezone');
select is(((:'overview'::jsonb) ->> 'reviewed_today')::int, 1, 'and how many cards were reviewed today');
select is(jsonb_array_length((:'overview'::jsonb) -> 'courses'), 2, 'the student''s courses, for the pickers');
select is(
  (select jsonb_build_array(s -> 'cards', s -> 'due', s -> 'fresh', s -> 'starred')
   from jsonb_array_elements((:'overview'::jsonb) -> 'sets') s where s ->> 'title' = 'Cell structure'),
  '[3, 1, 1, 1]'::jsonb, 'a set counts its cards: all, due, new, starred');
select is(jsonb_array_length((:'overview'::jsonb) -> 'sets'), 2, 'only the caller''s sets are listed');
select is(
  (select jsonb_agg(n ->> 'title' order by ord) from jsonb_array_elements((:'overview'::jsonb) -> 'notes') with ordinality as t(n, ord)),
  '["Lecture 9", ""]'::jsonb, 'notes come pinned first, then newest');
select is(
  (select n ->> 'excerpt' from jsonb_array_elements((:'overview'::jsonb) -> 'notes') n where n ->> 'title' = 'Lecture 9'),
  '# Signaling Ligand :: binds a receptor', 'with a one-line excerpt, not the whole body');
select ok((:'overview'::jsonb)::text not like '%bob%', 'nothing of another user appears');

update public.courses set archived_at = now() where id = :'bio';
select is(jsonb_array_length(public.get_study_overview() -> 'sets'), 1, 'archived courses drop out of the overview');
update public.courses set archived_at = null where id = :'bio';

select tests.authenticate_as_anon();
select throws_ok('select public.get_study_overview()', '42501', null, 'signed-out callers are refused');

-- Limits -------------------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.card_sets (course_id, title)
select :'hist', 'Set ' || g from generate_series(1, 199) g;
insert into public.flashcards (course_id, set_id, front, back, position)
select :'bio', '5e000000-0000-0000-0000-0000000000a1', 'term ' || g, 'definition ' || g, g from generate_series(4, 1000) g;
insert into public.notes (course_id, body)
select :'hist', 'note ' || g from generate_series(1, 499) g;

select tests.authenticate_as(:'ada');
select throws_ok(format($$insert into public.card_sets (course_id, title) values (%L, 'One too many')$$, :'hist'),
  '23514', null, 'at most 200 sets per course');
select throws_ok(format($$insert into public.flashcards (course_id, set_id, front, back)
  values (%L, '5e000000-0000-0000-0000-0000000000a1', 'x', 'y')$$, :'bio'),
  '23514', null, 'at most 1,000 cards per set');
select throws_ok(format($$insert into public.notes (course_id, body) values (%L, 'one too many')$$, :'hist'),
  '23514', null, 'at most 500 notes per course');

-- Deleting ------------------------------------------------------------------------------------
delete from public.card_sets where id = '5e000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.flashcards where course_id = :'bio'), 0, 'a set''s cards go with it');
delete from public.courses where id = :'hist';
select tests.clear_authentication();
select is(
  (select count(*)::int from public.card_sets where course_id = :'hist')
    + (select count(*)::int from public.notes where course_id = :'hist'),
  0, 'a course''s sets and notes go with it');
select is(
  (select count(*)::int from public.flashcards where id = :'bob_card')
    + (select count(*)::int from public.notes where id = :'bob_note' and body = 'bob secret'),
  2, 'and the other user''s rows are untouched');

select * from finish();
rollback;
