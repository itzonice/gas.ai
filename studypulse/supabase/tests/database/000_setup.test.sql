-- Test helpers shared by every SQL test file. This file commits (no rollback) so
-- the helpers exist for the files that run after it. Test-only: never migrated.
begin;
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates an auth user (which fires the signup trigger) and returns its id.
create or replace function tests.create_user(email text, metadata jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := gen_random_uuid();
  -- Test users are adults unless a test says otherwise (launch safety S12 age gate).
  meta jsonb := case when metadata ? 'birth_month' or metadata ? 'no_birth_month' then metadata - 'no_birth_month'
                     else metadata || '{"birth_month": "1990-01"}' end;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          email, meta, now(), now());
  return user_id;
end;
$$;

-- Switches the current transaction to act as the given user through PostgREST's
-- `authenticated` role, so RLS applies exactly as it does for API requests.
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.authenticate_as_service_role()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- Back to the superuser the tests started as.
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'postgres', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select plan(1);
select has_function('tests', 'create_user', array['text', 'jsonb'], 'test helpers installed');
select * from finish();
commit;
