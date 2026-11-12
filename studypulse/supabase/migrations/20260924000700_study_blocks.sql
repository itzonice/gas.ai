-- Study blocks: planned study time on the calendar, produced by the scheduler,
-- the exam review planner, or the user. A block is `planned` until it is marked
-- `done` or the nightly job marks it `missed`.

create type public.study_block_status as enum ('planned', 'done', 'missed');
create type public.study_block_kind as enum ('study', 'exam_prep', 'review');

create table public.study_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer generated always as (
    floor(extract(epoch from (ends_at - starts_at)) / 60)::integer
  ) stored,
  status public.study_block_status not null default 'planned',
  kind public.study_block_kind not null default 'study',
  source text not null default 'scheduler' check (source in ('scheduler', 'review_plan', 'manual')),
  -- User-placed or user-moved blocks are never moved by the rescheduler.
  locked boolean not null default false,
  -- When the rescheduler replaces a missed block, the new block points at the old one.
  rescheduled_from uuid references public.study_blocks (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_blocks_positive_duration check (ends_at > starts_at),
  constraint study_blocks_max_duration check (ends_at - starts_at <= interval '12 hours')
);

create index study_blocks_user_starts_idx on public.study_blocks (user_id, starts_at);
create index study_blocks_assignment_idx on public.study_blocks (assignment_id);
create index study_blocks_course_idx on public.study_blocks (course_id);
-- The nightly job scans planned blocks that have already ended.
create index study_blocks_planned_ends_idx on public.study_blocks (ends_at) where status = 'planned';

alter table public.study_blocks enable row level security;

create trigger study_blocks_set_updated_at before update on public.study_blocks
for each row execute function public.set_updated_at();

-- Same rules as study sessions: course matches the assignment's, user owns the course.
create trigger study_blocks_check_consistency
before insert or update of course_id, assignment_id, user_id on public.study_blocks
for each row execute function public.check_study_session_consistency();

create or replace function public.sync_study_block_completed_at()
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

create trigger study_blocks_sync_completed_at
before insert or update of status, completed_at on public.study_blocks
for each row execute function public.sync_study_block_completed_at();

-- Moving an assignment to another course carries its blocks along, like sessions.
create or replace function public.move_sessions_with_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.study_sessions set course_id = new.course_id where assignment_id = new.id;
  update public.study_blocks set course_id = new.course_id where assignment_id = new.id;
  return new;
end;
$$;

create policy "Users can view their own study blocks"
on public.study_blocks for select to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can create study blocks in their courses"
on public.study_blocks for insert to authenticated
with check ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can update their own study blocks"
on public.study_blocks for update to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)))
with check ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can delete their own study blocks"
on public.study_blocks for delete to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

revoke all on public.study_blocks from anon;
