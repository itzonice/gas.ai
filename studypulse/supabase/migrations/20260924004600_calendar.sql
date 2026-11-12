-- Calendar data for a range of local dates: assignment due dates and study blocks, each
-- tagged with its calendar date in the user's timezone, plus course chips. Runs as the
-- caller, so RLS applies. Ranges are capped at 62 days (a month grid is at most 42).

create or replace function public.get_calendar(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'p_to must be on or after p_from' using errcode = '22023';
  end if;
  if p_to - p_from > 62 then
    raise exception 'calendar range is limited to 62 days' using errcode = '22023';
  end if;

  select timezone into v_tz from public.profiles where id = v_user;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'timezone', v_tz,
    'today', (now() at time zone v_tz)::date,
    'from', p_from,
    'to', p_to,
    'items', coalesce((
      select jsonb_agg(i order by i ->> 'date', i ->> 'starts_at', i ->> 'title')
      from (
        select jsonb_build_object(
          'type', 'due',
          'id', a.id,
          'title', a.title,
          'kind', a.kind,
          'status', a.status,
          'course_id', a.course_id,
          'date', (a.due_at at time zone v_tz)::date,
          'starts_at', a.due_at,
          'ends_at', null,
          'overdue', a.status in ('todo', 'in_progress') and a.due_at < now()
        ) as i
        from public.assignments a
        join public.courses c on c.id = a.course_id and c.archived_at is null
        where a.due_at >= v_start and a.due_at < v_end
        union all
        select jsonb_build_object(
          'type', 'study',
          'id', b.id,
          'title', coalesce(a.title, c.name),
          'kind', b.kind,
          'status', b.status,
          'course_id', b.course_id,
          'date', (b.starts_at at time zone v_tz)::date,
          'starts_at', b.starts_at,
          'ends_at', b.ends_at,
          'overdue', false
        )
        from public.study_blocks b
        join public.courses c on c.id = b.course_id and c.archived_at is null
        left join public.assignments a on a.id = b.assignment_id
        where b.starts_at >= v_start and b.starts_at < v_end
      ) x
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'code', coalesce(c.code, c.name), 'name', c.name, 'color', c.color) order by c.name)
      from public.courses c
      where c.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_calendar(date, date) from public, anon;
grant execute on function public.get_calendar(date, date) to authenticated;
