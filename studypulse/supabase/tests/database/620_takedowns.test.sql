-- Launch safety S17: takedowns remove the item, keep a record, and are service-only.
begin;
select plan(7);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as(:'ada');
insert into public.courses (name) values ('Bio') returning id as course \gset
insert into public.flashcards (course_id, front, back) values (:'course', 'q', 'a') returning id as card \gset
select throws_ok(format($$ select public.takedown_content('flashcard', %L, 'T-1', now()) $$, :'card'),
  '42501', null, 'users cannot take down content');
select tests.clear_authentication();

insert into public.syllabus_uploads (user_id, source, extracted_text, status)
values (:'ada', 'text', 'copied chapter', 'pending') returning id as upload \gset

select tests.authenticate_as_service_role();
select is(public.takedown_content('flashcard', :'card', 'T-1', now() - interval '1 day', 'textbook excerpt'),
  :'ada'::uuid, 'returns the owner');
select is(public.takedown_content('syllabus_upload', :'upload', 'T-2', now()), :'ada'::uuid,
  'uploads can be taken down');
select is(public.takedown_count(:'ada'), 2, 'the owner''s takedowns are counted');
select tests.clear_authentication();

select is_empty(format('select 1 from public.flashcards where id = %L', :'card'), 'the card is gone');
select is((select (extracted_text is null, status::text) from public.syllabus_uploads where id = :'upload')::text,
  '(t,failed)', 'the upload''s text is cleared and it is marked removed');
select is((select count(*)::int from private.content_takedowns where user_id = :'ada'), 2,
  'every takedown is recorded');

select * from finish();
rollback;
