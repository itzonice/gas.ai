-- Launch safety S6: per-account limit on password guessing. Supabase Auth already limits
-- sign-in and sign-up requests per IP ([auth.rate_limit] in config.toml); this Auth hook
-- adds a per-email limit: 10 wrong passwords within 15 minutes lock the account's
-- password sign-in for 15 minutes. While locked, the hook answers exactly like a wrong
-- password, so a lockout never reveals whether an account exists.
--
-- Wired up in supabase/config.toml ([auth.hook.password_verification_attempt]). On hosted
-- Supabase this hook needs the Team plan; see docs/launch-checklist.md for the CAPTCHA
-- alternative.
create table private.password_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failures integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
alter table private.password_attempts enable row level security;

create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_valid boolean := coalesce((event ->> 'valid')::boolean, false);
  v_row private.password_attempts;
  -- Same words Supabase uses for a wrong password.
  v_reject jsonb := jsonb_build_object('decision', 'reject', 'message', 'Invalid login credentials',
                                       'should_logout_user', false);
begin
  select * into v_row from private.password_attempts where user_id = v_user for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return v_reject;
  end if;

  if v_valid then
    delete from private.password_attempts where user_id = v_user;
    return jsonb_build_object('decision', 'continue');
  end if;

  insert into private.password_attempts (user_id, failures, window_start)
  values (v_user, 1, now())
  on conflict (user_id) do update
    set failures = case when private.password_attempts.window_start < now() - interval '15 minutes'
                        then 1 else private.password_attempts.failures + 1 end,
        window_start = case when private.password_attempts.window_start < now() - interval '15 minutes'
                            then now() else private.password_attempts.window_start end,
        locked_until = null
  returning * into v_row;

  if v_row.failures >= 10 then
    update private.password_attempts set locked_until = now() + interval '15 minutes'
    where user_id = v_user;
  end if;
  return jsonb_build_object('decision', 'continue');
end;
$$;

revoke execute on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;
grant select, insert, update, delete on private.password_attempts to supabase_auth_admin;
