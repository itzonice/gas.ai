-- Launch safety S30: SECURITY DEFINER functions run with the owner's rights and bypass RLS,
-- so any that signed-in or anonymous users can call must decide for themselves who the
-- caller is. This fails when one doesn't check auth.uid() (directly, or through a helper
-- that does), when one can be called without signing in, or when one leaves search_path
-- unpinned. It also pins the list of RPCs signed-in users can call, so exposing a new one
-- is a deliberate, reviewed change.
begin;
select plan(5);

create temp table our_functions as
select p.oid, n.nspname, p.proname, p.prosrc, p.prosecdef, p.proconfig,
  n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private', 'request_guard')
  and p.prokind = 'f'
  -- Functions that belong to extensions aren't ours to audit.
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- Reviewed exceptions, with the reason. Keep this list short.
create temp table definer_exceptions (signature text primary key, reason text not null);
insert into definer_exceptions values
  ('request_guard.require_live_session()',
   'PostgREST pre-request hook (S5): runs for every request, signed in or not, reads only '
   'whether the JWT''s session still exists, and returns nothing.');

-- Helpers that establish who the caller is: they read auth.uid() themselves.
create temp table auth_helpers as
select nspname || '.' || proname as qualified from our_functions where prosrc ~ 'auth\.uid\(\)';

select is(
  (select array_agg(signature order by signature) from our_functions f
   where f.prosecdef
     and (has_function_privilege('anon', f.oid, 'EXECUTE')
       or has_function_privilege('authenticated', f.oid, 'EXECUTE'))
     and f.prosrc !~ 'auth\.uid\(\)'
     and not exists (
       select 1 from auth_helpers h where position(h.qualified || '(' in f.prosrc) > 0)
     and f.signature not in (select signature from definer_exceptions)),
  null,
  'every SECURITY DEFINER function a user can call checks auth.uid(), directly or through a helper'
);

select is(
  (select array_agg(signature order by signature) from our_functions f
   where f.prosecdef and has_function_privilege('anon', f.oid, 'EXECUTE')
     and f.signature not in (select signature from definer_exceptions)),
  null,
  'no SECURITY DEFINER function can be called without signing in'
);

select is(
  (select array_agg(signature order by signature) from our_functions f
   where f.prosecdef
     and not exists (
       select 1 from unnest(coalesce(f.proconfig, '{}')) c where c like 'search_path=%')),
  null,
  'every SECURITY DEFINER function pins its search_path'
);

-- Every RPC a signed-in user can call. Adding one means adding it here after checking its
-- auth (above), its zod wrapper in packages/core/src/api/client.ts (rpc-validation test),
-- and whether it needs a rate limit. Pure helpers are used inside views and policies.
select is(
  (select array_agg(proname::text order by proname) from our_functions f
   where f.nspname = 'public'
     and f.oid not in (select p.oid from pg_proc p where p.prorettype = 'trigger'::regtype)
     and has_function_privilege('authenticated', f.oid, 'EXECUTE')),
  array[
    'accept_terms', 'billing_status', 'commit_parsed_syllabus', 'complete_onboarding',
    'confirm_age', 'course_current_grade', 'create_organization',
    'default_task_minutes', -- pure helper
    'gcal_disconnect', 'get_calendar', 'get_card_quota', 'get_courses_overview',
    'get_focus_overview', 'get_parse_quota', 'get_settings', 'get_stats_overview',
    'get_today_feed', 'get_today_overview', 'is_pro',
    'is_valid_letter_scale', 'is_valid_timezone', -- pure helpers (check constraints)
    'join_organization', 'leave_organization',
    'letter_for', -- pure helper
    'lms_disconnect', 'org_focus_summary', 'organization_roster', 'register_push_token',
    'replace_practice_plan', 'replace_review_plan', 'replace_study_plan',
    'revoke_calendar_token', 'rotate_calendar_token', 'rotate_join_code', 'set_focus_sharing',
    'set_privacy_choices', 'start_study_session', 'stop_study_session',
    'study_capacity', 'task_priority', -- pure helpers (ranking)
    'terms_current', 'unregister_push_token'
  ]::text[],
  'the RPCs signed-in users can call are exactly the reviewed list'
);

-- The check itself works: a definer function without a caller check is caught.
create function public.s30_unguarded_probe() returns int
  language sql security definer set search_path = '' as $$ select 1 $$;
grant execute on function public.s30_unguarded_probe() to authenticated;
select ok(
  (select count(*) from pg_proc p where p.proname = 's30_unguarded_probe' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prosrc !~ 'auth\.uid\(\)') = 1,
  'an unguarded definer function would be flagged'
);

select * from finish();
rollback;
