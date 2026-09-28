begin;
delete from auth.users;
select plan(19);

-- Which subscription states grant Pro -------------------------------------------------
select ok(private.subscription_grants_pro('active', now() + interval '1 day', null, now()), 'active in period');
select ok(private.subscription_grants_pro('active', now() - interval '2 days', null, now()), 'active, renewal webhook a little late');
select ok(not private.subscription_grants_pro('active', now() - interval '4 days', null, now()), 'active but long past its period: lapsed');
select ok(private.subscription_grants_pro('in_grace', now() - interval '5 days', now() + interval '1 day', now()), 'in store grace');
select ok(not private.subscription_grants_pro('in_grace', null, now() - interval '1 second', now()), 'grace ended');
select ok(private.subscription_grants_pro('past_due', now() - interval '6 days', null, now()), 'past_due: 7 days after the period end');
select ok(not private.subscription_grants_pro('past_due', now() - interval '8 days', null, now()), 'past_due: then not');
select ok(not private.subscription_grants_pro('canceled', now() + interval '10 days', null, now()), 'canceled');
select ok(not private.subscription_grants_pro('refunded', now() + interval '10 days', null, now()), 'refunded');

select tests.create_user('free@example.com') as free \gset
select tests.create_user('pro@example.com') as pro \gset
insert into public.subscriptions (user_id, provider, provider_subscription_id, status, current_period_end)
values (:'pro', 'revenuecat', 'txn_1', 'active', now() + interval '20 days');

-- is_pro --------------------------------------------------------------------------------
select tests.authenticate_as(:'pro');
select ok(public.is_pro(auth.uid()), 'a subscriber is pro (any platform)');
select throws_ok(format($$ select public.is_pro(%L) $$, :'free'), '42501', null, 'users cannot check other users');
select tests.authenticate_as(:'free');
select ok(not public.is_pro(auth.uid()), 'no subscription: not pro');

-- The free plan's 3 active courses --------------------------------------------------------
insert into public.courses (user_id, name) values (auth.uid(), 'One'), (auth.uid(), 'Two'), (auth.uid(), 'Three');
select throws_ok($$ insert into public.courses (user_id, name) values (auth.uid(), 'Four') $$, 'SPC01', null,
  'a 4th active course is refused on the free plan');
update public.courses set archived_at = now() where name = 'Three';
select lives_ok($$ insert into public.courses (user_id, name) values (auth.uid(), 'Four') $$, 'archived courses do not count');
select throws_ok($$ update public.courses set archived_at = null where name = 'Three' $$, 'SPC01', null,
  'unarchiving counts as adding');
select lives_ok($$ update public.courses set name = 'Uno' where name = 'One' $$, 'other edits are unaffected');

select tests.authenticate_as(:'pro');
select lives_ok($$ insert into public.courses (user_id, name) select auth.uid(), 'Course ' || n from generate_series(1, 6) n $$,
  'pro users have no course limit');

-- The cached plan_tier follows lapses without a webhook -----------------------------------
select tests.clear_authentication();
update public.subscriptions set current_period_end = now() - interval '5 days' where user_id = :'pro';
update public.profiles set plan_tier = 'pro' where id = :'pro';
select is(private.refresh_stale_plan_tiers(), 1, 'the hourly job finds the lapsed subscriber');
select is((select plan_tier::text from public.profiles where id = :'pro'), 'free', 'and downgrades the cache');

select * from finish();
rollback;
