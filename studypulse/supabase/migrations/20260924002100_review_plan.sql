-- Exam review plans (packages/core/src/review): swaps the future, unlocked, still-planned
-- review_plan blocks of the given exams for a freshly generated set. Blocks the user
-- moved (locked) or finished stay.
create or replace function public.replace_review_plan(
  p_user_id uuid,
  p_from timestamptz,
  p_assignment_ids uuid[],
  p_blocks jsonb
)
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
    raise exception 'cannot replace another user''s review plan' using errcode = '42501';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 300 then
    raise exception 'p_blocks must be an array of at most 300 blocks' using errcode = '22023';
  end if;

  select coalesce((select timezone from public.profiles where id = p_user_id), 'UTC') into v_tz;

  delete from public.study_blocks
  where user_id = p_user_id
    and source = 'review_plan'
    and status = 'planned'
    and not locked
    and starts_at >= p_from
    and (assignment_id = any (p_assignment_ids) or assignment_id is null);

  -- Keep a locked/finished review for the same exam and day instead of duplicating it.
  insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, kind, source)
  select p_user_id, (b ->> 'course_id')::uuid, (b ->> 'assignment_id')::uuid,
         (b ->> 'starts_at')::timestamptz, (b ->> 'ends_at')::timestamptz, 'review', 'review_plan'
  from jsonb_array_elements(p_blocks) b
  where (b ->> 'starts_at')::timestamptz >= p_from
    and not exists (
      select 1 from public.study_blocks kept
      where kept.user_id = p_user_id
        and kept.source = 'review_plan'
        and kept.assignment_id = (b ->> 'assignment_id')::uuid
        -- same local day for the user, not the same UTC day
        and (kept.starts_at at time zone v_tz)::date = ((b ->> 'starts_at')::timestamptz at time zone v_tz)::date
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.replace_review_plan(uuid, timestamptz, uuid[], jsonb) from public, anon;
grant execute on function public.replace_review_plan(uuid, timestamptz, uuid[], jsonb) to authenticated, service_role;
