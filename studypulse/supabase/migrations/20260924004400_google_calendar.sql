-- Study system, part 4 (prompt 74): two-way Google Calendar sync. StudyPulse pushes study
-- blocks and deadlines to a dedicated calendar it creates in the student's account, and
-- reads their free/busy so the scheduler plans around their other commitments. OAuth
-- tokens live only in Vault; every function that touches them is service-role only.

-- In-flight authorizations: only a hash of the state, single use, 10 minutes.
create table public.google_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from anon, authenticated;

create table public.google_calendar_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- The dedicated "StudyPulse" calendar, created on connect (recreated if deleted).
  calendar_id text,
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid,
  access_token_expires_at timestamptz,
  status public.lms_connection_status not null default 'active',
  push_enabled boolean not null default true,
  read_busy boolean not null default true,
  last_error text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger google_calendar_connections_set_updated_at before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;
grant select (user_id, status, push_enabled, read_busy, last_error, connected_at, last_synced_at)
  on public.google_calendar_connections to authenticated;
-- Students choose what syncs; nothing else is client-writable.
grant update (push_enabled, read_busy) on public.google_calendar_connections to authenticated;
create policy "Users can see their Google Calendar connection"
on public.google_calendar_connections for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can change their Google Calendar sync options"
on public.google_calendar_connections for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Which Google event holds which StudyPulse item ("block:<id>" / "due:<id>").
create table public.google_calendar_events (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null check (item_key ~ '^(block|due):[0-9a-f-]{36}$'),
  event_id text not null,
  content_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key),
  -- Disconnecting forgets the map too.
  constraint google_calendar_events_connection_fkey foreign key (user_id)
    references public.google_calendar_connections (user_id) on delete cascade
);
alter table public.google_calendar_events enable row level security;
revoke all on public.google_calendar_events from anon, authenticated;

-- Busy time read from the student's calendars (start/end only, never event details).
create table public.external_busy_times (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null default 'google' check (source in ('google')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  constraint external_busy_times_positive check (ends_at > starts_at)
);
create index external_busy_times_user_idx on public.external_busy_times (user_id, starts_at);
alter table public.external_busy_times enable row level security;
revoke all on public.external_busy_times from anon;
revoke insert, update, delete on public.external_busy_times from authenticated;
create policy "Users can see their busy times"
on public.external_busy_times for select to authenticated
using ((select auth.uid()) = user_id);

-- Tokens go with the connection.
create or replace function private.google_delete_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.vault_delete(array[old.access_token_secret_id, old.refresh_token_secret_id]);
  return old;
end;
$$;
revoke execute on function private.google_delete_secrets() from public, anon, authenticated;
create trigger google_calendar_connections_delete_secrets after delete on public.google_calendar_connections
for each row execute function private.google_delete_secrets();

-- Service-role API -------------------------------------------------------------------------

create or replace function public.gcal_begin_oauth(p_user_id uuid, p_state_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.google_oauth_states where expires_at < now();
  insert into public.google_oauth_states (state_hash, user_id) values (p_state_hash, p_user_id);
$$;

create or replace function public.gcal_consume_oauth_state(p_state_hash text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  delete from public.google_oauth_states s
  where s.state_hash = p_state_hash and s.expires_at > now()
  returning s.user_id;
$$;

create or replace function public.gcal_save_connection(
  p_user_id uuid, p_access_token text, p_refresh_token text default null, p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.google_calendar_connections;
  v_access uuid;
  v_refresh uuid;
begin
  select * into v_conn from public.google_calendar_connections where user_id = p_user_id for update;
  v_access := private.vault_put(v_conn.access_token_secret_id, p_access_token, null);
  v_refresh := case
    when p_refresh_token is null then v_conn.refresh_token_secret_id
    else private.vault_put(v_conn.refresh_token_secret_id, p_refresh_token, null)
  end;
  insert into public.google_calendar_connections as c (
    user_id, access_token_secret_id, refresh_token_secret_id, access_token_expires_at, status, last_error, connected_at
  ) values (p_user_id, v_access, v_refresh, p_expires_at, 'active', null, now())
  on conflict (user_id) do update set
    access_token_secret_id = excluded.access_token_secret_id,
    refresh_token_secret_id = excluded.refresh_token_secret_id,
    access_token_expires_at = excluded.access_token_expires_at,
    status = 'active',
    last_error = null;
end;
$$;

create or replace function public.gcal_update_tokens(
  p_user_id uuid, p_access_token text, p_expires_at timestamptz default null, p_refresh_token text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.google_calendar_connections c set
    access_token_secret_id = private.vault_put(c.access_token_secret_id, p_access_token, null),
    refresh_token_secret_id = case when p_refresh_token is null then c.refresh_token_secret_id
      else private.vault_put(c.refresh_token_secret_id, p_refresh_token, null) end,
    access_token_expires_at = p_expires_at
  where c.user_id = p_user_id;
$$;

create or replace function public.gcal_credentials(p_user_id uuid)
returns table (
  user_id uuid, status public.lms_connection_status, calendar_id text, push_enabled boolean,
  read_busy boolean, access_token text, refresh_token text, access_token_expires_at timestamptz,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, c.status, c.calendar_id, c.push_enabled, c.read_busy,
         private.vault_get(c.access_token_secret_id), private.vault_get(c.refresh_token_secret_id),
         c.access_token_expires_at, p.timezone
  from public.google_calendar_connections c
  join public.profiles p on p.id = c.user_id
  where c.user_id = p_user_id;
$$;

-- A new calendar id (first connect, or the old one was deleted) invalidates the event map.
create or replace function public.gcal_set_calendar(p_user_id uuid, p_calendar_id text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.google_calendar_events where user_id = p_user_id;
  update public.google_calendar_connections set calendar_id = p_calendar_id where user_id = p_user_id;
$$;

create or replace function public.gcal_mark_needs_reauth(p_user_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.google_calendar_connections
  set status = 'needs_reauth', last_error = left(p_error, 500)
  where user_id = p_user_id;
$$;

create or replace function public.gcal_record_sync(p_user_id uuid, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.google_calendar_connections
  set last_synced_at = case when p_error is null then now() else last_synced_at end,
      last_error = left(p_error, 500)
  where user_id = p_user_id;
$$;

-- Replaces the user's busy times in a window. Returns whether anything changed, so the
-- caller only replans when it matters.
create or replace function public.gcal_replace_busy(p_user_id uuid, p_from timestamptz, p_to timestamptz, p_busy jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text;
  v_after text;
begin
  if jsonb_typeof(p_busy) <> 'array' or jsonb_array_length(p_busy) > 2000 then
    raise exception 'p_busy must be an array of at most 2000 ranges' using errcode = '22023';
  end if;
  select string_agg(starts_at::text || '/' || ends_at::text, ',' order by starts_at) into v_before
  from public.external_busy_times
  where user_id = p_user_id and source = 'google' and ends_at > p_from and starts_at < p_to;

  delete from public.external_busy_times
  where user_id = p_user_id and source = 'google' and ends_at > p_from and starts_at < p_to;
  insert into public.external_busy_times (user_id, source, starts_at, ends_at)
  select p_user_id, 'google', (b ->> 'startsAt')::timestamptz, (b ->> 'endsAt')::timestamptz
  from jsonb_array_elements(p_busy) b
  where (b ->> 'endsAt')::timestamptz > (b ->> 'startsAt')::timestamptz;
  -- Old ranges are no use to anyone.
  delete from public.external_busy_times where user_id = p_user_id and ends_at < now() - interval '1 day';

  select string_agg(starts_at::text || '/' || ends_at::text, ',' order by starts_at) into v_after
  from public.external_busy_times
  where user_id = p_user_id and source = 'google' and ends_at > p_from and starts_at < p_to;
  return v_before is distinct from v_after;
end;
$$;

-- Connections due for a scheduled sync: active and not synced in the last 25 minutes.
create or replace function public.gcal_connections_due(p_limit integer default 200)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id from public.google_calendar_connections c
  where c.status = 'active' and (c.last_synced_at is null or c.last_synced_at < now() - interval '25 minutes')
  order by c.last_synced_at nulls first
  limit p_limit;
$$;

-- Disconnect: the caller's own connection (or any, for the service role). Busy times go too.
create or replace function public.gcal_disconnect(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.google_calendar_connections
    where user_id = p_user_id
      and (user_id = (select auth.uid()) or (select auth.role()) = 'service_role')
    returning user_id
  ), busy as (
    delete from public.external_busy_times b using deleted d where b.user_id = d.user_id
  )
  select exists (select 1 from deleted);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.gcal_begin_oauth(uuid, text)',
    'public.gcal_consume_oauth_state(text)',
    'public.gcal_save_connection(uuid, text, text, timestamptz)',
    'public.gcal_update_tokens(uuid, text, timestamptz, text)',
    'public.gcal_credentials(uuid)',
    'public.gcal_set_calendar(uuid, text)',
    'public.gcal_mark_needs_reauth(uuid, text)',
    'public.gcal_record_sync(uuid, text)',
    'public.gcal_replace_busy(uuid, timestamptz, timestamptz, jsonb)',
    'public.gcal_connections_due(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.gcal_disconnect(uuid) from public, anon;
grant execute on function public.gcal_disconnect(uuid) to authenticated, service_role;

select cron.schedule('google-calendar-sync', '*/30 * * * *', $$ select private.invoke_edge_function('google-calendar-sync') $$);
