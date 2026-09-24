begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(7);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset

select tests.authenticate_as_service_role();
select lives_ok(format($$ insert into public.subscriptions (user_id, provider, provider_subscription_id, status, current_period_end)
  values (%L, 'stripe', 'sub_123', 'active', now() + interval '30 days') $$, :'alice'),
  'service role can write subscriptions');
select throws_ok(format($$ insert into public.subscriptions (user_id, provider, provider_subscription_id, status)
  values (%L, 'stripe', 'sub_123', 'active') $$, :'bob'),
  '23505', null, 'a provider subscription id is recorded once');

select tests.authenticate_as(:'alice');
select results_eq('select status::text from public.subscriptions', array['active'], 'user can read their own subscription');
select throws_ok($$ update public.subscriptions set status = 'active', current_period_end = now() + interval '10 years' $$,
  '42501', null, 'user cannot extend their subscription');
select throws_ok(format($$ insert into public.subscriptions (user_id, provider, provider_subscription_id, status)
  values (%L, 'stripe', 'sub_fake', 'active') $$, :'alice'),
  '42501', null, 'user cannot create a subscription');
select throws_ok('delete from public.subscriptions', '42501', null, 'user cannot delete a subscription');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.subscriptions', 'B cannot read A''s subscription');

select * from finish();
rollback;
