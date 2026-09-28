-- Launch safety S25: old personal data is deleted on schedule.
begin;
select plan(3);

select tests.create_user('ada@example.com') as ada \gset
insert into public.notification_log (user_id, kind, channel, status, dedupe_key, title, body, created_at)
values (:'ada', 'due_24h', 'expo', 'sent', 'old', 'Midterm', 'Due tomorrow', now() - interval '91 days'),
       (:'ada', 'due_24h', 'expo', 'sent', 'new', 'Final', 'Due tomorrow', now() - interval '1 day');
insert into public.external_busy_times (user_id, source, starts_at, ends_at)
values (:'ada', 'google', now() - interval '40 days', now() - interval '40 days' + interval '1 hour');

select ok((private.cleanup_retention() ->> 'notification_log')::int >= 1, 'the job reports what it removed');
select is((select array_agg(dedupe_key)::text from public.notification_log where user_id = :'ada'), '{new}',
  'reminder text older than 90 days is deleted, recent kept');
select is_empty(format('select 1 from public.external_busy_times where user_id = %L', :'ada'),
  'calendar busy times are deleted 30 days after they end');

select * from finish();
rollback;
