-- Stats screen (UI prompt 85): focus minutes against grade per course, in one call.
-- Weeks start on Monday in the user's timezone, and a session counts on the local day
-- it started (the same rule as get_today_overview). Runs as the caller, so RLS applies.
create or replace function public.get_stats_overview(p_weeks int default 4)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tz text;
  v_today date;
  v_week_start date;
  v_weeks int := least(greatest(coalesce(p_weeks, 4), 1), 26);
  v_period_start date;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_user;
  v_today := (now() at time zone v_tz)::date;
  v_week_start := date_trunc('week', v_today::timestamp)::date;
  v_period_start := v_week_start - (v_weeks - 1) * 7;

  return (
    with sessions as (
      select s.course_id, (s.started_at at time zone v_tz)::date as local_day, s.duration_minutes as minutes
      from public.study_sessions s
      where s.user_id = v_user
        and s.ended_at is not null
        and s.started_at >= (v_period_start - 1)::timestamp at time zone v_tz
        and (s.started_at at time zone v_tz)::date between v_period_start and v_today
    ),
    courses as (
      select c.id, c.code, c.name, c.color, c.target_grade,
             round(g.current, 2) as current_grade,
             public.letter_for(g.current, c.letter_scale) as letter,
             coalesce((select sum(x.minutes) from sessions x where x.course_id = c.id), 0)::int as focus_minutes
      from public.courses c
      cross join lateral (select public.course_current_grade(c.id) as current) g
      where c.archived_at is null
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'today', v_today,
      'week_start', v_week_start,
      'period_start', v_period_start,
      'weeks', v_weeks,
      'this_week_minutes', coalesce((select sum(minutes) from sessions where local_day >= v_week_start), 0),
      'weekly', (
        select jsonb_agg(jsonb_build_object(
          'week_start', w.d,
          'minutes', coalesce((select sum(x.minutes) from sessions x
                               where x.local_day between w.d and w.d + 6), 0)
        ) order by w.d)
        from (select ts::date as d
              from generate_series(v_period_start, v_week_start, interval '7 days') as g(ts)) w
      ),
      -- Plain mean of the current grades of courses that have one.
      'average_grade', (select round(avg(current_grade), 2) from courses where current_grade is not null),
      'courses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'code', code, 'name', name, 'color', color, 'target_grade', target_grade,
          'current_grade', current_grade, 'letter', letter, 'focus_minutes', focus_minutes
        ) order by coalesce(code, name))
        from courses
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.get_stats_overview(int) from public, anon;
grant execute on function public.get_stats_overview(int) to authenticated;
