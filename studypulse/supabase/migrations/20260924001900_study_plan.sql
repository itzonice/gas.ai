-- Persisting scheduler output. The scheduler itself is TypeScript
-- (packages/core/src/scheduler); this swaps a user's future scheduler-made blocks for a
-- new plan in one transaction.

alter table public.profiles
  add column study_start_time time not null default '16:00';

grant update (study_start_time) on public.profiles to authenticated;

-- p_blocks: [{ "assignment_id", "course_id", "starts_at", "ends_at", "kind" }]
-- Only future, unlocked, still-planned blocks created by the scheduler are replaced;
-- locked, manual, review-plan, done, and missed blocks are never touched.
create or replace function public.replace_study_plan(p_user_id uuid, p_from timestamptz, p_blocks jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and p_user_id is distinct from (select auth.uid()) then
    raise exception 'cannot replace another user''s plan' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 500 then
    raise exception 'p_blocks must be an array of at most 500 blocks' using errcode = '22023';
  end if;

  delete from public.study_blocks
  where user_id = p_user_id
    and starts_at >= p_from
    and status = 'planned'
    and not locked
    and source = 'scheduler';

  insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, kind, source)
  select
    p_user_id,
    (b ->> 'course_id')::uuid,
    (b ->> 'assignment_id')::uuid,
    (b ->> 'starts_at')::timestamptz,
    (b ->> 'ends_at')::timestamptz,
    coalesce(b ->> 'kind', 'study')::public.study_block_kind,
    'scheduler'
  from jsonb_array_elements(p_blocks) b
  where (b ->> 'starts_at')::timestamptz >= p_from;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.replace_study_plan(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.replace_study_plan(uuid, timestamptz, jsonb) to authenticated, service_role;
