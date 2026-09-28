-- Launch safety S9: shared provider breaker state is service-only and bounded.
begin;
select plan(6);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as(:'ada');
select throws_ok($$ select * from public.provider_circuits_open() $$, '42501', null,
  'users cannot read provider breakers');
select throws_ok($$ select public.open_provider_circuit('stripe', now() + interval '5 minutes') $$, '42501', null,
  'users cannot pause a provider');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select public.open_provider_circuit('stripe', now() + interval '5 minutes');
select is((select count(*)::int from public.provider_circuits_open() where provider = 'stripe'), 1,
  'an opened breaker is visible to every worker');
select public.open_provider_circuit('stripe', now() + interval '1 minute');
select ok((select open_until > now() + interval '4 minutes' from public.provider_circuits_open() where provider = 'stripe'),
  'a later, shorter report never shortens the pause');
select public.open_provider_circuit('resend', now() + interval '3 hours');
select ok((select open_until <= now() + interval '15 minutes' from public.provider_circuits_open() where provider = 'resend'),
  'no pause lasts longer than 15 minutes');
select tests.clear_authentication();
update private.provider_circuits set open_until = now() - interval '1 second' where provider = 'stripe';
select tests.authenticate_as_service_role();
select is((select count(*)::int from public.provider_circuits_open() where provider = 'stripe'), 0,
  'an expired pause is no longer reported');

select * from finish();
rollback;
