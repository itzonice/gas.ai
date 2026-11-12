-- Launch safety S12: StudyPulse is for people 13 and older (COPPA; the audience includes
-- high schoolers). Nobody under 13 gets an account, and we keep no birth date: the
-- sign-up form sends a birth month ("YYYY-MM"), which is checked and discarded as the
-- account is created. Only the time the age was confirmed is kept.
--
-- - Email sign-ups must include birth_month. The before_user_created hook refuses a
--   missing or under-13 one with a clear message; a trigger on auth.users refuses the
--   under-13 ones again, in case the hook is off.
-- - Apple and Google sign-ups can't carry a birth month, so those accounts start
--   unconfirmed. The app asks right after sign-in (confirm_age). Under 13: the account is
--   deleted on the spot.
-- - Until the age is confirmed, an account can't finish onboarding, create a course, or
--   upload a syllabus.
--
-- Age is computed as if the birthday were the last day of the birth month, so rounding
-- never lets someone in early.

alter table public.profiles add column age_confirmed_at timestamptz;
-- Accounts created before the gate existed.
update public.profiles set age_confirmed_at = created_at where age_confirmed_at is null;

create or replace function private.age_in_years(p_birth_month text, p_on date default current_date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_birth date;
begin
  if p_birth_month is null or p_birth_month !~ '^(19|20)\d{2}-(0[1-9]|1[0-2])$' then
    return null;
  end if;
  v_birth := (to_date(p_birth_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  if v_birth > p_on then
    return null;
  end if;
  return extract(year from age(p_on, v_birth))::integer;
end;
$$;

-- Backstop on every new account: refuse under-13 birth months, and never store one.
create or replace function private.check_age_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_birth_month text := new.raw_user_meta_data ->> 'birth_month';
  v_age integer;
begin
  if v_birth_month is null then
    return new;
  end if;
  v_age := private.age_in_years(v_birth_month);
  if v_age is null then
    raise exception 'Enter a valid birth month.' using errcode = '22023';
  end if;
  if v_age < 13 then
    raise exception 'StudyPulse is for people 13 and older.' using errcode = 'SPA13';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'birth_month';
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('age_confirmed_at', now());
  return new;
end;
$$;
revoke execute on function private.check_age_on_signup() from public, anon, authenticated;

create trigger check_age_on_signup
before insert on auth.users
for each row execute function private.check_age_on_signup();

-- The profile records when the age was confirmed at sign-up (from app metadata, which
-- users can't edit).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, display_name, timezone, school, age_confirmed_at)
  values (
    new.id,
    left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 100),
    case when public.is_valid_timezone(tz) then tz else 'UTC' end,
    left(nullif(trim(new.raw_user_meta_data ->> 'school'), ''), 200),
    (new.raw_app_meta_data ->> 'age_confirmed_at')::timestamptz
  );
  return new;
end;
$$;

-- Auth hook (before_user_created): a clean refusal before anything is written.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  v_birth_month text := event -> 'user' -> 'user_metadata' ->> 'birth_month';
  v_age integer := private.age_in_years(v_birth_month);
begin
  if v_birth_month is null then
    -- Apple/Google: asked right after sign-in instead.
    if v_provider is not null and v_provider not in ('email', 'phone') then
      return '{}'::jsonb;
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'Enter your birth month and year to create an account.'));
  end if;
  if v_age is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'Enter a valid birth month and year.'));
  end if;
  if v_age < 13 then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Sorry, StudyPulse is for people 13 and older.'));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function private.age_in_years(text, date) to supabase_auth_admin;

-- For accounts that started unconfirmed (Apple/Google). Under 13: the account and
-- everything in it is deleted at once, and 'blocked' is returned.
create or replace function public.confirm_age(p_birth_month text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_age integer := private.age_in_years(p_birth_month);
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (select age_confirmed_at from public.profiles where id = v_user) is not null then
    return 'confirmed';
  end if;
  if v_age is null then
    raise exception 'Enter a valid birth month and year.' using errcode = '22023';
  end if;
  if v_age < 13 then
    delete from auth.users where id = v_user;
    return 'blocked';
  end if;
  update public.profiles set age_confirmed_at = now() where id = v_user;
  return 'confirmed';
end;
$$;
revoke execute on function public.confirm_age(text) from public, anon;
grant execute on function public.confirm_age(text) to authenticated;

-- Nothing gets created for an account whose age isn't confirmed.
create or replace function private.require_age_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select p.age_confirmed_at from public.profiles p where p.id = new.user_id) is null then
    raise exception 'Confirm your age to continue.' using errcode = 'SPA14', hint = 'age_unconfirmed';
  end if;
  return new;
end;
$$;
revoke execute on function private.require_age_confirmed() from public, anon, authenticated;

create trigger courses_require_age_confirmed
before insert on public.courses
for each row execute function private.require_age_confirmed();
create trigger syllabus_uploads_require_age_confirmed
before insert on public.syllabus_uploads
for each row execute function private.require_age_confirmed();

create or replace function public.complete_onboarding(
  p_display_name text,
  p_timezone text,
  p_daily_study_minutes int,
  p_study_start_time time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (select age_confirmed_at from public.profiles where id = v_user) is null then
    raise exception 'Confirm your age to continue.' using errcode = 'SPA14', hint = 'age_unconfirmed';
  end if;
  if not public.is_valid_timezone(p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = '22023';
  end if;
  update public.profiles
  set display_name = nullif(btrim(p_display_name), ''),
      timezone = p_timezone,
      daily_study_minutes = p_daily_study_minutes,
      study_start_time = p_study_start_time,
      onboarded_at = coalesce(onboarded_at, now())
  where id = v_user;
end;
$$;
