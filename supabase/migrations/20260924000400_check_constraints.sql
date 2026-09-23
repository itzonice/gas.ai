-- Data integrity rules enforced in the database, so no client or job can bypass them.

-- Weights and targets are percentages.
alter table public.grade_categories
  add constraint grade_categories_weight_range check (weight >= 0 and weight <= 100);

alter table public.courses
  add constraint courses_target_grade_range check (target_grade is null or (target_grade >= 0 and target_grade <= 100));

-- Assignment status becomes a real enum.
create type public.assignment_status as enum ('todo', 'in_progress', 'done', 'skipped');

alter table public.assignments alter column status drop default;
alter table public.assignments
  alter column status type public.assignment_status using status::public.assignment_status;
alter table public.assignments alter column status set default 'todo';

-- Effort estimates are positive and sane (at most ~1 week of work).
alter table public.assignments
  add constraint assignments_estimated_minutes_range
  check (estimated_minutes is null or (estimated_minutes > 0 and estimated_minutes <= 10080));

-- Scores: points_possible is positive; points_earned is non-negative and needs a
-- points_possible to be meaningful. Earned may exceed possible (extra credit) up to
-- 2x, which catches typos like 950/100 without blocking real bonus points.
alter table public.assignments
  add constraint assignments_points_possible_positive
  check (points_possible is null or points_possible > 0),
  add constraint assignments_points_earned_range
  check (
    points_earned is null
    or (points_possible is not null and points_earned >= 0 and points_earned <= points_possible * 2)
  );

-- Keep completed_at in step with status so reports can rely on either.
create or replace function public.sync_assignment_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger assignments_sync_completed_at
before insert or update of status, completed_at on public.assignments
for each row execute function public.sync_assignment_completed_at();

-- Study sessions must have a positive duration of at most 24 hours once ended.
alter table public.study_sessions
  add constraint study_sessions_positive_duration
  check (ended_at is null or ended_at > started_at),
  add constraint study_sessions_max_duration
  check (ended_at is null or ended_at - started_at <= interval '24 hours');
