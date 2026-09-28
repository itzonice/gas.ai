-- Courses screen (UI prompt 83): one call for the course cards (and the user's timezone). Current grade and
-- letter use the same SQL as everywhere else; runs as the caller, so RLS applies.
create or replace function public.get_courses_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'timezone', (select timezone from public.profiles where id = v_user),
    'courses', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'code', c.code,
      'color', c.color,
      'instructor', c.instructor,
      'target_grade', c.target_grade,
      'current_grade', round(g.current, 2),
      'letter', public.letter_for(g.current, c.letter_scale),
      'open_count', (select count(*) from public.assignments a
                     where a.course_id = c.id and a.status in ('todo', 'in_progress')),
      'next_due', (
        select jsonb_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'due_at', a.due_at)
        from public.assignments a
        where a.course_id = c.id and a.status in ('todo', 'in_progress') and a.due_at >= now()
        order by a.due_at
        limit 1
      )
    ) order by coalesce(c.code, c.name))
    from public.courses c
    cross join lateral (select public.course_current_grade(c.id) as current) g
    where c.archived_at is null
  ), '[]'::jsonb));
end;
$$;

revoke execute on function public.get_courses_overview() from public, anon;
grant execute on function public.get_courses_overview() to authenticated;
