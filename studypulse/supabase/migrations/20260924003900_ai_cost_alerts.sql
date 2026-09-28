-- AI API cost per user, and alerts when it runs high.
--
-- Every AI call's token usage is already recorded per upload (syllabus_uploads.ai_usage:
-- [{ step, model, inputTokens, outputTokens, cacheReadTokens }]). Costs are computed from
-- ai_model_prices, a table (not code) so prices can be updated without a deploy. A model
-- with no price row is costed at the highest known rate, so a new or misspelled model
-- can only make alerts fire earlier, never hide spend.
--
-- The ai-cost-monitor function (hourly) records an alert, at most once per day each, when
-- a user's AI cost over the last 24 hours passes a threshold, or when total spend does.

create table public.ai_model_prices (
  model text primary key,
  -- US cents per million tokens.
  input_cents_per_mtok numeric(10, 4) not null check (input_cents_per_mtok >= 0),
  output_cents_per_mtok numeric(10, 4) not null check (output_cents_per_mtok >= 0),
  cache_read_cents_per_mtok numeric(10, 4) not null check (cache_read_cents_per_mtok >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ai_model_prices enable row level security;
revoke all on public.ai_model_prices from anon, authenticated;

-- Anthropic first-party API list prices (as of 2026-06). Cache reads use the published
-- rate where there is one, else 0.1x input.
insert into public.ai_model_prices (model, input_cents_per_mtok, output_cents_per_mtok, cache_read_cents_per_mtok) values
  ('claude-fable-5-1', 1000, 5000, 25),
  ('claude-fable-5',   1000, 5000, 100),
  ('claude-opus-5-5',  400,  2000, 20),
  ('claude-opus-5',    500,  2500, 50),
  ('claude-opus-4-8',  500,  2500, 50),
  ('claude-opus-4-7',  500,  2500, 50),
  ('claude-opus-4-6',  500,  2500, 50),
  ('claude-sonnet-5',  200,  1000, 20),
  ('claude-sonnet-4-6', 300, 1500, 30),
  ('claude-haiku-4-5', 100,  500,  10);

create table public.ai_cost_alerts (
  id bigint generated always as identity primary key,
  -- null: the total across all users.
  user_id uuid references public.profiles (id) on delete cascade,
  alert_date date not null,
  cost_cents numeric(12, 4) not null,
  threshold_cents numeric(12, 4) not null,
  uploads integer not null,
  created_at timestamptz not null default now()
);
create unique index ai_cost_alerts_user_day on public.ai_cost_alerts (user_id, alert_date) where user_id is not null;
create unique index ai_cost_alerts_total_day on public.ai_cost_alerts (alert_date) where user_id is null;
alter table public.ai_cost_alerts enable row level security;
revoke all on public.ai_cost_alerts from anon, authenticated;

-- Cost in cents of one upload's recorded AI calls.
create or replace function private.ai_usage_cost_cents(p_usage jsonb)
returns numeric
language sql
stable
set search_path = ''
as $$
  with fallback as (
    select max(input_cents_per_mtok) as i, max(output_cents_per_mtok) as o, max(cache_read_cents_per_mtok) as c
    from public.ai_model_prices
  )
  select coalesce(sum(
      coalesce((u ->> 'inputTokens')::numeric, 0) * coalesce(p.input_cents_per_mtok, f.i)
    + coalesce((u ->> 'outputTokens')::numeric, 0) * coalesce(p.output_cents_per_mtok, f.o)
    + coalesce((u ->> 'cacheReadTokens')::numeric, 0) * coalesce(p.cache_read_cents_per_mtok, f.c)
  ) / 1000000, 0)
  from jsonb_array_elements(case when jsonb_typeof(p_usage) = 'array' then p_usage else '[]' end) u
  cross join fallback f
  left join public.ai_model_prices p on p.model = u ->> 'model';
$$;
revoke execute on function private.ai_usage_cost_cents(jsonb) from public, anon, authenticated;

-- AI cost per user between p_since and p_until (inclusive), highest first. Service role only.
create or replace function public.ai_cost_by_user(p_since timestamptz, p_until timestamptz default now())
returns table (user_id uuid, uploads integer, cost_cents numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, count(*)::integer, round(sum(private.ai_usage_cost_cents(s.ai_usage)), 4)
  from public.syllabus_uploads s
  where s.created_at >= p_since and s.created_at <= p_until and s.ai_usage <> '[]'::jsonb
  group by s.user_id
  order by 3 desc;
$$;

-- Records new alerts for the last 24 hours (at most one per user per day, and one for
-- the total) and returns only the ones created by this call. Service role only.
create or replace function public.record_ai_cost_alerts(p_user_threshold_cents numeric, p_total_threshold_cents numeric)
returns table (user_id uuid, cost_cents numeric, threshold_cents numeric, uploads integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'UTC')::date;
begin
  return query
  with per_user as (
    select * from public.ai_cost_by_user(now() - interval '24 hours')
  ),
  user_alerts as (
    insert into public.ai_cost_alerts (user_id, alert_date, cost_cents, threshold_cents, uploads)
    select pu.user_id, v_today, pu.cost_cents, p_user_threshold_cents, pu.uploads
    from per_user pu
    where pu.cost_cents >= p_user_threshold_cents
    on conflict (user_id, alert_date) where user_id is not null do nothing
    returning ai_cost_alerts.user_id, ai_cost_alerts.cost_cents, ai_cost_alerts.threshold_cents, ai_cost_alerts.uploads
  ),
  total_alert as (
    insert into public.ai_cost_alerts (user_id, alert_date, cost_cents, threshold_cents, uploads)
    select null, v_today, sum(pu.cost_cents), p_total_threshold_cents, sum(pu.uploads)::integer
    from per_user pu
    having coalesce(sum(pu.cost_cents), 0) >= p_total_threshold_cents
    on conflict (alert_date) where user_id is null do nothing
    returning ai_cost_alerts.user_id, ai_cost_alerts.cost_cents, ai_cost_alerts.threshold_cents, ai_cost_alerts.uploads
  )
  select * from user_alerts
  union all
  select * from total_alert;
end;
$$;

revoke execute on function public.ai_cost_by_user(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_ai_cost_alerts(numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_cost_by_user(timestamptz, timestamptz) to service_role;
grant execute on function public.record_ai_cost_alerts(numeric, numeric) to service_role;

select cron.schedule('ai-cost-monitor', '7 * * * *', $$ select private.invoke_edge_function('ai-cost-monitor') $$);
