-- Launch safety S32: an admin role, stored where only the service role can write it.
--
-- An admin is a user whose auth.users.raw_app_meta_data has "role": "admin". App metadata
-- can only be changed with the service-role key (Supabase's admin API, or
-- scripts/set-admin.mjs); users can edit user_metadata but never app_metadata, and
-- user_metadata is never consulted here. The check reads the live row rather than the
-- JWT claim, so removing someone's admin role takes effect on their next request instead
-- of when their token expires. Every admin RPC and edge function checks it server-side
-- and answers 403 otherwise; every admin action is recorded.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' = 'admin' from auth.users u where u.id = auth.uid()),
    false
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- Raises insufficient_privilege (PostgREST answers 403) unless the caller is an admin.
create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke execute on function private.require_admin() from public, anon;
grant execute on function private.require_admin() to authenticated, service_role;

-- Every admin action: who, what, on what, and when. Service role and admins read it
-- through the RPCs below; nobody can edit it.
create table private.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  target_type text,
  target_id text check (char_length(target_id) <= 200),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_actions_created_at_idx on private.admin_actions (created_at desc);
revoke all on private.admin_actions from public, anon, authenticated;
grant select, insert on private.admin_actions to service_role;

-- Records an admin action (used by the admin RPCs and the admin edge functions, which
-- call it with the service role after checking the caller).
create or replace function private.log_admin_action(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.admin_actions (admin_id, action, target_type, target_id, details)
  values (p_admin_id, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function private.log_admin_action(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.log_admin_action(uuid, text, text, text, jsonb) to service_role;

-- Admin: remove reported content (S17). Same effect as the operator script's database
-- step; the script (or the storage API) still deletes an upload's stored file.
create or replace function public.admin_takedown_content(
  p_target_type text,
  p_target_id uuid,
  p_notice_ref text,
  p_received_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_owner uuid;
begin
  if char_length(coalesce(p_notice_ref, '')) not between 1 and 200 then
    raise exception 'notice reference required' using errcode = '22023';
  end if;
  v_owner := public.takedown_content(p_target_type, p_target_id, p_notice_ref, p_received_at, p_reason);
  perform private.log_admin_action(
    v_admin, 'takedown', p_target_type, p_target_id::text,
    jsonb_build_object('notice_ref', p_notice_ref, 'owner_found', v_owner is not null)
  );
  return v_owner;
end;
$$;
revoke execute on function public.admin_takedown_content(text, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.admin_takedown_content(text, uuid, text, timestamptz, text) to authenticated;

-- Admin: an account's takedown count (repeat-infringer policy).
create or replace function public.admin_takedown_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return public.takedown_count(p_user_id);
end;
$$;
revoke execute on function public.admin_takedown_count(uuid) from public, anon;
grant execute on function public.admin_takedown_count(uuid) to authenticated;

-- The admin edge functions log through this (the private schema isn't exposed to the API).
create or replace function public.record_admin_action(
  p_admin_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.log_admin_action(p_admin_id, p_action, p_target_type, p_target_id, p_details);
$$;
revoke execute on function public.record_admin_action(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_admin_action(uuid, text, text, text, jsonb) to service_role;
