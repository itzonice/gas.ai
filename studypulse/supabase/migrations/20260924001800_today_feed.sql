-- Today feed: ranked tasks for the user's local day, capped by their study minutes.

-- How long the student can study per day. Per-weekday overrides (Sunday first) take
-- precedence when set; null entries fall back to the daily default.
alter table public.profiles
  add column daily_study_minutes smallint not null default 120
    constraint profiles_daily_study_minutes_range check (daily_study_minutes between 0 and 960),
  add column study_minutes_by_weekday smallint[]
    constraint profiles_study_minutes_by_weekday_shape check (
      study_minutes_by_weekday is null
      or (array_length(study_minutes_by_weekday, 1) = 7
          and 0 <= all (study_minutes_by_weekday) and 960 >= all (study_minutes_by_weekday))
    );

grant update (daily_study_minutes, study_minutes_by_weekday) on public.profiles to authenticated;

-- Effort to assume when a task has no estimate. Mirrors DEFAULT_MINUTES_BY_KIND in
-- packages/core/src/priority (pinned by 150_today_feed.test.sql).
create or replace function public.default_task_minutes(p_kind public.assignment_kind)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_kind
    when 'exam' then 240
    when 'project' then 300
    when 'assignment' then 90
    when 'lab' then 120
    when 'quiz' then 45
    when 'reading' then 45
    when 'discussion' then 30
    else 60
  end;
$$;

-- Minutes the user can study on a local date.
create or replace function public.study_capacity(p_user_id uuid, p_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(p.study_minutes_by_weekday[extract(dow from p_date)::integer + 1], p.daily_study_minutes)::integer
  from public.profiles p
  where p.id = p_user_id;
$$;

create or replace function public.get_today_feed(p_date date default null)
returns table (
  assignment_id uuid,
  course_id uuid,
  course_name text,
  title text,
  kind public.assignment_kind,
  status public.assignment_status,
  due_at timestamptz,
  grade_share numeric,
  minutes_remaining integer,
  planned_minutes integer,
  priority numeric,
  overdue boolean,
  rank integer,
  -- Capacity for the day (same on every row) so one call renders the header too.
  capacity_minutes integer,
  studied_minutes integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tz text;
  v_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_now timestamptz := now();
  v_capacity integer;
  v_daily integer;
  v_studied integer;
  v_left integer;
  r record;
  v_rank integer := 0;
  v_planned integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.timezone, p.daily_study_minutes into v_tz, v_daily from public.profiles p where p.id = v_user_id;
  v_date := coalesce(p_date, (v_now at time zone v_tz)::date);
  v_day_start := v_date::timestamp at time zone v_tz;
  v_day_end := (v_date + 1)::timestamp at time zone v_tz;
  v_capacity := coalesce(public.study_capacity(v_user_id, v_date), 120);

  -- Time already studied today counts against the day's capacity.
  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at, v_now), v_day_end) - greatest(s.started_at, v_day_start))) / 60), 0)::integer
  into v_studied
  from public.study_sessions s
  where s.user_id = v_user_id
    and s.started_at < v_day_end
    and coalesce(s.ended_at, v_now) > v_day_start;

  v_left := greatest(v_capacity - v_studied, 0);

  for r in
    with logged as (
      select s.assignment_id, sum(coalesce(s.duration_minutes, 0)) as minutes
      from public.study_sessions s
      where s.user_id = v_user_id and s.assignment_id is not null
      group by s.assignment_id
    ),
    candidates as (
      select
        a.id, a.course_id, c.name as course_name, a.title, a.kind, a.status, a.due_at,
        coalesce(gs.grade_share, 0) as grade_share,
        greatest(coalesce(a.estimated_minutes, public.default_task_minutes(a.kind)) - coalesce(l.minutes, 0), 0)::integer as minutes_remaining
      from public.assignments a
      join public.courses c on c.id = a.course_id
      left join public.assignment_grade_shares gs on gs.assignment_id = a.id
      left join logged l on l.assignment_id = a.id
      where c.user_id = v_user_id
        and c.archived_at is null
        and a.status in ('todo', 'in_progress')
        and (a.due_at is null or a.due_at between v_day_start - interval '7 days' and v_day_end + interval '30 days')
    )
    select
      cand.*,
      public.task_priority(cand.grade_share, cand.due_at, v_now, cand.minutes_remaining, cand.status, coalesce(v_daily, 120)) as score
    from candidates cand
    where cand.minutes_remaining > 0
    order by score desc, cand.due_at nulls last, cand.title
  loop
    exit when v_left <= 0;
    -- Today's fair share of the task: everything if it's due by the end of today,
    -- otherwise the remaining minutes spread over the days left (at least 25 minutes
    -- so work sessions stay meaningful).
    if r.due_at is null then
      v_planned := least(r.minutes_remaining, 30);
    elsif r.due_at <= v_day_end then
      v_planned := r.minutes_remaining;
    else
      v_planned := least(
        r.minutes_remaining,
        greatest(25, ceil(r.minutes_remaining / greatest(1, ceil(extract(epoch from (r.due_at - v_day_start)) / 86400)))::integer)
      );
    end if;
    v_planned := least(v_planned, v_left);
    continue when v_planned < 15 and v_planned < r.minutes_remaining; -- too small a slot to be useful
    v_left := v_left - v_planned;
    v_rank := v_rank + 1;

    assignment_id := r.id;
    course_id := r.course_id;
    course_name := r.course_name;
    title := r.title;
    kind := r.kind;
    status := r.status;
    due_at := r.due_at;
    grade_share := round(r.grade_share, 2);
    minutes_remaining := r.minutes_remaining;
    planned_minutes := v_planned;
    priority := r.score;
    overdue := r.due_at is not null and r.due_at < v_now;
    rank := v_rank;
    capacity_minutes := v_capacity;
    studied_minutes := v_studied;
    return next;
  end loop;
end;
$$;

revoke execute on function public.get_today_feed(date) from public, anon;
grant execute on function public.get_today_feed(date) to authenticated;
