-- Everything the Today screen shows besides the ranked feed, in one call, computed in
-- the user's timezone: the three metric cards, today's review blocks, the next exam,
-- and the user's courses (code and color for chips). Runs as the caller, so RLS applies.

create or replace function public.get_today_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tz text;
  v_now timestamptz := now();
  v_today date;
  v_week_start date;
  v_week_end date;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select timezone into v_tz from public.profiles where id = v_user;
  v_today := (v_now at time zone v_tz)::date;
  -- Weeks run Monday to Sunday.
  v_week_start := date_trunc('week', v_today::timestamp)::date;
  v_week_end := v_week_start + 6;

  return jsonb_build_object(
    'timezone', v_tz,
    'today', v_today,
    'week_start', v_week_start,

    -- Open work due from now through Sunday.
    'due_this_week', (
      select count(*)
      from public.assignments a
      join public.courses c on c.id = a.course_id and c.archived_at is null
      where a.status in ('todo', 'in_progress')
        and a.due_at >= v_now
        and (a.due_at at time zone v_tz)::date <= v_week_end
    ),

    -- Minutes from finished sessions that started this week.
    'focus_minutes_this_week', (
      select coalesce(sum(s.duration_minutes), 0)
      from public.study_sessions s
      where s.user_id = v_user and s.duration_minutes is not null
        and (s.started_at at time zone v_tz)::date between v_week_start and v_week_end
    ),

    -- Courses whose current grade is below the student's target.
    'courses_at_risk', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'current', r.current, 'target', r.target) order by r.code)
      from (
        select c.id, coalesce(c.code, c.name) as code, public.course_current_grade(c.id) as current, c.target_grade as target
        from public.courses c
        where c.archived_at is null and c.target_grade is not null
      ) r
      where r.current is not null and r.current < r.target
    ), '[]'::jsonb),

    -- Review and exam-prep blocks scheduled today, in time order.
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'kind', b.kind, 'status', b.status,
        'starts_at', b.starts_at, 'ends_at', b.ends_at, 'minutes', b.duration_minutes,
        'course_id', b.course_id, 'assignment_id', b.assignment_id,
        'title', coalesce(a.title, c.name)
      ) order by b.starts_at)
      from public.study_blocks b
      join public.courses c on c.id = b.course_id and c.archived_at is null
      left join public.assignments a on a.id = b.assignment_id
      where b.kind in ('review', 'exam_prep')
        and (b.starts_at at time zone v_tz)::date = v_today
    ), '[]'::jsonb),

    'next_exam', (
      select jsonb_build_object(
        'id', a.id, 'title', a.title, 'course_id', a.course_id, 'due_at', a.due_at,
        'days_until', (a.due_at at time zone v_tz)::date - v_today
      )
      from public.assignments a
      join public.courses c on c.id = a.course_id and c.archived_at is null
      where a.kind = 'exam' and a.status in ('todo', 'in_progress') and a.due_at >= v_now
      order by a.due_at
      limit 1
    ),

    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'code', coalesce(c.code, c.name), 'name', c.name, 'color', c.color) order by c.name)
      from public.courses c
      where c.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_today_overview() from public, anon;
grant execute on function public.get_today_overview() to authenticated;
