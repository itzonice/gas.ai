-- Launch safety S4: every Pro-gated or limited action is enforced by the database, so a
-- client calling the API directly can't skip it. A free user tries each bypass.
begin;
delete from auth.users;
select plan(11);

select tests.create_user('free@example.com') as u \gset
insert into public.courses (id, user_id, name, archived_at) values
  ('c0000000-0000-0000-0000-0000000000a1', :'u', 'One', null),
  ('c0000000-0000-0000-0000-0000000000a2', :'u', 'Two', null),
  ('c0000000-0000-0000-0000-0000000000a3', :'u', 'Three', null),
  ('c0000000-0000-0000-0000-0000000000a4', :'u', 'Archived', now());

select tests.authenticate_as(:'u');

-- Plan state can't be written by the user.
select throws_ok($$ update public.profiles set plan_tier = 'pro' $$, '42501', null,
  'plan_tier is not client-writable');
select throws_ok(format($$ insert into public.subscriptions (user_id, provider, provider_subscription_id, status)
  values (%L, 'stripe', 'sub_x', 'active') $$, :'u'), '42501', null, 'subscriptions are not client-writable');
select ok(not public.is_pro(:'u'), 'still free after the attempts');

-- Course limit: a 4th active course, by insert or by un-archiving.
select throws_ok(format($$ insert into public.courses (user_id, name) values (%L, 'Four') $$, :'u'),
  'SPC01', null, 'a 4th active course is refused');
select throws_ok($$ update public.courses set archived_at = null where id = 'c0000000-0000-0000-0000-0000000000a4' $$,
  'SPC01', null, 'un-archiving into a 4th active course is refused');

-- Syllabus parsing and card generation only go through the server functions.
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, status) values (%L, 'url', 'pending') $$, :'u'),
  '42501', null, 'uploads cannot be created directly (limits live in the edge function and trigger)');
select throws_ok($$ update public.syllabus_uploads set status = 'parsed' $$, '42501', null,
  'upload status is not client-writable');
select throws_ok(format($$ insert into public.card_generations (user_id, course_id, notes_chars)
  values (%L, 'c0000000-0000-0000-0000-0000000000a1', 10) $$, :'u'), '42501', null,
  'card generations cannot be recorded directly');

-- Billing records and AI usage are server-only.
select throws_ok(format($$ insert into public.billing_customers (user_id, stripe_customer_id) values (%L, 'cus_x') $$, :'u'),
  '42501', null, 'billing customers are server-only');
select throws_ok($$ update public.syllabus_uploads set ai_usage = '[]' $$, '42501', null,
  'AI usage records are not client-writable');

-- The parse limit itself (3 a day for free) is enforced by a trigger even for server inserts.
select tests.clear_authentication();
insert into public.syllabus_uploads (user_id, source, extracted_text, status)
select :'u', 'text', 'x', 'pending' from generate_series(1, 3);
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text, status)
  values (%L, 'text', 'x', 'pending') $$, :'u'), null, null, 'a 4th parse today is refused by the trigger');

select * from finish();
rollback;
