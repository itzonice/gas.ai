-- Fix for 20260924005300_require_live_session: PostgREST runs the pre-request check for
-- every role it switches to, including service_role (edge functions and cron jobs), which
-- had no access to the request_guard schema, so every service-role API call failed with
-- 403 "permission denied for schema request_guard". The check itself skips service_role.
grant usage on schema request_guard to service_role;
grant execute on function request_guard.require_live_session() to service_role;
