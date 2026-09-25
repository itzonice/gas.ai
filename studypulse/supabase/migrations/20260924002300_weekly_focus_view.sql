-- Current grade in SQL (mirror of currentGrade() in packages/core/src/grades) and a
-- weekly focus-minutes view per course alongside it. Parity with TypeScript is pinned by
-- supabase/tests/database/190_grade_parity.test.sql, generated from core fixtures.

-- Best pooled percent keeping all but p_drop items (at least one kept), by the same
-- Kern-Bailey bisection as chooseDrops(). Arrays are aligned; returns null if empty.
create or replace function private.best_kept_percent(p_earned numeric[], p_possible numeric[], p_drop integer)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_earned, 1), 0);
  k integer;
  lo numeric := 0;
  hi numeric := 0;
  q numeric;
  s numeric;
  i integer;
begin
  if n = 0 then
    return null;
  end if;
  k := n - least(greatest(coalesce(p_drop, 0), 0), n - 1);
  if k = n then
    return (select sum(e) / nullif(sum(p), 0) * 100 from unnest(p_earned, p_possible) as t(e, p));
  end if;
  select max(e / p) into hi from unnest(p_earned, p_possible) as t(e, p) where p > 0;
  hi := greatest(coalesce(hi, 0), 0);
  for i in 1..60 loop
    q := (lo + hi) / 2;
    select sum(v) into s
    from (select e - q * p as v from unnest(p_earned, p_possible) as t(e, p) order by 1 desc limit k) top;
    if s >= 0 then lo := q; else hi := q; end if;
  end loop;
  -- Percent of the best set at q = lo.
  return (
    select sum(e) / nullif(sum(p), 0) * 100
    from (select e, p from unnest(p_earned, p_possible) as t(e, p) order by e - lo * p desc limit k) best
  );
end;
$$;

-- Current grade of a course: pooled percent per category (after drop-lowest), weighted
-- average over categories that have grades, renormalized. No categories = one pool.
-- Runs as the caller, so RLS applies.
create or replace function public.course_current_grade(p_course_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with graded as (
    select a.category_id, a.points_earned as e, a.points_possible as p
    from public.assignments a
    where a.course_id = p_course_id
      and a.points_earned is not null and a.points_possible > 0
  ),
  per_category as (
    select gc.weight,
           private.best_kept_percent(array_agg(g.e), array_agg(g.p), gc.drop_lowest) as pct
    from public.grade_categories gc
    join graded g on g.category_id = gc.id
    where gc.course_id = p_course_id and gc.weight > 0
    group by gc.id, gc.weight, gc.drop_lowest
  )
  select case
    when exists (select 1 from public.grade_categories where course_id = p_course_id) then
      (select sum(weight * pct) / nullif(sum(weight), 0) from per_category where pct is not null)
    else
      (select sum(e) / nullif(sum(p), 0) * 100 from graded)
  end;
$$;

-- Letter for a percent from a course scale (or the default), mirroring letterFor().
create or replace function public.letter_for(p_percent numeric, p_scale jsonb default null)
returns text
language sql
immutable
set search_path = ''
as $$
  with scale as (
    select coalesce(p_scale, '[{"letter":"A","min":93},{"letter":"A-","min":90},{"letter":"B+","min":87},
      {"letter":"B","min":83},{"letter":"B-","min":80},{"letter":"C+","min":77},{"letter":"C","min":73},
      {"letter":"C-","min":70},{"letter":"D+","min":67},{"letter":"D","min":63},{"letter":"D-","min":60},
      {"letter":"F","min":0}]'::jsonb) as s
  ),
  entries as (
    select e ->> 'letter' as letter, (e ->> 'min')::numeric as min_value, ord
    from scale, jsonb_array_elements(scale.s) with ordinality as x(e, ord)
  )
  select case when p_percent is null then null else coalesce(
    (select letter from entries where round(p_percent, 2) >= min_value order by ord limit 1),
    (select letter from entries order by ord desc limit 1)
  ) end;
$$;

-- Weekly focus minutes per course (weeks start Monday in the user's timezone), with the
-- course's current grade and letter. Runs as the caller (RLS applies).
create or replace view public.weekly_focus_by_course
with (security_invoker = true)
as
select
  c.user_id,
  c.id as course_id,
  c.name as course_name,
  c.code as course_code,
  date_trunc('week', s.started_at at time zone p.timezone)::date as week_start,
  sum(s.duration_minutes)::integer as focus_minutes,
  count(*)::integer as session_count,
  round(public.course_current_grade(c.id), 2) as current_grade,
  public.letter_for(public.course_current_grade(c.id), c.letter_scale) as current_letter
from public.study_sessions s
join public.courses c on c.id = s.course_id
join public.profiles p on p.id = c.user_id
where s.ended_at is not null
group by c.user_id, c.id, c.name, c.code, c.letter_scale, 5;

grant select on public.weekly_focus_by_course to authenticated;
revoke all on public.weekly_focus_by_course from anon;
revoke execute on function private.best_kept_percent(numeric[], numeric[], integer) from public, anon;
grant execute on function private.best_kept_percent(numeric[], numeric[], integer) to authenticated, service_role;
