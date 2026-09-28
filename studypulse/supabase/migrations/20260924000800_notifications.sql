-- Notification delivery: device tokens, per-user preferences, and a log of every
-- send attempt (used for dedupe, daily caps, and debugging).

create type public.push_provider as enum ('expo', 'web_push');
create type public.notification_channel as enum ('expo', 'web_push', 'email');
create type public.notification_kind as enum (
  'due_24h', 'due_2h', 'exam_countdown', 'morning_digest', 'email_digest', 'overload_warning'
);
create type public.notification_status as enum ('sent', 'failed', 'skipped');

-- Tokens ----------------------------------------------------------------------

create table public.notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider public.push_provider not null,
  -- Expo push token, or the web push endpoint URL.
  token text not null check (char_length(token) between 1 and 2048),
  -- Web push only: { "p256dh": "...", "auth": "..." }.
  web_push_keys jsonb,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_id text check (char_length(device_id) <= 200),
  app_version text check (char_length(app_version) <= 50),
  last_seen_at timestamptz not null default now(),
  -- Set when the provider reports the token dead; invalid tokens are never used.
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A device token belongs to exactly one account at a time.
  constraint notification_tokens_provider_token_key unique (provider, token),
  constraint notification_tokens_web_push_keys check (
    provider <> 'web_push'
    -- coalesce: a NULL result would otherwise pass the check.
    or coalesce(web_push_keys ? 'p256dh' and web_push_keys ? 'auth' and token ~ '^https://', false)
  )
);

create index notification_tokens_user_idx on public.notification_tokens (user_id)
where invalidated_at is null;

-- Preferences -----------------------------------------------------------------

create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  email_digest_enabled boolean not null default false,
  remind_24h boolean not null default true,
  remind_2h boolean not null default true,
  exam_countdown boolean not null default true,
  morning_digest boolean not null default true,
  -- Local wall-clock times, interpreted in profiles.timezone.
  morning_digest_time time not null default '07:30',
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  -- Upper bound on pushes per local day.
  daily_cap smallint not null default 6 check (daily_cap between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Log --------------------------------------------------------------------------

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  channel public.notification_channel not null,
  status public.notification_status not null,
  assignment_id uuid references public.assignments (id) on delete set null,
  token_id uuid references public.notification_tokens (id) on delete set null,
  -- Identifies "the same reminder" (e.g. due_24h:{assignment_id}:{due_at}) so it is
  -- never sent twice.
  dedupe_key text not null,
  title text,
  body text,
  error text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index notification_log_user_created_idx on public.notification_log (user_id, created_at desc);
create index notification_log_user_dedupe_idx on public.notification_log (user_id, dedupe_key);

-- Triggers ---------------------------------------------------------------------

create trigger notification_tokens_set_updated_at before update on public.notification_tokens
for each row execute function public.set_updated_at();
create trigger notification_prefs_set_updated_at before update on public.notification_prefs
for each row execute function public.set_updated_at();

-- Every profile gets default preferences.
create or replace function public.create_default_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.create_default_notification_prefs() from public, anon, authenticated;

create trigger profiles_create_notification_prefs
after insert on public.profiles
for each row execute function public.create_default_notification_prefs();

-- RLS ------------------------------------------------------------------------------

alter table public.notification_tokens enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;

-- Tokens: registration goes through a server function (so a device can move between
-- accounts); clients can list and remove their own.
create policy "Users can view their own push tokens"
on public.notification_tokens for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete their own push tokens"
on public.notification_tokens for delete to authenticated
using ((select auth.uid()) = user_id);

-- Prefs: read and edit your own row (created automatically).
create policy "Users can view their own notification prefs"
on public.notification_prefs for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own notification prefs"
on public.notification_prefs for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Log: read-only history for the user; written by the service role.
create policy "Users can view their own notification log"
on public.notification_log for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.notification_tokens, public.notification_prefs, public.notification_log from anon;
revoke insert, update on public.notification_tokens from authenticated;
revoke insert, delete on public.notification_prefs from authenticated;
revoke update on public.notification_prefs from authenticated;
grant update (
  push_enabled, email_digest_enabled, remind_24h, remind_2h, exam_countdown, morning_digest,
  morning_digest_time, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, daily_cap
) on public.notification_prefs to authenticated;
revoke insert, update, delete on public.notification_log from authenticated;
