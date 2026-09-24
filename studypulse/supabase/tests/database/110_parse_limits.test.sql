begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(13);

select tests.create_user('free@example.com', '{"timezone": "America/Chicago"}') as free_user \gset
select tests.create_user('pro@example.com') as pro_user \gset
update public.profiles set plan_tier = 'pro' where id = :'pro_user';

-- Free: 3 per day, only pdf/text
select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'a'), (%L, 'text', 'b'), (%L, 'text', 'c') $$, :'free_user', :'free_user', :'free_user'),
  'free user can start 3 parses today');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'd') $$, :'free_user'),
  'SPL01', 'Daily syllabus limit reached (3 per day)', 'the 4th parse today is rejected');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, source_url) values (%L, 'url', 'https://example.edu') $$, :'free_user'),
  'SPP01', null, 'URL imports require Pro');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, file_path) values (%L, 'image', %L) $$, :'free_user', :'free_user' || '/p.jpg'),
  'SPP01', null, 'photo imports require Pro');

-- Failed uploads that never reached the AI don't count; ones that did still count.
update public.syllabus_uploads set status = 'failed', error = 'bad file'
where id = (select id from public.syllabus_uploads where user_id = :'free_user' and extracted_text = 'a');
select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'e') $$, :'free_user'),
  'a failed upload with no AI usage frees a slot');
update public.syllabus_uploads set status = 'failed', error = 'ai refused', ai_usage = '[{"step": "parse"}]'
where id = (select id from public.syllabus_uploads where user_id = :'free_user' and extracted_text = 'b');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'f') $$, :'free_user'),
  'SPL01', null, 'a failed upload that used the AI still counts');

-- Yesterday (local) doesn't count
update public.syllabus_uploads set created_at = now() - interval '2 days' where user_id = :'free_user';
select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'g') $$, :'free_user'),
  'the quota resets at the user''s local midnight');

-- Pro
select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, source_url) values (%L, 'url', 'https://example.edu') $$, :'pro_user'),
  'Pro users can import URLs');
select lives_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) select %L, 'text', 'x' from generate_series(1, 24) $$, :'pro_user'),
  'Pro users get 25 per day');
select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, extracted_text) values (%L, 'text', 'over') $$, :'pro_user'),
  'SPL01', null, 'Pro users are limited too');

-- Quota RPC and entitlements
select tests.authenticate_as(:'free_user');
select results_eq('select plan_tier::text, daily_limit, used_today, remaining, ocr_allowed from public.get_parse_quota()',
  $$ values ('free', 3, 1, 2, false) $$, 'get_parse_quota reports the caller''s quota');
select throws_ok(format('select * from public.parse_entitlements(%L)', :'pro_user'), '42501', null,
  'clients cannot call parse_entitlements');
select tests.authenticate_as_service_role();
select results_eq(format('select plan_tier::text, ocr_allowed from public.parse_entitlements(%L)', :'pro_user'),
  $$ values ('pro', true) $$, 'service role reads entitlements');

select * from finish();
rollback;
