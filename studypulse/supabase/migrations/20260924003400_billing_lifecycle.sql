-- Billing lifecycle: where each subscription was bought, partial updates (a refund only
-- knows the new status), and one status summary for every client.

alter table public.subscriptions
  add column store text check (store in ('stripe', 'app_store', 'play_store', 'amazon', 'promotional', 'other'));
update public.subscriptions set store = 'stripe' where provider = 'stripe' and store is null;

-- Same contract as before, except that on an existing row only the keys present in
-- p_subscription change (a refund event sends just the status), and `store` is kept.
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
        current_period_end, cancel_at_period_end, grace_period_ends_at, canceled_at, store,
        provider_updated_at
      ) values (
        v_user, p_provider, v_sub_id, v_customer, p_subscription ->> 'product_id',
        (p_subscription ->> 'status')::public.subscription_status,
        (p_subscription ->> 'current_period_end')::timestamptz,
        coalesce((p_subscription ->> 'cancel_at_period_end')::boolean, false),
        (p_subscription ->> 'grace_period_ends_at')::timestamptz,
        (p_subscription ->> 'canceled_at')::timestamptz,
        p_subscription ->> 'store',
        p_event_created_at
      )
      on conflict (provider, provider_subscription_id) do update set
        provider_customer_id = coalesce(excluded.provider_customer_id, s.provider_customer_id),
        product_id = coalesce(excluded.product_id, s.product_id),
        store = coalesce(excluded.store, s.store),
        -- A refund is the more specific ending; the cancellation that follows keeps it.
        status = case when s.status = 'refunded' and excluded.status in ('canceled', 'expired')
                      then s.status else excluded.status end,
        current_period_end = case when p_subscription ? 'current_period_end' then excluded.current_period_end else s.current_period_end end,
        cancel_at_period_end = case when p_subscription ? 'cancel_at_period_end' then excluded.cancel_at_period_end else s.cancel_at_period_end end,
        grace_period_ends_at = case when p_subscription ? 'grace_period_ends_at' then excluded.grace_period_ends_at else s.grace_period_ends_at end,
        canceled_at = case when p_subscription ? 'canceled_at' then excluded.canceled_at else s.canceled_at end,
        provider_updated_at = excluded.provider_updated_at
      where s.provider_updated_at is null or s.provider_updated_at <= excluded.provider_updated_at;

      if found then
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

-- The signed-in user's billing state, for settings and paywall screens on every
-- platform. `subscription` is the one that grants Pro (else the most recent), and
-- `manage_in` says where it can be changed: web purchases in the Stripe portal, store
-- purchases only in that store (a web page can't manage an App Store subscription).
create or replace function public.billing_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  ranked as (
    select s.*,
      private.subscription_grants_pro(s.status, s.current_period_end, s.grace_period_ends_at, now()) as grants
    from public.subscriptions s, me
    where s.user_id = me.id
  ),
  best as (
    select * from ranked order by grants desc, coalesce(current_period_end, created_at) desc limit 1
  )
  select jsonb_build_object(
    'pro', coalesce((select grants from best), false),
    'subscription', (
      select jsonb_build_object(
        'provider', provider, 'store', store, 'status', status, 'product_id', product_id,
        'current_period_end', current_period_end, 'cancel_at_period_end', cancel_at_period_end,
        'grace_period_ends_at', grace_period_ends_at, 'grants_pro', grants
      ) from best
    ),
    'manage_in', (
      select case
        when provider = 'stripe' then 'stripe_portal'
        when store in ('app_store', 'play_store', 'amazon') then store
        else null
      end from best
    ),
    -- In billing-retry grace: the app should ask the user to update their payment method.
    'payment_issue', coalesce((select status in ('past_due', 'in_grace') from best), false)
  )
  from me
  where me.id is not null;
$$;

revoke execute on function public.billing_status() from public, anon;
grant execute on function public.billing_status() to authenticated;
