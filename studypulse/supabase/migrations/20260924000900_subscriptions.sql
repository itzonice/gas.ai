-- Billing subscriptions from Stripe (web) and RevenueCat (iOS/Android). Written only
-- by webhook handlers running as the service role; users can read their own.

create type public.billing_provider as enum ('stripe', 'revenuecat');
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'in_grace', 'paused', 'canceled', 'expired', 'refunded'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.billing_provider not null,
  -- Stripe subscription id (sub_...) or RevenueCat original transaction id.
  provider_subscription_id text not null,
  provider_customer_id text,
  product_id text,
  status public.subscription_status not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Billing-retry window during which access continues after a failed renewal.
  grace_period_ends_at timestamptz,
  canceled_at timestamptz,
  -- Provider timestamp of the event that produced this state; older events are ignored.
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_subscription_key unique (provider, provider_subscription_id)
);

create index subscriptions_user_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

create policy "Users can view their own subscriptions"
on public.subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

-- No write policies, and no write privileges: only service_role (which bypasses RLS)
-- can insert, update, or delete.
revoke all on public.subscriptions from anon;
revoke insert, update, delete, truncate on public.subscriptions from authenticated;
