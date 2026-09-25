-- Push token registration, refresh, and cleanup.

-- Registers (or refreshes) a device's push token for the caller. A token is unique per
-- provider, so if the device was signed into another account the token moves here.
-- When the same device reports a new token (Expo/FCM/APNs rotate them), the device's
-- older tokens are retired. Registering also revives a token previously marked invalid.
create or replace function public.register_push_token(
  p_provider public.push_provider,
  p_token text,
  p_platform text,
  p_device_id text default null,
  p_app_version text default null,
  p_web_push_keys jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_provider = 'expo' and p_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'not an Expo push token' using errcode = '22023';
  end if;

  insert into public.notification_tokens (user_id, provider, token, platform, device_id, app_version, web_push_keys, last_seen_at, invalidated_at)
  values (v_user_id, p_provider, p_token, p_platform, p_device_id, p_app_version, p_web_push_keys, now(), null)
  on conflict (provider, token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_id = coalesce(excluded.device_id, public.notification_tokens.device_id),
        app_version = coalesce(excluded.app_version, public.notification_tokens.app_version),
        web_push_keys = coalesce(excluded.web_push_keys, public.notification_tokens.web_push_keys),
        last_seen_at = now(),
        invalidated_at = null
  returning id into v_id;

  -- Token refresh: older tokens from the same device are no longer valid.
  if p_device_id is not null then
    update public.notification_tokens
    set invalidated_at = now()
    where user_id = v_user_id and device_id = p_device_id and provider = p_provider
      and id <> v_id and invalidated_at is null;
  end if;

  return v_id;
end;
$$;

-- Removes a token (sign-out on a device).
create or replace function public.unregister_push_token(p_provider public.push_provider, p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notification_tokens
  where provider = p_provider and token = p_token and user_id = (select auth.uid());
$$;

-- Marks tokens the provider reported as dead (service role; used by senders).
create or replace function public.invalidate_push_tokens(p_token_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notification_tokens set invalidated_at = now()
    where id = any (p_token_ids) and invalidated_at is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- Daily cleanup: tokens invalid for a week, or not seen for 90 days (app uninstalled
-- or never opened again), are deleted.
create or replace function private.cleanup_push_tokens()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.notification_tokens
    where invalidated_at < now() - interval '7 days'
       or last_seen_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.register_push_token(public.push_provider, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.unregister_push_token(public.push_provider, text) from public, anon;
revoke execute on function public.invalidate_push_tokens(uuid[]) from public, anon, authenticated;
revoke execute on function private.cleanup_push_tokens() from public, anon, authenticated;
grant execute on function public.register_push_token(public.push_provider, text, text, text, text, jsonb) to authenticated;
grant execute on function public.unregister_push_token(public.push_provider, text) to authenticated;
grant execute on function public.invalidate_push_tokens(uuid[]) to service_role;

select cron.schedule('cleanup-push-tokens', '17 4 * * *', $$ select private.cleanup_push_tokens() $$);

-- Expo receipts arrive ~15 minutes after sending; each logged send is checked once.
alter table public.notification_log add column receipt_checked_at timestamptz;
create index notification_log_unchecked_receipts_idx on public.notification_log (created_at)
where channel = 'expo' and status = 'sent' and provider_message_id is not null and receipt_checked_at is null;
