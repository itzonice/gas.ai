-- SQL mirror of packages/core/src/priority (priority() and gradeShare()), used by the
-- Today feed RPC. Parity with the TypeScript version is pinned by
-- supabase/tests/database/130_priority_parity.test.sql, generated from core fixtures.

create or replace function public.task_priority(
  p_grade_share numeric,
  p_due_at timestamptz,
  p_now timestamptz,
  p_minutes_remaining numeric,
  p_status public.assignment_status,
  p_daily_minutes numeric default 120
)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_daily numeric := case when p_daily_minutes > 0 then p_daily_minutes else 120 end;
  v_impact numeric := sqrt(least(1, greatest(0, greatest(0, p_grade_share) / 30.0)));
  v_days numeric;
  v_work_days numeric := greatest(0, p_minutes_remaining) / v_daily;
  v_urgency numeric;
  v_score numeric;
begin
  if p_status in ('done', 'skipped') then
    return 0;
  end if;
  if p_due_at is null then
    v_urgency := 0.05;
  else
    v_days := extract(epoch from (p_due_at - p_now)) / 86400.0;
    v_urgency := case when v_days <= 0 then 1 else 1 / (1 + greatest(0, v_days - v_work_days)) end;
  end if;
  v_score := 0.55 * v_impact + 0.45 * v_urgency;
  if p_status = 'in_progress' then
    v_score := v_score * 1.1;
  end if;
  return round(least(1, v_score) * 100, 3);
end;
$$;

-- Share of the final grade per assignment (percent), mirroring gradeShare().
create or replace view public.assignment_grade_shares
with (security_invoker = true)
as
with cat as (
  select gc.id, gc.course_id, greatest(gc.weight, 0) as weight,
         sum(greatest(gc.weight, 0)) over (partition by gc.course_id) as total_weight
  from public.grade_categories gc
),
course_has_categories as (
  select c.id as course_id, exists (select 1 from public.grade_categories g where g.course_id = c.id) as has_categories
  from public.courses c
),
avg_points as (
  -- average points of items with points, per category (null category = whole course)
  select a.course_id, a.category_id, avg(a.points_possible) filter (where a.points_possible > 0) as avg_possible
  from public.assignments a
  group by a.course_id, a.category_id
),
course_avg as (
  select a.course_id, avg(a.points_possible) filter (where a.points_possible > 0) as avg_possible
  from public.assignments a
  group by a.course_id
),
pts as (
  select
    a.id, a.course_id, a.category_id, chc.has_categories,
    case
      when a.points_possible > 0 then a.points_possible
      when chc.has_categories then coalesce(ap.avg_possible, 1)
      else coalesce(ca.avg_possible, 1)
    end as points
  from public.assignments a
  join course_has_categories chc on chc.course_id = a.course_id
  left join avg_points ap on ap.course_id = a.course_id and ap.category_id is not distinct from a.category_id
  left join course_avg ca on ca.course_id = a.course_id
)
select
  p.id as assignment_id,
  p.course_id,
  case
    when not p.has_categories then
      p.points / nullif(sum(p.points) over (partition by p.course_id), 0) * 100
    when cat.id is null or cat.weight <= 0 or cat.total_weight <= 0 then 0
    else (cat.weight / cat.total_weight) * p.points / nullif(sum(p.points) over (partition by p.course_id, p.category_id), 0) * 100
  end as grade_share
from pts p
left join cat on cat.id = p.category_id;

grant select on public.assignment_grade_shares to authenticated;
revoke all on public.assignment_grade_shares from anon;
