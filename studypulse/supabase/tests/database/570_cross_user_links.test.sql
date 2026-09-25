-- Cross-user suite fixes: cards can't point at another user's assignment.
begin;
delete from auth.users;
select plan(5);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset

select tests.authenticate_as(:'bob');
insert into public.courses (name) values ('Bob course') returning id as bob_course \gset
insert into public.assignments (course_id, title) values (:'bob_course', 'Bob midterm') returning id as bob_assignment \gset

select tests.authenticate_as(:'ada');
insert into public.courses (name) values ('Ada course') returning id as ada_course \gset
insert into public.assignments (course_id, title) values (:'ada_course', 'Ada quiz') returning id as ada_assignment \gset

select throws_ok(
  format($$insert into public.flashcards (course_id, assignment_id, front, back) values (%L, %L, 'q', 'a')$$, :'ada_course', :'bob_assignment'),
  '23503', null, 'a card on your course cannot link another user''s assignment');
insert into public.flashcards (course_id, assignment_id, front, back) values (:'ada_course', :'ada_assignment', 'q', 'a') returning id as card \gset
select throws_ok(
  format($$update public.flashcards set assignment_id = %L where id = %L$$, :'bob_assignment', :'card'),
  '23503', null, 'nor can an existing card be moved onto one');
select lives_ok(
  format($$update public.flashcards set assignment_id = null where id = %L$$, :'card'), 'a card can be unlinked');

select tests.clear_authentication();
update public.flashcards set assignment_id = :'ada_assignment' where id = :'card';
delete from public.assignments where id = :'ada_assignment';
select is((select course_id from public.flashcards where id = :'card'), :'ada_course'::uuid,
  'deleting the assignment keeps the card on its course');
select throws_ok(
  format($$insert into public.card_generations (user_id, course_id, assignment_id, notes_chars) values (%L, %L, %L, 10)$$, :'ada', :'ada_course', :'bob_assignment'),
  '23503', null, 'a card generation cannot link another course''s assignment');

select * from finish();
rollback;
