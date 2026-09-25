begin;
delete from auth.users;
delete from public.ai_cost_alerts;
select plan(10);

select tests.create_user('heavy@example.com') as heavy \gset
select tests.create_user('light@example.com') as light \gset

-- Opus 5: 100k in ($0.50) + 20k out ($0.50) + 10k cache read ($0.005) = 100.5 cents.
select is(private.ai_usage_cost_cents('[{"model": "claude-opus-5", "inputTokens": 100000, "outputTokens": 20000, "cacheReadTokens": 10000}]'),
  100.5, 'cost from recorded tokens and the price table');
select is(private.ai_usage_cost_cents('[{"model": "claude-sonnet-5", "inputTokens": 1000000, "outputTokens": 0, "cacheReadTokens": 0}]'),
  200.0, 'per-model prices');
select is(private.ai_usage_cost_cents('[{"model": "some-new-model", "inputTokens": 1000000, "outputTokens": 0, "cacheReadTokens": 0}]'),
  1000.0, 'unknown models are costed at the highest known rate');
select is(private.ai_usage_cost_cents('[]'), 0.0, 'no calls, no cost');
select is(private.ai_usage_cost_cents('"garbage"'), 0.0, 'malformed usage never errors');

-- This test is about reporting, not the daily spend cap (test 550): lift the cap.
update public.ai_daily_caps set cents = 1000000;

-- heavy: three big parses today; light: one small one.
insert into public.syllabus_uploads (user_id, source, status, ai_usage)
select :'heavy', 'text', 'processing', '[{"step": "parse", "model": "claude-opus-5", "inputTokens": 200000, "outputTokens": 40000, "cacheReadTokens": 0}]'
from generate_series(1, 3);
insert into public.syllabus_uploads (user_id, source, status, ai_usage)
values (:'light', 'text', 'processing', '[{"step": "parse", "model": "claude-opus-5", "inputTokens": 20000, "outputTokens": 4000, "cacheReadTokens": 0}]');

select tests.authenticate_as_service_role();
select results_eq($$ select user_id, uploads, cost_cents from public.ai_cost_by_user(now() - interval '1 day') $$,
  format($$ values (%L::uuid, 3, 600.0000), (%L::uuid, 1, 20.0000) $$, :'heavy', :'light'),
  'cost per user, highest first');

select results_eq($$ select user_id, cost_cents from public.record_ai_cost_alerts(100, 500) order by user_id nulls last $$,
  format($$ values (%L::uuid, 600.0000), (null::uuid, 620.0000) $$, :'heavy'),
  'alerts for the user over $1/day and for total spend over $5/day');
select is_empty($$ select 1 from public.record_ai_cost_alerts(100, 500) $$, 'each alert fires once per day');

select tests.authenticate_as(:'heavy');
select throws_ok($$ select * from public.ai_cost_by_user(now() - interval '1 day') $$, '42501', null, 'clients cannot read costs');
select throws_ok($$ select * from public.ai_model_prices $$, '42501', null, 'or prices');

select * from finish();
rollback;
