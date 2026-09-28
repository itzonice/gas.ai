begin;
delete from auth.users;
select plan(4);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as_service_role();
insert into public.billing_customers (user_id, stripe_customer_id) values (:'ada', 'cus_Ada123');
select throws_ok($$ insert into public.billing_customers (user_id, stripe_customer_id) values (gen_random_uuid(), 'not-a-customer') $$,
  '23514', null, 'only Stripe customer ids');

select tests.authenticate_as(:'ada');
select throws_ok($$ select * from public.billing_customers $$, '42501', null, 'users cannot read the mapping');
select throws_ok($$ insert into public.billing_customers (user_id, stripe_customer_id) values (auth.uid(), 'cus_X') $$,
  '42501', null, 'users cannot write it');

select tests.clear_authentication();
delete from auth.users where id = :'ada';
select is_empty('select 1 from public.billing_customers', 'deleted with the account');

select * from finish();
rollback;
