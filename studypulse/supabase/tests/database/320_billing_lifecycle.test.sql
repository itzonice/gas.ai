begin;
delete from auth.users;
select plan(12);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('ios@example.com') as ios \gset
select tests.create_user('free@example.com') as free \gset
select tests.authenticate_as_service_role();

-- Web subscriber, later fully refunded -------------------------------------------------
select public.apply_billing_event('stripe', 'evt_1', 'customer.subscription.created', now() - interval '2 days',
  format('{"provider_subscription_id": "sub_1", "provider_customer_id": "cus_1", "user_id": "%s", "product_id": "price_m", "status": "active", "current_period_end": "%s", "cancel_at_period_end": false, "store": "stripe"}',
    :'ada', now() + interval '28 days')::jsonb);
select is(public.apply_billing_event('stripe', 'evt_2', 'charge.refunded', now() - interval '1 day',
  '{"provider_subscription_id": "sub_1", "status": "refunded", "canceled_at": "2027-03-01T00:00:00Z"}'),
  'applied', 'a refund is a partial update');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'refunded', 'status changed');
select isnt((select current_period_end from public.subscriptions where provider_subscription_id = 'sub_1'), null,
  'fields not in the update are kept');
select is((select store from public.subscriptions where provider_subscription_id = 'sub_1'), 'stripe', 'store kept');
select is((select plan_tier::text from public.profiles where id = :'ada'), 'free', 'a refund ends Pro');

-- iOS subscriber in billing retry ----------------------------------------------------------
select public.apply_billing_event('revenuecat', 'rc_1', 'BILLING_ISSUE', now(),
  format('{"provider_subscription_id": "txn_1", "provider_customer_id": "%s", "user_id": "%s", "product_id": "studypulse_pro_monthly", "status": "in_grace", "current_period_end": "%s", "grace_period_ends_at": "%s", "store": "app_store"}',
    :'ios', :'ios', now() - interval '1 day', now() + interval '5 days')::jsonb);

select tests.authenticate_as(:'ios');
select is((public.billing_status() ->> 'pro')::boolean, true, 'store grace keeps Pro');
select is(public.billing_status() ->> 'manage_in', 'app_store', 'an iOS purchase is managed in the App Store');
select is((public.billing_status() ->> 'payment_issue')::boolean, true, 'and flags the payment issue');
select is(public.billing_status() -> 'subscription' ->> 'store', 'app_store', 'store reported');

select tests.authenticate_as(:'ada');
select is(public.billing_status() - 'subscription',
  '{"pro": false, "manage_in": "stripe_portal", "payment_issue": false}'::jsonb, 'refunded web subscriber');

select tests.authenticate_as(:'free');
select is(public.billing_status(), '{"pro": false, "manage_in": null, "subscription": null, "payment_issue": false}'::jsonb,
  'never subscribed');

select tests.clear_authentication();
set local role anon;
select throws_ok($$ select public.billing_status() $$, '42501', null, 'anonymous callers cannot call it');

select * from finish();
rollback;
