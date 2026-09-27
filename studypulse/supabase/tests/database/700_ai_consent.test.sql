-- Launch audit L2-AI: nothing goes to the AI provider until the student allows it, the
-- choice can be withdrawn, and every decision is logged.
begin;
select plan(11);

update public.ai_daily_caps set cents = 1000000;

select tests.create_user('ai-new@example.com', '{"no_ai_consent": true}') as u \gset
insert into public.courses (id, user_id, name) values ('00000000-0000-0000-0000-0000000a1c01', :'u', 'Bio');

select is((select ai_processing_allowed from public.profiles where id = :'u'), false,
  'new accounts start without AI consent');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text)
  values (%L, 'text', 'syllabus') $$, :'u'), 'SPA15', null,
  'no syllabus parse is queued without consent');
select throws_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, '00000000-0000-0000-0000-0000000a1c01', 500) $$, :'u'), 'SPA15', null,
  'no card generation is queued without consent');
select is((select count(*)::int from public.syllabus_uploads where user_id = :'u'), 0,
  'and a refused request leaves nothing behind');

select tests.authenticate_as(:'u');
select is((public.get_settings() -> 'profile' ->> 'ai_processing_allowed')::boolean, false,
  'get_settings reports the choice');
select public.set_ai_consent(true, 'prompt');
select is((public.get_settings() -> 'profile' ->> 'ai_processing_allowed')::boolean, true,
  'saying yes in the prompt turns it on');
select throws_ok($$ select public.set_ai_consent(true, 'forged') $$, '22023', null, 'only known sources');
select tests.clear_authentication();

select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text)
  values (%L, 'text', 'syllabus') $$, :'u'), 'with consent, parsing works');

select tests.authenticate_as(:'u');
select public.set_ai_consent(false, 'settings');
select tests.clear_authentication();
select throws_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, '00000000-0000-0000-0000-0000000a1c01', 500) $$, :'u'), 'SPA15', null,
  'withdrawing consent in Settings stops new requests');

select is((select string_agg(granted::text || '/' || source || '/' || policy_version, ',' order by id)
           from public.consent_log where user_id = :'u' and kind = 'ai_processing'),
  'true/prompt/2026-09-25,false/settings/2026-09-25',
  'each decision is logged with where it was made and the policy version');

select tests.authenticate_as_anon();
select throws_ok($$ select public.set_ai_consent(true, 'prompt') $$, '42501', null,
  'signed-out callers cannot set it');
select tests.clear_authentication();

select * from finish();
rollback;
