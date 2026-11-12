-- Launch safety S5: a signed-out token can't read data.
--
-- Supabase access tokens are JWTs that stay valid until they expire (up to an hour), even
-- after the user signs out everywhere. PostgREST runs this function before every API
-- request: a signed-in request whose session no longer exists in auth.sessions (signed
-- out, revoked, or the account deleted) is refused with 401. The lookup is a primary-key
-- hit, so the cost per request is negligible. Edge functions already verify tokens with
-- the auth server (getUser), which also rejects ended sessions.
-- Its own schema, so granting API roles usage here exposes nothing else.
create schema if not exists request_guard;
revoke all on schema request_guard from public;

create or replace function request_guard.require_live_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_session uuid;
begin
  if v_claims is null or v_claims ->> 'role' is distinct from 'authenticated' then
    return; -- anon and service_role requests aren't tied to a user session
  end if;
  v_session := nullif(v_claims ->> 'session_id', '')::uuid;
  if v_session is null or not exists (select 1 from auth.sessions s where s.id = v_session) then
    raise exception 'session ended; sign in again'
      using errcode = 'PT401', hint = 'session_ended';
  end if;
end;
$$;

revoke execute on function request_guard.require_live_session() from public;
grant usage on schema request_guard to anon, authenticated;
grant execute on function request_guard.require_live_session() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request = 'request_guard.require_live_session';
notify pgrst, 'reload config';
