-- Launch safety S7: once a user's AI spend for their local day reaches the cap, new
-- parses and card generations are refused until their next local day.
begin;
delete from auth.users;
select plan(8);

select tests.create_user('cap@example.com', '{"timezone": "Asia/Kolkata"}') as u \gset
select tests.create_user('other@example.com') as o \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-0000000000b1', :'u', 'Bio');

select is((public.ai_budget_status(:'u') ->> 'cap_cents')::int, 100, 'free plan cap is $1.00 a day');
select is((public.ai_budget_status(:'u') ->> 'exceeded')::boolean, false, 'nothing spent yet');

-- One earlier parse today that cost 120 cents (Opus 5 at the seeded price; any model works
-- because unknown models are priced at the highest rate).
insert into public.syllabus_uploads (user_id, source, extracted_text, status, error, ai_usage)
values (:'u', 'text', 'x', 'failed', 'parse failed after the AI call',
  jsonb_build_array(jsonb_build_object('model', 'claude-opus-5', 'inputTokens', 0,
    'outputTokens', (1.20 / (select output_cents_per_mtok from public.ai_model_prices where model = 'claude-opus-5') * 1000000 * 100)::int,
    'cacheReadTokens', 0)));
select ok((public.ai_budget_status(:'u') ->> 'spent_cents')::numeric >= 100, 'the spend is counted');
select is((public.ai_budget_status(:'u') ->> 'exceeded')::boolean, true, 'the cap is reached');

select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text, status)
  values (%L, 'text', 'x', 'pending') $$, :'u'), 'SPB01', null, 'a new parse is refused');
select throws_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, 'c0000000-0000-0000-0000-0000000000b1', 10) $$, :'u'), 'SPB01', null,
  'a new card generation is refused');

-- Yesterday's spend (local day) doesn't count.
update public.syllabus_uploads set created_at = now() - interval '1 day 1 hour' where user_id = :'u';
select is((public.ai_budget_status(:'u') ->> 'exceeded')::boolean, false, 'it resets the next local day');

select tests.authenticate_as(:'u');
select throws_ok(format($$ select public.ai_budget_status(%L) $$, :'u'), '42501', null,
  'clients cannot call the budget check');

select * from finish();
rollback;
