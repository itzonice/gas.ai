-- Deleting an auth user must remove everything they own (account deletion relies on it).
begin;
delete from auth.users;
select plan(3);

-- Guard: every public table is the profile itself or reaches it by a cascading FK
-- (user_id -> profiles or course_id -> courses). A new table without one fails here.
select is_empty($$
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'profiles'
    and not exists (
      select 1 from pg_constraint k
      where k.conrelid = c.oid and k.contype = 'f' and k.confdeltype = 'c'
        and k.confrelid in ('public.profiles'::regclass, 'public.courses'::regclass)
    )
$$, 'every table cascades from the user');

select tests.create_user('gone@example.com') as uid \gset
select tests.create_user('stays@example.com') as other \gset
insert into public.courses (id, user_id, name) values
  ('c0000000-0000-0000-0000-000000000001', :'uid', 'Bio'),
  ('c0000000-0000-0000-0000-000000000002', :'other', 'Other');
insert into public.grade_categories (id, course_id, name, weight) values ('ca000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Labs', 100);
insert into public.assignments (id, course_id, category_id, title, due_at) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Lab', now() + interval '3 days');
insert into public.study_sessions (user_id, course_id, assignment_id, started_at, ended_at)
values (:'uid', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now() - interval '2 hours', now() - interval '1 hour');
insert into public.study_blocks (user_id, course_id, starts_at, ends_at) values (:'uid', 'c0000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into public.flashcards (course_id, front, back) values ('c0000000-0000-0000-0000-000000000001', 'f', 'b');
insert into public.syllabus_uploads (user_id, source, extracted_text) values (:'uid', 'text', 'x');
insert into public.notification_tokens (user_id, provider, token, platform) values (:'uid', 'expo', 'ExponentPushToken[gone]', 'ios');
insert into public.notification_log (user_id, kind, channel, status, dedupe_key) values (:'uid', 'due_24h', 'expo', 'sent', 'k');
insert into public.subscriptions (user_id, provider, provider_subscription_id, status) values (:'uid', 'stripe', 'sub_gone', 'active');
insert into public.study_plan_alerts (user_id, local_date) values (:'uid', current_date);

delete from auth.users where id = :'uid';

select is_empty(format($$
  select 'profiles' from public.profiles where id = %1$L
  union all select 'courses' from public.courses where user_id = %1$L
  union all select 'categories' from public.grade_categories where course_id = 'c0000000-0000-0000-0000-000000000001'
  union all select 'assignments' from public.assignments where course_id = 'c0000000-0000-0000-0000-000000000001'
  union all select 'sessions' from public.study_sessions where user_id = %1$L
  union all select 'blocks' from public.study_blocks where user_id = %1$L
  union all select 'cards' from public.flashcards where course_id = 'c0000000-0000-0000-0000-000000000001'
  union all select 'uploads' from public.syllabus_uploads where user_id = %1$L
  union all select 'tokens' from public.notification_tokens where user_id = %1$L
  union all select 'prefs' from public.notification_prefs where user_id = %1$L
  union all select 'log' from public.notification_log where user_id = %1$L
  union all select 'subscriptions' from public.subscriptions where user_id = %1$L
  union all select 'alerts' from public.study_plan_alerts where user_id = %1$L
  union all select 'replan' from public.replan_requests where user_id = %1$L
$$, :'uid'), 'deleting the auth user removes every row they own');

select results_eq(format('select count(*)::int from public.courses where user_id = %L', :'other'), array[1],
  'other users are untouched');

select * from finish();
rollback;
