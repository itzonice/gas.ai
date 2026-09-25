-- Per-user ICS calendar feed behind a secret URL. Only a SHA-256 hash of the token is
-- stored; the token itself is shown once when created. Rotating replaces the old URL.
alter table public.profiles
  add column calendar_token_hash text unique
    constraint profiles_calendar_token_hash_format check (calendar_token_hash ~ '^[0-9a-f]{64}$');

-- Creates (or replaces) the caller's feed token and returns it. The old URL stops working.
create or replace function public.rotate_calendar_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- 32 random bytes, URL-safe base64 without padding.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.profiles
  set calendar_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
  where id = v_user_id;
  return v_token;
end;
$$;

-- Turns the feed off.
create or replace function public.revoke_calendar_token()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set calendar_token_hash = null where id = (select auth.uid());
$$;

revoke execute on function public.rotate_calendar_token() from public, anon;
revoke execute on function public.revoke_calendar_token() from public, anon;
grant execute on function public.rotate_calendar_token() to authenticated;
grant execute on function public.revoke_calendar_token() to authenticated;
