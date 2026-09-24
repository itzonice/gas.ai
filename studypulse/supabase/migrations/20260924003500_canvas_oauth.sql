-- Canvas LMS connections (OAuth2). Tokens and client secrets live only in Supabase Vault
-- (encrypted at rest with a key outside the database); tables hold Vault secret ids.
-- Everything that touches a secret is a service-role function; clients only see which
-- schools exist and whether they're connected.

create type public.lms_provider as enum ('canvas');
create type public.lms_connection_status as enum ('active', 'needs_reauth', 'revoked');

-- Schools, each with its own Canvas URL and developer key. Added by operators with
-- lms_register_institution (service role).
create table public.lms_institutions (
  id uuid primary key default gen_random_uuid(),
  provider public.lms_provider not null default 'canvas',
  name text not null check (char_length(name) between 1 and 200),
  base_url text not null unique check (base_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}$'),
  client_id text not null check (char_length(client_id) between 1 and 200),
  client_secret_id uuid not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.lms_institutions enable row level security;
revoke all on public.lms_institutions from anon, authenticated;
-- Signed-in users can list enabled schools (not their credentials).
grant select (id, provider, name, base_url, enabled) on public.lms_institutions to authenticated;
create policy "Signed-in users can see enabled schools"
on public.lms_institutions for select to authenticated
using (enabled);

-- In-flight authorizations. Only a hash of the state is stored; single use, 10 minutes.
create table public.lms_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  institution_id uuid not null references public.lms_institutions (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.lms_oauth_states enable row level security;
revoke all on public.lms_oauth_states from anon, authenticated;

create table public.lms_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  institution_id uuid not null references public.lms_institutions (id) on delete cascade,
  external_user_id text,
  external_user_name text,
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid,
  access_token_expires_at timestamptz,
  status public.lms_connection_status not null default 'active',
  last_error text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint lms_connections_user_institution_key unique (user_id, institution_id)
);

create trigger lms_connections_set_updated_at before update on public.lms_connections
for each row execute function public.set_updated_at();

alter table public.lms_connections enable row level security;
revoke all on public.lms_connections from anon, authenticated;
grant select (id, user_id, institution_id, external_user_name, status, last_error, connected_at, last_synced_at)
  on public.lms_connections to authenticated;
create policy "Users can see their own LMS connections"
on public.lms_connections for select to authenticated
using ((select auth.uid()) = user_id);

-- Vault helpers ------------------------------------------------------------------------

create or replace function private.vault_put(p_secret_id uuid, p_value text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret_id is null then
    return vault.create_secret(p_value, p_name);
  end if;
  perform vault.update_secret(p_secret_id, p_value);
  return p_secret_id;
end;
$$;

create or replace function private.vault_get(p_secret_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_secret_id;
$$;

create or replace function private.vault_delete(p_secret_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = any (p_secret_ids);
$$;

revoke execute on function private.vault_put(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.vault_get(uuid) from public, anon, authenticated;
revoke execute on function private.vault_delete(uuid[]) from public, anon, authenticated;

-- Secrets go with their rows (disconnects, account deletion, removed schools).
create or replace function private.lms_delete_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'lms_connections' then
    perform private.vault_delete(array[old.access_token_secret_id, old.refresh_token_secret_id]);
  else
    perform private.vault_delete(array[old.client_secret_id]);
  end if;
  return old;
end;
$$;
revoke execute on function private.lms_delete_secrets() from public, anon, authenticated;

create trigger lms_connections_delete_secrets after delete on public.lms_connections
for each row execute function private.lms_delete_secrets();
create trigger lms_institutions_delete_secrets after delete on public.lms_institutions
for each row execute function private.lms_delete_secrets();

-- Service-role API ------------------------------------------------------------------------

create or replace function public.lms_register_institution(
  p_name text, p_base_url text, p_client_id text, p_client_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_secret uuid;
begin
  select id, client_secret_id into v_id, v_secret from public.lms_institutions where base_url = p_base_url;
  v_secret := private.vault_put(v_secret, p_client_secret, null);
  insert into public.lms_institutions (name, base_url, client_id, client_secret_id)
  values (p_name, p_base_url, p_client_id, v_secret)
  on conflict (base_url) do update set name = excluded.name, client_id = excluded.client_id,
    client_secret_id = excluded.client_secret_id, enabled = true
  returning id into v_id;
  return v_id;
end;
$$;

-- The institution with its decrypted client secret (for the OAuth exchange).
create or replace function public.lms_institution_client(p_institution_id uuid)
returns table (id uuid, name text, base_url text, client_id text, client_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.base_url, i.client_id, private.vault_get(i.client_secret_id)
  from public.lms_institutions i
  where i.id = p_institution_id and i.enabled;
$$;

-- Starts an authorization: records the state hash. Returns nothing useful to leak.
create or replace function public.lms_begin_oauth(p_user_id uuid, p_institution_id uuid, p_state_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lms_oauth_states where expires_at < now();
  insert into public.lms_oauth_states (state_hash, user_id, institution_id)
  values (p_state_hash, p_user_id, p_institution_id);
$$;

-- Consumes a state (single use): who started it and for which school, or no row.
create or replace function public.lms_consume_oauth_state(p_state_hash text)
returns table (user_id uuid, institution_id uuid)
language sql
security definer
set search_path = ''
as $$
  delete from public.lms_oauth_states s
  where s.state_hash = p_state_hash and s.expires_at > now()
  returning s.user_id, s.institution_id;
$$;

-- Creates or replaces the user's connection to a school, storing tokens in Vault.
create or replace function public.lms_save_connection(
  p_user_id uuid,
  p_institution_id uuid,
  p_access_token text,
  p_external_user_id text default null,
  p_external_user_name text default null,
  p_refresh_token text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.lms_connections;
  v_access uuid;
  v_refresh uuid;
begin
  select * into v_conn from public.lms_connections
  where user_id = p_user_id and institution_id = p_institution_id
  for update;

  v_access := private.vault_put(v_conn.access_token_secret_id, p_access_token, null);
  v_refresh := case
    when p_refresh_token is null then v_conn.refresh_token_secret_id
    else private.vault_put(v_conn.refresh_token_secret_id, p_refresh_token, null)
  end;

  insert into public.lms_connections as c (
    user_id, institution_id, external_user_id, external_user_name, access_token_secret_id,
    refresh_token_secret_id, access_token_expires_at, status, last_error, connected_at
  ) values (
    p_user_id, p_institution_id, p_external_user_id, p_external_user_name, v_access, v_refresh,
    p_expires_at, 'active', null, now()
  )
  on conflict (user_id, institution_id) do update set
    external_user_id = coalesce(excluded.external_user_id, c.external_user_id),
    external_user_name = coalesce(excluded.external_user_name, c.external_user_name),
    access_token_secret_id = excluded.access_token_secret_id,
    refresh_token_secret_id = excluded.refresh_token_secret_id,
    access_token_expires_at = excluded.access_token_expires_at,
    status = 'active',
    last_error = null
  returning id into v_conn.id;
  return v_conn.id;
end;
$$;

-- Everything the sync needs to call Canvas for a connection, decrypted.
create or replace function public.lms_connection_credentials(p_connection_id uuid)
returns table (
  connection_id uuid, user_id uuid, status public.lms_connection_status, base_url text,
  client_id text, client_secret text, access_token text, refresh_token text,
  access_token_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.user_id, c.status, i.base_url, i.client_id, private.vault_get(i.client_secret_id),
         private.vault_get(c.access_token_secret_id), private.vault_get(c.refresh_token_secret_id),
         c.access_token_expires_at
  from public.lms_connections c
  join public.lms_institutions i on i.id = c.institution_id
  where c.id = p_connection_id;
$$;

-- After a refresh: new access token (and refresh token, if Canvas rotated it).
create or replace function public.lms_update_tokens(
  p_connection_id uuid, p_access_token text, p_expires_at timestamptz default null, p_refresh_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.lms_connections;
begin
  select * into v_conn from public.lms_connections where id = p_connection_id for update;
  if not found then
    raise exception 'connection not found' using errcode = 'P0002';
  end if;
  perform private.vault_put(v_conn.access_token_secret_id, p_access_token, null);
  if p_refresh_token is not null then
    update public.lms_connections
    set refresh_token_secret_id = private.vault_put(v_conn.refresh_token_secret_id, p_refresh_token, null)
    where id = p_connection_id;
  end if;
  update public.lms_connections
  set access_token_expires_at = p_expires_at, status = 'active', last_error = null
  where id = p_connection_id;
end;
$$;

-- The refresh token stopped working (revoked in Canvas): the user must reconnect.
create or replace function public.lms_mark_needs_reauth(p_connection_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lms_connections set status = 'needs_reauth', last_error = left(p_error, 500)
  where id = p_connection_id;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.lms_register_institution(text, text, text, text)',
    'public.lms_institution_client(uuid)',
    'public.lms_begin_oauth(uuid, uuid, text)',
    'public.lms_consume_oauth_state(text)',
    'public.lms_save_connection(uuid, uuid, text, text, text, text, timestamptz)',
    'public.lms_connection_credentials(uuid)',
    'public.lms_update_tokens(uuid, text, timestamptz, text)',
    'public.lms_mark_needs_reauth(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- Users disconnect through the canvas-oauth function (which also revokes the token at
-- Canvas); this is the database half, callable by the owner.
create or replace function public.lms_disconnect(p_connection_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.lms_connections
    where id = p_connection_id
      and (user_id = (select auth.uid()) or (select auth.role()) = 'service_role')
    returning 1
  )
  select exists (select 1 from deleted);
$$;
revoke execute on function public.lms_disconnect(uuid) from public, anon;
grant execute on function public.lms_disconnect(uuid) to authenticated, service_role;
