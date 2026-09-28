-- Billing webhook processing: an event ledger for idempotency, and one function that
-- records an event and applies its subscription change atomically.
--
-- - Idempotent on event id: a redelivered event finds its ledger row and does nothing.
-- - Ordered: a subscription row only changes if the event is not older than the one that
--   last wrote it (provider_updated_at), so out-of-order deliveries can't roll back state.
-- - The cached profiles.plan_tier is recomputed from subscriptions after each change.

create table public.billing_events (
  provider public.billing_provider not null,
  event_id text not null check (char_length(event_id) between 1 and 255),
  event_type text not null,
  event_created_at timestamptz not null,
  -- Cascades with account deletion; later redeliveries then resolve to unknown_user.
  user_id uuid references public.profiles (id) on delete cascade,
  -- applied | ignored | stale | unknown_user
  result text,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Pro while any subscription is in a state that grants access.
create or replace function private.refresh_plan_tier(p_user_id uuid)
returns public.plan_tier
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier public.plan_tier;
begin
  v_tier := case when exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and s.status in ('trialing', 'active', 'past_due', 'in_grace')
  ) then 'pro' else 'free' end;
  update public.profiles set plan_tier = v_tier where id = p_user_id and plan_tier is distinct from v_tier;
  return v_tier;
end;
$$;
revoke execute on function private.refresh_plan_tier(uuid) from public, anon, authenticated;

-- p_subscription (null for events that change nothing): {
--   provider_subscription_id, provider_customer_id, user_id?, product_id, status,
--   current_period_end, cancel_at_period_end, canceled_at, grace_period_ends_at? }
-- Returns applied | duplicate | ignored | stale | unknown_user.
create or replace function public.apply_billing_event(
  p_provider public.billing_provider,
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_subscription jsonb default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub_id text := p_subscription ->> 'provider_subscription_id';
  v_customer text := p_subscription ->> 'provider_customer_id';
  v_claimed_user uuid;
  v_user uuid;
  v_changed boolean;
  v_result text;
begin
  insert into public.billing_events (provider, event_id, event_type, event_created_at)
  values (p_provider, p_event_id, p_event_type, p_event_created_at)
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_subscription is null then
    v_result := 'ignored';
  else
    if v_sub_id is null or p_subscription ->> 'status' is null then
      raise exception 'subscription needs provider_subscription_id and status' using errcode = '22023';
    end if;

    -- Who owns it: the existing row, else the user id the checkout stamped on it (if that
    -- user exists), else the provider customer we created for the user.
    select s.user_id into v_user from public.subscriptions s
    where s.provider = p_provider and s.provider_subscription_id = v_sub_id;
    if v_user is null and p_subscription ->> 'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_claimed_user := (p_subscription ->> 'user_id')::uuid;
      select p.id into v_user from public.profiles p where p.id = v_claimed_user;
    end if;
    if v_user is null and p_provider = 'stripe' and v_customer is not null then
      select c.user_id into v_user from public.billing_customers c where c.stripe_customer_id = v_customer;
    end if;

    if v_user is null then
      v_result := 'unknown_user';
    else
      insert into public.subscriptions as s (
        user_id, provider, provider_subscription_id, provider_customer_id, product_id, status,
        current_period_end, cancel_at_period_end, grace_period_ends_at, canceled_at, provider_updated_at
      ) values (
        v_user, p_provider, v_sub_id, v_customer, p_subscription ->> 'product_id',
        (p_subscription ->> 'status')::public.subscription_status,
        (p_subscription ->> 'current_period_end')::timestamptz,
        coalesce((p_subscription ->> 'cancel_at_period_end')::boolean, false),
        (p_subscription ->> 'grace_period_ends_at')::timestamptz,
        (p_subscription ->> 'canceled_at')::timestamptz,
        p_event_created_at
      )
      on conflict (provider, provider_subscription_id) do update set
        provider_customer_id = coalesce(excluded.provider_customer_id, s.provider_customer_id),
        product_id = coalesce(excluded.product_id, s.product_id),
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        grace_period_ends_at = excluded.grace_period_ends_at,
        canceled_at = excluded.canceled_at,
        provider_updated_at = excluded.provider_updated_at
      where s.provider_updated_at is null or s.provider_updated_at <= excluded.provider_updated_at;
      v_changed := found;

      if v_changed then
        perform private.refresh_plan_tier(v_user);
        v_result := 'applied';
      else
        v_result := 'stale';
      end if;
    end if;
  end if;

  update public.billing_events set result = v_result, user_id = v_user
  where provider = p_provider and event_id = p_event_id;
  return v_result;
end;
$$;

revoke execute on function public.apply_billing_event(public.billing_provider, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_event(public.billing_provider, text, text, timestamptz, jsonb) to service_role;
