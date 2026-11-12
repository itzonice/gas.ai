-- Fixes F1-F4: the hourly replan claims each user exactly once per local day, in
-- half-hour and 45-minute zones and across DST changes, even when a run is repeated.
begin;
delete from auth.users;
select plan(12);

create temp table sim_users (email text, tz text, user_id uuid);
insert into sim_users (email, tz) values
  ('india@example.com', 'Asia/Kolkata'),         -- +5:30
  ('nepal@example.com', 'Asia/Kathmandu'),       -- +5:45
  ('nfld@example.com', 'America/St_Johns'),      -- -3:30 (standard) / -2:30 (DST)
  ('ny@example.com', 'America/New_York'),
  ('london@example.com', 'Europe/London'),
  ('athens@example.com', 'Europe/Athens');       -- DST changes at 03:00/04:00 local
update sim_users set user_id = tests.create_user(email);
update public.profiles p set timezone = s.tz from sim_users s where p.id = s.user_id;

-- Everyone has a course with open work so they always have something to plan.
insert into public.courses (user_id, name) select user_id, 'Course' from sim_users;
insert into public.assignments (course_id, title, due_at)
select c.id, 'Far away', '2027-12-31 12:00Z' from public.courses c;

create temp table claims (user_id uuid, local_date date, run_at timestamptz);

-- Every hourly run (minute 5, like the cron job) from p_from to p_to, each run twice.
create function pg_temp.simulate(p_from timestamptz, p_to timestamptz) returns void language plpgsql as $$
declare t timestamptz;
begin
  update public.profiles set last_replanned_on = null;
  delete from claims;
  -- Work is due within 28 days of every run in the window.
  update public.assignments set due_at = p_to + interval '7 days';
  for t in select generate_series(p_from, p_to, interval '1 hour') loop
    insert into claims select c.user_id, c.local_date, t from public.claim_users_for_replan(3, t) c;
    insert into claims select c.user_id, c.local_date, t from public.claim_users_for_replan(3, t) c;
  end loop;
end;
$$;

-- Local dates strictly inside the window that each user should have been replanned on.
create function pg_temp.missing(p_from timestamptz, p_to timestamptz)
returns table (email text, local_date date) language sql as $$
  select s.email, d::date
  from sim_users s
  cross join lateral generate_series((p_from at time zone s.tz)::date + 1, (p_to at time zone s.tz)::date - 1, interval '1 day') d
  where not exists (select 1 from claims c where c.user_id = s.user_id and c.local_date = d::date);
$$;
create function pg_temp.doubled() returns table (user_id uuid, local_date date, n bigint) language sql as $$
  select user_id, local_date, count(*) from claims group by 1, 2 having count(*) > 1;
$$;
-- The claim for a day must happen at or after local 03:00 that day.
create function pg_temp.early() returns table (email text, run_at timestamptz) language sql as $$
  select s.email, c.run_at from claims c join sim_users s using (user_id)
  where (c.run_at at time zone s.tz) < c.local_date + time '03:00';
$$;


-- Half-hour and 45-minute zones, a normal January week.
select pg_temp.simulate('2027-01-10 00:05Z', '2027-01-15 00:05Z');
select is_empty('select * from pg_temp.missing(''2027-01-10 00:05Z'', ''2027-01-15 00:05Z'')',
  'India, Nepal, Newfoundland: every local day is replanned');
select is_empty('select * from pg_temp.doubled()', 'and never twice, even with each run repeated');
select is_empty('select * from pg_temp.early()', 'and never before local 3 AM');
select results_eq($$ select extract(hour from c.run_at at time zone s.tz)::int
  from claims c join sim_users s using (user_id) where s.tz in ('Asia/Kolkata', 'Asia/Kathmandu', 'America/St_Johns')
    -- The window's first local day may start after 3 AM; that day is caught up late.
    and c.local_date > ('2027-01-10 00:05Z'::timestamptz at time zone s.tz)::date
  group by 1 $$, $$ values (3) $$, 'offset zones are replanned in their local 3 AM hour');

-- Spring forward: New York 2027-03-14, London and Athens 2027-03-28.
select pg_temp.simulate('2027-03-12 00:05Z', '2027-03-31 00:05Z');
select is_empty('select * from pg_temp.missing(''2027-03-12 00:05Z'', ''2027-03-31 00:05Z'')',
  'spring forward: no user skips a day (Athens has no 3 AM on 2027-03-28 and catches up at 4)');
select is_empty('select * from pg_temp.doubled()', 'spring forward: nobody replanned twice');
select is_empty('select * from pg_temp.early()', 'spring forward: never before local 3 AM');
select is((select extract(hour from c.run_at at time zone 'Europe/Athens')::int from claims c
  join sim_users s using (user_id) where s.tz = 'Europe/Athens' and c.local_date = '2027-03-28'), 4,
  'Athens on its spring-forward day is replanned at the first run after 3 AM');

-- Fall back: London and Athens 2027-10-31, New York 2027-11-07.
select pg_temp.simulate('2027-10-29 00:05Z', '2027-11-10 00:05Z');
select is_empty('select * from pg_temp.missing(''2027-10-29 00:05Z'', ''2027-11-10 00:05Z'')',
  'fall back: no user skips a day');
select is_empty('select * from pg_temp.doubled()',
  'fall back: nobody replanned twice (Athens has two 3 AM hours on 2027-10-31)');
select is_empty('select * from pg_temp.early()', 'fall back: never before local 3 AM');

-- A failed replan releases its claim, so a later run that day retries it.
update public.profiles set last_replanned_on = null;
update public.assignments set due_at = '2027-01-20 12:00Z';
create temp table c1 as select * from public.claim_users_for_replan(3, '2027-01-12 22:05Z')
  where user_id = (select user_id from sim_users where tz = 'Asia/Kolkata');
select public.release_replan_claim(c1.user_id, c1.local_date, c1.previous_date) from c1;
select ok(exists (select 1 from public.claim_users_for_replan(3, '2027-01-12 23:05Z') c
  where c.user_id = (select user_id from sim_users where tz = 'Asia/Kolkata')), 'a released claim is retried that day');

select * from finish();
rollback;
