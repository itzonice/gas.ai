-- EXPLAIN ANALYZE of every statement inside get_today_feed() and get_calendar(), run as
-- the demo user through RLS (launch safety S8). For realistic numbers, seed volume first:
--   psql "$DB_URL" -v users=3000 -f load/seed-load.sql
--   psql "$DB_URL" -f load/explain-today-calendar.sql 2>&1 | less
select id as demo from auth.users where email = 'demo@studypulse.dev' \gset
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_analyze = on;
set auto_explain.log_nested_statements = on;
set auto_explain.log_level = notice;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'demo', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.get_today_feed();
select length(public.get_calendar(current_date - 7, current_date + 34)::text);
rollback;
