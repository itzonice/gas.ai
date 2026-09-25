-- Bulk data for the cron load test: :users students across timezones, each with 3
-- courses, 12 open assignments due over the next 8 days, a push device (3 in 4), and a
-- few study sessions. Run against a LOCAL or STAGING database only:
--   psql "$DB_URL" -v users=5000 -f load/seed-load.sql
-- Everything is tagged with the @load.test email domain; remove with load/cleanup-load.sql.
\set ON_ERROR_STOP on
begin;

create temp table load_users on commit drop as
select gen_random_uuid() as id, n,
       (array['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London',
              'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'])[1 + n % 8] as tz
from generate_series(1, :users) n;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'load-' || n || '@load.test', now(), jsonb_build_object('timezone', tz), now(), now()
from load_users;

-- Profiles and notification prefs come from the signup triggers. Spread digest times so
-- every 15-minute run has work, and turn quiet hours off so reminders are due now.
update public.notification_prefs np
set morning_digest_time = make_time((lu.n % 24), (lu.n % 4) * 15, 0), quiet_hours_enabled = false
from load_users lu where np.user_id = lu.id;

insert into public.courses (id, user_id, name, code)
select gen_random_uuid(), lu.id, 'Course ' || c, 'LOAD ' || c
from load_users lu cross join generate_series(1, 3) c;

insert into public.assignments (course_id, title, kind, due_at, estimated_minutes)
select c.id, 'Assignment ' || a,
       (array['assignment', 'quiz', 'exam', 'reading']::public.assignment_kind[])[1 + a % 4],
       now() + make_interval(hours => (a * 16) % 190 + 1), 30 + (a % 4) * 30
from public.courses c
join load_users lu on lu.id = c.user_id
cross join generate_series(1, 4) a;

-- Three in four have a phone (push reminders); the rest get the email digest.
insert into public.notification_tokens (user_id, provider, token, platform)
select id, 'expo', 'ExponentPushToken[load' || n || ']', 'ios' from load_users where n % 4 <> 0;

-- Two past sessions per course, at distinct times (a student can't be in two at once).
insert into public.study_sessions (user_id, course_id, started_at, ended_at)
select x.user_id, x.id, now() - make_interval(hours => (24 + x.slot * 2)::int), now() - make_interval(hours => (24 + x.slot * 2)::int) + interval '45 minutes'
from (
  select c.user_id, c.id, (row_number() over (partition by c.user_id order by c.id)) * 2 + s as slot
  from public.courses c join load_users lu on lu.id = c.user_id
  cross join generate_series(0, 1) s
) x;

commit;
select count(*) as load_users from auth.users where email like '%@load.test';
