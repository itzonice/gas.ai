-- Launch safety S21: which Terms version each user accepted, and when.
begin;
select plan(9);

select is(private.current_terms_version(), '2026-09-25',
  'SQL and packages/core/src/legal TERMS_VERSION agree (update both together)');

select tests.create_user('ada@example.com', '{"terms_version": "2026-09-25"}') as ada \gset
select is((select (version, context)::text from public.terms_acceptances where user_id = :'ada'),
  '(2026-09-25,signup)', 'an email sign-up records the version accepted');

select tests.create_user('old@example.com', '{"terms_version": "2020-01-01"}') as old \gset
select is_empty(format('select 1 from public.terms_acceptances where user_id = %L', :'old'),
  'a stale version sent at sign-up is not recorded as accepting the current terms');

select tests.authenticate_as(:'old');
select is(public.terms_current(), false, 'so the app asks them to accept');
select throws_ok($$ select public.accept_terms('2020-01-01') $$, '22023', null,
  'only the current version can be accepted');
select public.accept_terms('2026-09-25');
select is(public.terms_current(), true, 'accepting the current version is recorded');
select throws_ok($$ insert into public.terms_acceptances (user_id, version, context)
  values (auth.uid(), '2026-09-25', 'checkout') $$, '42501', null, 'users cannot write records directly');
select is((select count(*)::int from public.terms_acceptances), 1, 'users only see their own records');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select public.record_checkout_terms(:'ada');
select tests.clear_authentication();
select is((select array_agg(context order by id)::text from public.terms_acceptances where user_id = :'ada'),
  '{signup,checkout}', 'checkout is recorded too');

select * from finish();
rollback;
