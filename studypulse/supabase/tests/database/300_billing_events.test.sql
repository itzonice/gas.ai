begin;
delete from auth.users;
select plan(13);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.authenticate_as_service_role();
insert into public.billing_customers (user_id, stripe_customer_id) values (:'bob', 'cus_Bob');

select is(public.apply_billing_event('stripe', 'evt_1', 'customer.subscription.created', '2027-03-01 12:00Z',
  format('{"provider_subscription_id": "sub_1", "provider_customer_id": "cus_Ada", "user_id": "%s", "product_id": "price_m", "status": "active", "current_period_end": "2027-04-01T12:00:00Z", "cancel_at_period_end": false}', :'ada')::jsonb),
  'applied', 'a new subscription is applied');
select is((select plan_tier::text from public.profiles where id = :'ada'), 'pro', 'the user becomes pro');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'active', 'row written');

select is(public.apply_billing_event('stripe', 'evt_1', 'customer.subscription.created', '2027-03-01 12:00Z',
  '{"provider_subscription_id": "sub_1", "status": "canceled"}'), 'duplicate', 'a redelivered event is a no-op');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'active', 'duplicate changed nothing');

select is(public.apply_billing_event('stripe', 'evt_3', 'customer.subscription.deleted', '2027-03-05 12:00Z',
  '{"provider_subscription_id": "sub_1", "provider_customer_id": "cus_Ada", "status": "canceled", "canceled_at": "2027-03-05T12:00:00Z"}'),
  'applied', 'a cancellation is applied');
select is((select plan_tier::text from public.profiles where id = :'ada'), 'free', 'the user drops to free');

select is(public.apply_billing_event('stripe', 'evt_2', 'customer.subscription.updated', '2027-03-03 12:00Z',
  '{"provider_subscription_id": "sub_1", "provider_customer_id": "cus_Ada", "status": "active"}'),
  'stale', 'an older event delivered late does not roll state back');
select is((select status::text from public.subscriptions where provider_subscription_id = 'sub_1'), 'canceled', 'still canceled');

select is(public.apply_billing_event('stripe', 'evt_4', 'customer.subscription.created', '2027-03-01 12:00Z',
  '{"provider_subscription_id": "sub_2", "provider_customer_id": "cus_Bob", "status": "trialing"}'),
  'applied', 'without metadata the user is found by Stripe customer');
select is((select user_id from public.subscriptions where provider_subscription_id = 'sub_2'), :'bob'::uuid, 'owned by bob');

select is(public.apply_billing_event('stripe', 'evt_5', 'customer.subscription.created', '2027-03-01 12:00Z',
  '{"provider_subscription_id": "sub_3", "provider_customer_id": "cus_Nobody", "status": "active"}'),
  'unknown_user', 'unknown customers are recorded, not applied');

select tests.authenticate_as(:'ada');
select throws_ok($$ select public.apply_billing_event('stripe', 'evt_x', 't', now(), null) $$, '42501', null,
  'clients cannot apply billing events');

select * from finish();
rollback;
