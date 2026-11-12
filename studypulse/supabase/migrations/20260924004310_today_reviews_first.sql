-- Study system, part 3 (prompt 73): review items before new work, and weekly
-- closed-note practice quizzes per course (twice weekly in the 2 weeks before an exam),
-- planned by packages/core/src/review/practice.ts.

alter table public.study_blocks drop constraint study_blocks_source_check;
alter table public.study_blocks add constraint study_blocks_source_check
  check (source in ('scheduler', 'review_plan', 'practice_plan', 'manual'));

-- Swaps the user's future, unlocked, still-planned practice quizzes for a fresh set.
-- A quiz the user moved (locked) or finished for the same course and local day is kept
-- instead of duplicated.
create or replace function public.replace_practice_plan(p_user_id uuid, p_from timestamptz, p_blocks jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
  v_tz text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_user_id is distinct from (select auth.uid()) then
    raise exception 'cannot replace another user''s practice plan' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 300 then
    raise exception 'p_blocks must be an array of at most 300 blocks' using errcode = '22023';
  end if;

  select coalesce((select timezone from public.profiles where id = p_user_id), 'UTC') into v_tz;

  delete from public.study_blocks
  where user_id = p_user_id
    and source = 'practice_plan'
    and status = 'planned'
    and not locked
    and starts_at >= p_from;

  insert into public.study_blocks (user_id, course_id, starts_at, ends_at, kind, source)
  select p_user_id, (b ->> 'course_id')::uuid, (b ->> 'starts_at')::timestamptz,
         (b ->> 'ends_at')::timestamptz, 'practice_quiz', 'practice_plan'
  from jsonb_array_elements(p_blocks) b
  where (b ->> 'starts_at')::timestamptz >= p_from
    and not exists (
      select 1 from public.study_blocks kept
      where kept.user_id = p_user_id
        and kept.source = 'practice_plan'
        and kept.course_id = (b ->> 'course_id')::uuid
        and (kept.starts_at at time zone v_tz)::date = ((b ->> 'starts_at')::timestamptz at time zone v_tz)::date
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.replace_practice_plan(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.replace_practice_plan(uuid, timestamptz, jsonb) to authenticated, service_role;

-- The Today feed now starts with the day's review items (exam reviews, exam prep, and
-- practice quizzes), then the ranked tasks. Planned review time counts against the
-- day's capacity before any new work is ranked. New columns: item_type ('review' or
-- 'task'), item_id (the block or the assignment), block_kind, block_status, starts_at,
-- ends_at. assignment_id is null for practice quizzes; kind and status are null for
-- review items.
drop function public.get_today_feed(date);

create function public.get_today_feed(p_date date default null)
returns table (
  item_type text,
  item_id uuid,
  assignment_id uuid,
  course_id uuid,
  course_name text,
  title text,
  kind public.assignment_kind,
  status public.assignment_status,
  block_kind public.study_block_kind,
  block_status public.study_block_status,
  starts_at timestamptz,
  ends_at timestamptz,
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

  -- 1. Review items first: the day's review, exam-prep, and practice-quiz blocks (done
  --    ones stay listed so they can be unchecked; missed ones drop off).
  for r in
    select b.id, b.assignment_id, b.course_id, c.name as course_name, b.kind, b.status,
           b.starts_at, b.ends_at, b.duration_minutes, a.title as assignment_title, a.due_at
    from public.study_blocks b
    join public.courses c on c.id = b.course_id and c.archived_at is null
    left join public.assignments a on a.id = b.assignment_id
    where b.user_id = v_user_id
      and b.kind in ('review', 'exam_prep', 'practice_quiz')
      and b.status in ('planned', 'done')
      and b.starts_at >= v_day_start and b.starts_at < v_day_end
    order by b.starts_at, b.id
  loop
    v_rank := v_rank + 1;
    if r.status = 'planned' then
      v_left := greatest(v_left - r.duration_minutes, 0);
    end if;
    item_type := 'review';
    item_id := r.id;
    assignment_id := r.assignment_id;
    course_id := r.course_id;
    course_name := r.course_name;
    title := case r.kind
      when 'practice_quiz' then 'Closed-note practice quiz'
      when 'exam_prep' then coalesce('Exam prep: ' || r.assignment_title, 'Exam prep')
      else coalesce('Review: ' || r.assignment_title, 'Review')
    end;
    kind := null;
    status := null;
    block_kind := r.kind;
    block_status := r.status;
    starts_at := r.starts_at;
    ends_at := r.ends_at;
    due_at := r.due_at;
    grade_share := null;
    minutes_remaining := case when r.status = 'planned' then r.duration_minutes else 0 end;
    planned_minutes := r.duration_minutes;
    priority := null;
    overdue := false;
    rank := v_rank;
    capacity_minutes := v_capacity;
    studied_minutes := v_studied;
    return next;
  end loop;

  -- 2. Then ranked tasks in the time that's left.
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

    item_type := 'task';
    item_id := r.id;
    assignment_id := r.id;
    course_id := r.course_id;
    course_name := r.course_name;
    title := r.title;
    kind := r.kind;
    status := r.status;
    block_kind := null;
    block_status := null;
    starts_at := null;
    ends_at := null;
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
