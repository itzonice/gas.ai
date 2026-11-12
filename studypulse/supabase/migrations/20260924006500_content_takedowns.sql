-- Launch safety S17: a record of every copyright notice and what was removed, and one
-- service-only function that removes reported content. Operators run
-- scripts/takedown.mjs (it also deletes the file from storage); see docs/takedowns.md.

create table private.content_takedowns (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null,
  -- Our reference for the notice (ticket or email id), not the notice itself.
  notice_ref text not null check (char_length(notice_ref) between 1 and 200),
  target_type text not null check (target_type in ('syllabus_upload', 'flashcard', 'assignment_resource')),
  target_id uuid not null,
  -- Whose content it was (kept after the content is gone, for repeat-infringer checks).
  user_id uuid,
  reason text check (char_length(reason) <= 2000),
  removed_at timestamptz not null default now(),
  restored_at timestamptz
);
create index content_takedowns_user_idx on private.content_takedowns (user_id);
revoke all on private.content_takedowns from public, anon, authenticated;

-- Removes one reported item and records it. Returns the owner's user id (null if the
-- item was already gone). Service role only.
create or replace function public.takedown_content(
  p_target_type text,
  p_target_id uuid,
  p_notice_ref text,
  p_received_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_target_type = 'syllabus_upload' then
    -- Keep the row (the course may already exist) but drop the text and mark it removed;
    -- the script deletes the stored file.
    update public.syllabus_uploads
    set extracted_text = null,
        status = 'failed',
        error = 'Removed after a copyright notice.'
    where id = p_target_id
    returning user_id into v_user;
  elsif p_target_type = 'flashcard' then
    delete from public.flashcards f using public.courses c
    where f.id = p_target_id and c.id = f.course_id
    returning c.user_id into v_user;
  elsif p_target_type = 'assignment_resource' then
    delete from public.assignment_resources r using public.courses c
    where r.id = p_target_id and c.id = r.course_id
    returning c.user_id into v_user;
  else
    raise exception 'unknown target type %', p_target_type using errcode = '22023';
  end if;

  insert into private.content_takedowns (received_at, notice_ref, target_type, target_id, user_id, reason)
  values (p_received_at, p_notice_ref, p_target_type, p_target_id, v_user, p_reason);
  return v_user;
end;
$$;

-- How many takedowns an account has had (for the repeat-infringer policy).
create or replace function public.takedown_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.content_takedowns
  where user_id = p_user_id and restored_at is null;
$$;

revoke execute on function public.takedown_content(text, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.takedown_count(uuid) from public, anon, authenticated;
grant execute on function public.takedown_content(text, uuid, text, timestamptz, text) to service_role;
grant execute on function public.takedown_count(uuid) to service_role;
