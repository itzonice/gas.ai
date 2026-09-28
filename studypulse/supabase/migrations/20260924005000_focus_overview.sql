-- Focus screen (UI prompt 84): one call for the metric cards (today's minutes and the
-- streak, both in the user's timezone), the running session, what the timer is linked
-- to, things to link it to, and recent session history. Runs as the caller, so RLS applies.
--
-- Streak: consecutive local days with any focus time, counted back from today. A streak
-- that ended yesterday is still alive until today is over (studying today extends it).
create or replace function public.get_focus_overview(
  p_assignment_id uuid default null,
  p_block_id uuid default null,
  p_history int default 20
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tz text;
  v_today date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_streak int;
  v_linked jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_user;
  v_today := (now() at time zone v_tz)::date;
  v_day_start := v_today::timestamp at time zone v_tz;
  v_day_end := (v_today + 1)::timestamp at time zone v_tz;

  with days as (
    select distinct (s.started_at at time zone v_tz)::date as d
    from public.study_sessions s
    where s.user_id = v_user
      and s.started_at >= now() - interval '400 days'
      and (s.started_at at time zone v_tz)::date <= v_today
      and (s.ended_at is null or s.ended_at - s.started_at >= interval '1 minute')
  ),
  runs as (
    -- Consecutive dates, newest first, share d + row_number.
    select d, d + (row_number() over (order by d desc))::int as grp from days
  ),
  latest as (select d, grp from runs order by d desc limit 1)
  select case when l.d >= v_today - 1 then (select count(*) from runs r where r.grp = l.grp) else 0 end
  into v_streak
  from latest l;

  -- What the timer is for: a study block (e.g. from Today's reviews) or an assignment.
  if p_block_id is not null then
    select jsonb_build_object(
      'block_id', b.id, 'block_kind', b.kind, 'block_minutes', b.duration_minutes,
      'assignment_id', a.id, 'title', coalesce(a.title, 'Study ' || coalesce(c.code, c.name)),
      'due_at', a.due_at, 'course_id', c.id, 'course_code', c.code,
      'course_name', c.name, 'course_color', c.color)
    into v_linked
    from public.study_blocks b
    join public.courses c on c.id = b.course_id
    left join public.assignments a on a.id = b.assignment_id
    where b.id = p_block_id;
  elsif p_assignment_id is not null then
    select jsonb_build_object(
      'block_id', null, 'block_kind', null, 'block_minutes', null,
      'assignment_id', a.id, 'title', a.title, 'due_at', a.due_at, 'course_id', c.id,
      'course_code', c.code, 'course_name', c.name, 'course_color', c.color)
    into v_linked
    from public.assignments a
    join public.courses c on c.id = a.course_id
    where a.id = p_assignment_id;
  end if;

  return jsonb_build_object(
    'timezone', v_tz,
    'today', v_today,
    'today_minutes', coalesce((
      select floor(sum(extract(epoch from
        least(coalesce(s.ended_at, now()), v_day_end) - greatest(s.started_at, v_day_start))) / 60)::int
      from public.study_sessions s
      where s.user_id = v_user
        and s.started_at < v_day_end
        and coalesce(s.ended_at, now()) > v_day_start
    ), 0),
    'streak_days', coalesce(v_streak, 0),
    'running', (
      select jsonb_build_object(
        'id', s.id, 'started_at', s.started_at, 'assignment_id', s.assignment_id,
        'title', coalesce(a.title, 'Study ' || coalesce(c.code, c.name)),
        'course_id', c.id, 'course_code', c.code, 'course_name', c.name, 'course_color', c.color)
      from public.study_sessions s
      join public.courses c on c.id = s.course_id
      left join public.assignments a on a.id = s.assignment_id
      where s.user_id = v_user and s.ended_at is null
      limit 1
    ),
    'linked', v_linked,
    'choices', coalesce((
      select jsonb_agg(x.item order by x.due_at nulls last, x.title)
      from (
        select a.title, a.due_at, jsonb_build_object(
          'assignment_id', a.id, 'title', a.title, 'due_at', a.due_at, 'course_id', c.id,
          'course_code', c.code, 'course_name', c.name, 'course_color', c.color) as item
        from public.assignments a
        join public.courses c on c.id = a.course_id
        where c.archived_at is null and a.status in ('todo', 'in_progress')
        order by a.due_at nulls last, a.title
        limit 30
      ) x
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', c.name, 'color', c.color) order by coalesce(c.code, c.name))
      from public.courses c
      where c.archived_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.item order by h.started_at desc)
      from (
        select s.started_at, jsonb_build_object(
          'id', s.id, 'started_at', s.started_at, 'ended_at', s.ended_at,
          'minutes', s.duration_minutes, 'assignment_id', s.assignment_id,
          'title', coalesce(a.title, 'Study ' || coalesce(c.code, c.name)),
          'course_id', c.id, 'course_code', c.code, 'course_name', c.name,
          'course_color', c.color) as item
        from public.study_sessions s
        join public.courses c on c.id = s.course_id
        left join public.assignments a on a.id = s.assignment_id
        where s.user_id = v_user and s.ended_at is not null and s.duration_minutes >= 1
        order by s.started_at desc
        limit least(greatest(coalesce(p_history, 20), 1), 100)
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_focus_overview(uuid, uuid, int) from public, anon;
grant execute on function public.get_focus_overview(uuid, uuid, int) to authenticated;
