-- Launch safety S5: requests from a signed-out (ended) session are refused before they
-- reach any table, even though the JWT itself hasn't expired.
begin;
delete from auth.users;
select plan(9);

select tests.create_user('s5@example.com') as u \gset
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('5e550000-0000-0000-0000-000000000001', :'u', now(), now());

create temp table claims(live text, ended text, missing text);
insert into claims values (
  json_build_object('sub', :'u', 'role', 'authenticated', 'session_id', '5e550000-0000-0000-0000-000000000001')::text,
  json_build_object('sub', :'u', 'role', 'authenticated', 'session_id', '5e550000-0000-0000-0000-00000000dead')::text,
  json_build_object('sub', :'u', 'role', 'authenticated')::text
);

select is(
  (select array_to_string(setconfig, ',') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
   where r.rolname = 'authenticator') ~ 'pgrst.db_pre_request=request_guard.require_live_session',
  true, 'PostgREST runs the session check before every request');

select set_config('request.jwt.claims', (select live from claims), true);
select lives_ok('select request_guard.require_live_session()', 'a live session passes');

select set_config('request.jwt.claims', (select ended from claims), true);
select throws_ok('select request_guard.require_live_session()', 'PT401', 'session ended; sign in again',
  'a signed-out session is refused');

select set_config('request.jwt.claims', (select missing from claims), true);
select throws_ok('select request_guard.require_live_session()', 'PT401', null,
  'a user token without a session id is refused');

select set_config('request.jwt.claims', '{"role": "anon"}', true);
select lives_ok('select request_guard.require_live_session()', 'anon requests are not tied to a session');

-- Signing out everywhere deletes the sessions; the same token is then refused.
delete from auth.sessions where user_id = :'u';
select set_config('request.jwt.claims', (select live from claims), true);
select throws_ok('select request_guard.require_live_session()', 'PT401', null,
  'after a global sign-out the old token is refused');

-- PostgREST runs the check as whichever role it switched to; every API role must be able
-- to, or all of that role's requests fail (service_role once did: every edge function).
select ok(has_function_privilege('service_role', 'request_guard.require_live_session()', 'execute'),
  'service_role can run the session check');
select ok(has_function_privilege('authenticated', 'request_guard.require_live_session()', 'execute'),
  'authenticated can run the session check');
select ok(has_function_privilege('anon', 'request_guard.require_live_session()', 'execute'),
  'anon can run the session check');

select * from finish();
rollback;
