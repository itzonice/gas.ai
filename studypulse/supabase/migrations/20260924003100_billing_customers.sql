-- Maps users to their Stripe customer. Created on first checkout by the stripe-checkout
-- function (service role); webhooks use it to find the user for a customer.

create table public.billing_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
-- Internal: service role only (no policies, no client privileges).
revoke all on public.billing_customers from anon, authenticated;
