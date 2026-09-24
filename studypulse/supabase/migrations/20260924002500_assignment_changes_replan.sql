-- When assignments change, keep study blocks valid immediately and replan soon after.
--
-- In the same transaction as the edit:
--   * due date moved earlier: planned blocks for it that now end after the new due time
--     are deleted (a block must never sit past its deadline, even briefly)
--   * marked done/skipped: its future planned blocks are deleted (the time is freed)
-- Then the user is queued for a replan; pg_cron drains the queue every minute into the
-- nightly-replan function, so a burst of edits becomes one replan.

create table public.replan_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text
);

alter table public.replan_requests enable row level security;
-- No policies: internal queue, service role only.
revoke all on public.replan_requests from anon, authenticated;

create or replace function private.request_replan(p_user_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.replan_requests (user_id, requested_at, reason)
  values (p_user_id, now(), p_reason)
  on conflict (user_id) do update set requested_at = excluded.requested_at, reason = excluded.reason;
$$;

create or replace function private.on_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select c.user_id into v_user_id
  from public.courses c
  where c.id = coalesce(new.course_id, old.course_id);
  if v_user_id is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform private.request_replan(v_user_id, 'assignment_deleted');
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if new.status in ('done', 'skipped') and old.status not in ('done', 'skipped') then
      delete from public.study_blocks
      where assignment_id = new.id and status = 'planned' and starts_at > now();
    end if;
    if new.due_at is distinct from old.due_at and new.due_at is not null then
      delete from public.study_blocks
      where assignment_id = new.id and status = 'planned' and ends_at > new.due_at;
    end if;
    -- Only changes that affect planning trigger a replan.
    if new.due_at is not distinct from old.due_at
       and new.status is not distinct from old.status
       and new.estimated_minutes is not distinct from old.estimated_minutes
       and new.kind is not distinct from old.kind
       and new.category_id is not distinct from old.category_id
       and new.points_possible is not distinct from old.points_possible then
      return null;
    end if;
  end if;

  perform private.request_replan(v_user_id, lower(tg_op) || '_assignment');
  return null;
end;
$$;

create trigger assignments_replan
after insert or update or delete on public.assignments
for each row execute function private.on_assignment_change();

-- Drains up to 200 queued users into one nightly-replan call (which also marks missed
-- blocks). Requests younger than 20 seconds wait for the next run, so a user editing
-- several assignments in a row gets a single replan.
create or replace function private.process_replan_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with picked as (
    select user_id from public.replan_requests
    where requested_at < now() - interval '20 seconds'
    order by requested_at
    limit 200
    for update skip locked
  ),
  deleted as (
    delete from public.replan_requests r using picked where r.user_id = picked.user_id
    returning r.user_id
  )
  select array_agg(user_id) into v_ids from deleted;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;
  perform private.invoke_edge_function('nightly-replan', jsonb_build_object('user_ids', to_jsonb(v_ids)));
  return cardinality(v_ids);
end;
$$;

revoke execute on function private.request_replan(uuid, text) from public, anon, authenticated;
revoke execute on function private.on_assignment_change() from public, anon, authenticated;
revoke execute on function private.process_replan_requests() from public, anon, authenticated;

select cron.schedule('process-replan-requests', '* * * * *', $$ select private.process_replan_requests() $$);
