-- Profiles: one row per auth user, created automatically on signup.

-- Shared helper: keep updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True for region-style IANA zone names (e.g. 'America/Chicago') and 'UTC'. Rejects
-- abbreviations like 'EST' and fixed offsets like 'Etc/GMT+5', which don't follow the
-- daylight saving rules of any real place. Marked immutable so it can be
-- used in a CHECK; the zone list only changes with Postgres tzdata updates.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select tz is not null
    and (tz = 'UTC' or (tz ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' and tz !~ '^Etc/'))
    and exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create type public.plan_tier as enum ('free', 'pro');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  school text check (char_length(school) <= 200),
  -- Cached entitlement. Written only by the service role (billing webhooks);
  -- clients cannot update this column (see column grants below).
  plan_tier public.plan_tier not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.timezone is
  'IANA timezone used to compute the user''s local day, default due times, and quiet hours.';

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Clients may only edit these columns; everything else is server-managed.
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name, timezone, school) on public.profiles to authenticated;

-- Create a profile whenever a user signs up. The client may pass its detected
-- timezone as user metadata ({ "timezone": "America/Chicago" }); invalid values
-- fall back to UTC instead of failing the signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, display_name, timezone, school)
  values (
    new.id,
    left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 100),
    case when public.is_valid_timezone(tz) then tz else 'UTC' end,
    left(nullif(trim(new.raw_user_meta_data ->> 'school'), ''), 200)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
