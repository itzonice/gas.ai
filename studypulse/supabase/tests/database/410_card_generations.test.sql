begin;
delete from auth.users;
delete from public.ai_cost_alerts;
select plan(8);

select tests.create_user('cards@example.com') as u \gset
select tests.create_user('cards-other@example.com') as o \gset
insert into public.courses (id, user_id, name) values ('00000000-0000-0000-0000-00000000c172', :'u', 'Bio');

-- This test is about the per-day count limit, not the spend cap (test 550): lift the cap.
update public.ai_daily_caps set cents = 1000000;

-- Service role writes (as the edge function does).
insert into public.card_generations (user_id, course_id, notes_chars, status, ai_usage)
select :'u', '00000000-0000-0000-0000-00000000c172', 500, 'done',
  '[{"step": "cards", "model": "claude-opus-5", "inputTokens": 100000, "outputTokens": 20000, "cacheReadTokens": 0}]'
from generate_series(1, 4);
-- A failure before any AI call doesn't count.
insert into public.card_generations (user_id, course_id, notes_chars, status)
values (:'u', '00000000-0000-0000-0000-00000000c172', 500, 'failed');

select lives_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, '00000000-0000-0000-0000-00000000c172', 100) $$, :'u'),
  'the 5th generation of the day is allowed on Free');
select throws_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, '00000000-0000-0000-0000-00000000c172', 100) $$, :'u'),
  'SPK01', null, 'the 6th is refused');

select tests.authenticate_as(:'u');
select results_eq('select daily_limit, used_today, remaining from public.get_card_quota()',
  $$ values (5, 5, 0) $$, 'quota for the notes screen');
select is((select count(*)::int from public.card_generations), 6, 'users see their own history');
select throws_ok($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (auth.uid(), '00000000-0000-0000-0000-00000000c172', 100) $$, '42501', null, 'clients cannot write the log');

select tests.authenticate_as(:'o');
select is_empty('select 1 from public.card_generations', 'and nobody else''s');

select tests.authenticate_as_service_role();
select results_eq('select uploads, cost_cents from public.ai_cost_by_user(now() - interval ''1 day'') where user_id = ' || quote_literal(:'u'),
  $$ values (0, 400.0000) $$, 'card generations count toward AI cost (4 x $1.00)');

-- Pro gets 50.
insert into public.subscriptions (user_id, provider, provider_subscription_id, status, current_period_end)
values (:'u', 'stripe', 'sub_cards', 'active', now() + interval '30 days');
select lives_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, '00000000-0000-0000-0000-00000000c172', 100) $$, :'u'),
  'Pro raises the limit');

select * from finish();
rollback;
