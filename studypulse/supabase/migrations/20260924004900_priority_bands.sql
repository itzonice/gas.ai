-- Fixes F5-F7: task_priority mirrors packages/core/src/priority (parity-tested on every
-- fixture). The 0-1 blend of impact and urgency is placed in a band:
--   90-100 overdue and still open; 10-90 dated work with a grade share; 0-10 undated
--   work or work with no category/weight; 0 done or skipped.
-- Missing or non-finite inputs (null, NaN, infinite dates) count as missing, so the
-- result is always a number from 0 to 100.
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
  v_share numeric := case when p_grade_share is null or p_grade_share = 'NaN' then 0 else greatest(0, p_grade_share) end;
  v_minutes numeric := case when p_minutes_remaining is null or p_minutes_remaining = 'NaN' then 0
                            else greatest(0, p_minutes_remaining) end;
  v_daily numeric := case when p_daily_minutes is null or p_daily_minutes = 'NaN' or p_daily_minutes <= 0 then 120
                          else p_daily_minutes end;
  v_dated boolean := p_due_at is not null and isfinite(p_due_at);
  v_impact numeric;
  v_days numeric;
  v_urgency numeric;
  v_base numeric;
  v_min numeric;
  v_max numeric;
begin
  if p_status in ('done', 'skipped') then
    return 0;
  end if;
  -- Infinite share (numeric 'Infinity') saturates like any share >= 30.
  v_impact := sqrt(least(1, v_share / 30.0));
  if not v_dated then
    v_urgency := 0.05;
  else
    v_days := extract(epoch from (p_due_at - p_now)) / 86400.0;
    v_urgency := case when v_days <= 0 then 1 else 1 / (1 + greatest(0, v_days - v_minutes / v_daily)) end;
  end if;
  v_base := 0.55 * v_impact + 0.45 * v_urgency;
  if p_status = 'in_progress' then
    v_base := v_base * 1.1;
  end if;
  v_base := least(1, v_base);
  if v_dated and v_days < 0 then
    v_min := 90; v_max := 100;        -- overdue and still open
  elsif v_dated and v_share > 0 then
    v_min := 10; v_max := 90;         -- dated, counts toward the grade
  else
    v_min := 0; v_max := 10;          -- undated or unweighted
  end if;
  return round(v_min + (v_max - v_min) * v_base, 3);
end;
$$;
