-- Launch safety S9: when an outside provider (AI, Stripe, Expo, Resend, Google, ...) keeps
-- failing, every edge function stops calling it for 5 minutes. Each worker keeps its own
-- breaker (packages/core/src/resilience); this table shares "open until" between workers
-- and cron runs, so a new invocation doesn't start hammering a provider that's down.

create table private.provider_circuits (
  provider text primary key check (provider ~ '^[a-z]{2,20}$'),
  open_until timestamptz not null,
  opened_count integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Providers that are off limits right now (service role only).
create or replace function public.provider_circuits_open()
returns table (provider text, open_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.provider, c.open_until from private.provider_circuits c where c.open_until > now();
$$;

-- Record that a worker opened a provider's breaker; never shortens an existing pause, and
-- never pauses longer than 15 minutes whatever the caller asks.
create or replace function public.open_provider_circuit(p_provider text, p_until timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.provider_circuits as c (provider, open_until)
  values (p_provider, least(p_until, now() + interval '15 minutes'))
  on conflict (provider) do update
    set open_until = greatest(c.open_until, excluded.open_until),
        opened_count = c.opened_count + 1,
        updated_at = now();
$$;

revoke all on private.provider_circuits from public, anon, authenticated;
revoke execute on function public.provider_circuits_open() from public, anon, authenticated;
revoke execute on function public.open_provider_circuit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.provider_circuits_open() to service_role;
grant execute on function public.open_provider_circuit(text, timestamptz) to service_role;
