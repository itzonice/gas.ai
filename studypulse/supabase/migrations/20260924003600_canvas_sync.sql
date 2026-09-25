-- Incremental Canvas sync. Courses, grade categories (assignment groups), and assignments
-- remember where they came from (lms_connection_id + external_id), so the sync matches
-- by Canvas id, never by name. The user's own edits always win:
-- - Every synced row tracks which of its synced fields the user changed
--   (user_edited_fields); the sync never writes those fields again.
-- - Synced courses and assignments the user deletes are remembered (lms_dismissed_items)
--   and never re-created.
-- - The sync never deletes anything, and never touches status, notes, or archived state.
-- Sync writes happen in lms_apply_canvas_sync, which marks its transaction so the
-- tracking triggers can tell the sync apart from the user.

alter table public.courses
  add column lms_connection_id uuid references public.lms_connections (id) on delete set null,
  add column external_id text check (char_length(external_id) <= 100),
  add column user_edited_fields text[] not null default '{}';
alter table public.grade_categories
  add column external_id text check (char_length(external_id) <= 100),
  add column user_edited_fields text[] not null default '{}';
alter table public.assignments
  add column external_id text check (char_length(external_id) <= 100),
  add column external_updated_at timestamptz,
  add column user_edited_fields text[] not null default '{}';

create unique index courses_lms_external_key on public.courses (user_id, lms_connection_id, external_id)
  where external_id is not null;
create unique index grade_categories_external_key on public.grade_categories (course_id, external_id)
  where external_id is not null;
create unique index assignments_external_key on public.assignments (course_id, external_id)
  where external_id is not null;


create table public.lms_dismissed_items (
  connection_id uuid not null references public.lms_connections (id) on delete cascade,
  item_type text not null check (item_type in ('course', 'assignment')),
  external_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (connection_id, item_type, external_id)
);
alter table public.lms_dismissed_items enable row level security;
revoke all on public.lms_dismissed_items from anon, authenticated;

create or replace function private.in_lms_sync()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('studypulse.lms_sync', true), '') = 'on';
$$;

-- Outside the sync, provenance is read-only: inserts can't claim a Canvas origin (which
-- could plant tombstones on another user's connection), updates can't change or clear
-- it. Then records which synced fields a user edit changed.
create or replace function private.track_user_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fields text[] := tg_argv::text[];
  v_field text;
  v_old jsonb;
  v_new jsonb;
begin
  if private.in_lms_sync() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.external_id := null;
    new.user_edited_fields := '{}';
    if tg_table_name = 'courses' then new.lms_connection_id := null; end if;
    if tg_table_name = 'assignments' then new.external_updated_at := null; end if;
    return new;
  end if;
  new.external_id := old.external_id;
  new.user_edited_fields := old.user_edited_fields;
  if tg_table_name = 'courses' then new.lms_connection_id := old.lms_connection_id; end if;
  if tg_table_name = 'assignments' then new.external_updated_at := old.external_updated_at; end if;
  if new.external_id is null then
    return new;
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_field in array v_fields loop
    if v_old -> v_field is distinct from v_new -> v_field
       and not v_field = any (new.user_edited_fields) then
      new.user_edited_fields := new.user_edited_fields || v_field;
    end if;
  end loop;
  return new;
end;
$$;

create trigger courses_track_user_edits before insert or update on public.courses
for each row execute function private.track_user_edits('name', 'code');
create trigger grade_categories_track_user_edits before insert or update on public.grade_categories
for each row execute function private.track_user_edits('name', 'weight');
create trigger assignments_track_user_edits before insert or update on public.assignments
for each row execute function private.track_user_edits(
  'title', 'due_at', 'points_possible', 'points_earned', 'kind', 'category_id'
);

-- Remembers synced items the user deleted, so the sync doesn't bring them back.
create or replace function private.remember_dismissed_lms_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection uuid;
begin
  if old.external_id is null or private.in_lms_sync() then
    return old;
  end if;
  if tg_table_name = 'courses' then
    v_connection := old.lms_connection_id;
  else
    select c.lms_connection_id into v_connection from public.courses c where c.id = old.course_id;
  end if;
  -- The connection may already be gone (e.g. the whole account is being deleted).
  insert into public.lms_dismissed_items (connection_id, item_type, external_id)
  select v_connection, case tg_table_name when 'courses' then 'course' else 'assignment' end, old.external_id
  where exists (select 1 from public.lms_connections where id = v_connection)
  on conflict do nothing;
  return old;
end;
$$;
revoke execute on function private.remember_dismissed_lms_item() from public, anon, authenticated;

create trigger courses_remember_dismissed after delete on public.courses
for each row execute function private.remember_dismissed_lms_item();
create trigger assignments_remember_dismissed after delete on public.assignments
for each row execute function private.remember_dismissed_lms_item();

-- The sync -------------------------------------------------------------------------------

-- p_courses: [{
--   external_id, name, code, weighted (bool),
--   groups: [{ external_id, name, weight, position }],
--   assignments: [{ external_id, title, due_at, points_possible, points_earned, kind,
--                   group_external_id, external_updated_at }]
-- }]
-- Returns counts. Service role only.
create or replace function public.lms_apply_canvas_sync(p_connection_id uuid, p_courses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_stats jsonb := '{"courses_created":0,"courses_updated":0,"assignments_created":0,"assignments_updated":0,"unchanged":0,"skipped_dismissed":0,"skipped_course_limit":0,"skipped_archived":0}';
  c jsonb;
  g jsonb;
  a jsonb;
  v_course public.courses;
  v_category uuid;
  v_existing public.assignments;
  v_changed boolean;
  v_kind public.assignment_kind;
begin
  select user_id into v_user from public.lms_connections where id = p_connection_id and status = 'active';
  if v_user is null then
    raise exception 'connection not found or not active' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_courses) is distinct from 'array' then
    raise exception 'p_courses must be a JSON array' using errcode = '22023';
  end if;
  perform set_config('studypulse.lms_sync', 'on', true);

  for c in select * from jsonb_array_elements(p_courses) loop
    if exists (select 1 from public.lms_dismissed_items d where d.connection_id = p_connection_id
               and d.item_type = 'course' and d.external_id = c ->> 'external_id') then
      v_stats := jsonb_set(v_stats, '{skipped_dismissed}', to_jsonb((v_stats ->> 'skipped_dismissed')::int + 1));
      continue;
    end if;

    select * into v_course from public.courses
    where user_id = v_user and lms_connection_id = p_connection_id and external_id = c ->> 'external_id';

    if v_course.id is null then
      begin
        insert into public.courses (user_id, name, code, lms_connection_id, external_id)
        values (v_user, left(c ->> 'name', 200), left(c ->> 'code', 50), p_connection_id, c ->> 'external_id')
        returning * into v_course;
        v_stats := jsonb_set(v_stats, '{courses_created}', to_jsonb((v_stats ->> 'courses_created')::int + 1));
      exception when sqlstate 'SPC01' then
        -- Free plan full: skip this course (its assignments too); nothing else changes.
        v_stats := jsonb_set(v_stats, '{skipped_course_limit}', to_jsonb((v_stats ->> 'skipped_course_limit')::int + 1));
        continue;
      end;
    elsif v_course.archived_at is not null then
      v_stats := jsonb_set(v_stats, '{skipped_archived}', to_jsonb((v_stats ->> 'skipped_archived')::int + 1));
      continue;
    else
      update public.courses set
        name = case when 'name' = any (user_edited_fields) then name else left(c ->> 'name', 200) end,
        code = case when 'code' = any (user_edited_fields) then code else left(c ->> 'code', 50) end
      where id = v_course.id
        and (name is distinct from left(c ->> 'name', 200) and not 'name' = any (user_edited_fields)
          or code is distinct from left(c ->> 'code', 50) and not 'code' = any (user_edited_fields));
      if found then
        v_stats := jsonb_set(v_stats, '{courses_updated}', to_jsonb((v_stats ->> 'courses_updated')::int + 1));
      end if;
    end if;

    -- Weighted assignment groups become grade categories (matched by id, else adopted
    -- by name so a category the user already made isn't duplicated).
    if coalesce((c ->> 'weighted')::boolean, false) then
      for g in select * from jsonb_array_elements(coalesce(c -> 'groups', '[]')) loop
        update public.grade_categories set external_id = g ->> 'external_id'
        where course_id = v_course.id and external_id is null and name = left(g ->> 'name', 100)
          and not exists (select 1 from public.grade_categories x
                          where x.course_id = v_course.id and x.external_id = g ->> 'external_id');
        insert into public.grade_categories (course_id, name, weight, position, external_id)
        values (v_course.id, left(g ->> 'name', 100), (g ->> 'weight')::numeric, coalesce((g ->> 'position')::smallint, 0), g ->> 'external_id')
        on conflict (course_id, external_id) where external_id is not null do update set
          name = case when 'name' = any (public.grade_categories.user_edited_fields) then public.grade_categories.name else excluded.name end,
          weight = case when 'weight' = any (public.grade_categories.user_edited_fields) then public.grade_categories.weight else excluded.weight end;
      end loop;
    end if;

    for a in select * from jsonb_array_elements(coalesce(c -> 'assignments', '[]')) loop
      if exists (select 1 from public.lms_dismissed_items d where d.connection_id = p_connection_id
                 and d.item_type = 'assignment' and d.external_id = a ->> 'external_id') then
        v_stats := jsonb_set(v_stats, '{skipped_dismissed}', to_jsonb((v_stats ->> 'skipped_dismissed')::int + 1));
        continue;
      end if;
      select id into v_category from public.grade_categories
      where course_id = v_course.id and external_id = a ->> 'group_external_id';
      v_kind := coalesce((a ->> 'kind')::public.assignment_kind, 'assignment');

      select * into v_existing from public.assignments
      where course_id = v_course.id and external_id = a ->> 'external_id';
      if v_existing.id is null then
        insert into public.assignments (course_id, category_id, title, kind, due_at, points_possible,
          points_earned, source, external_id, external_updated_at)
        values (v_course.id, v_category, left(a ->> 'title', 300), v_kind, (a ->> 'due_at')::timestamptz,
          (a ->> 'points_possible')::numeric, (a ->> 'points_earned')::numeric, 'canvas',
          a ->> 'external_id', (a ->> 'external_updated_at')::timestamptz);
        v_stats := jsonb_set(v_stats, '{assignments_created}', to_jsonb((v_stats ->> 'assignments_created')::int + 1));
        continue;
      end if;

      -- Incremental: nothing changed in Canvas since the last sync (grades are compared
      -- separately; a new score doesn't always bump the assignment's updated_at).
      if v_existing.external_updated_at is not distinct from (a ->> 'external_updated_at')::timestamptz
         and (('points_earned' = any (v_existing.user_edited_fields))
              or v_existing.points_earned is not distinct from (a ->> 'points_earned')::numeric) then
        v_stats := jsonb_set(v_stats, '{unchanged}', to_jsonb((v_stats ->> 'unchanged')::int + 1));
        continue;
      end if;

      update public.assignments s set
        title = case when 'title' = any (s.user_edited_fields) then s.title else left(a ->> 'title', 300) end,
        kind = case when 'kind' = any (s.user_edited_fields) then s.kind else v_kind end,
        due_at = case when 'due_at' = any (s.user_edited_fields) then s.due_at else (a ->> 'due_at')::timestamptz end,
        points_possible = case when 'points_possible' = any (s.user_edited_fields) then s.points_possible else (a ->> 'points_possible')::numeric end,
        points_earned = case when 'points_earned' = any (s.user_edited_fields) then s.points_earned else (a ->> 'points_earned')::numeric end,
        category_id = case when 'category_id' = any (s.user_edited_fields) then s.category_id else coalesce(v_category, s.category_id) end,
        external_updated_at = (a ->> 'external_updated_at')::timestamptz
      where s.id = v_existing.id;
      v_stats := jsonb_set(v_stats, '{assignments_updated}', to_jsonb((v_stats ->> 'assignments_updated')::int + 1));
    end loop;
  end loop;

  update public.lms_connections set last_synced_at = now(), last_error = null where id = p_connection_id;
  -- The flag is transaction-scoped; clear it so later statements in the same
  -- transaction count as the user again. (On an error everything rolls back anyway.)
  perform set_config('studypulse.lms_sync', '', true);
  return v_stats;
end;
$$;

-- Active connections that haven't synced for p_stale. Service role only.
create or replace function public.lms_connections_due(p_stale interval default interval '6 hours', p_limit integer default 50)
returns table (connection_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.user_id from public.lms_connections c
  join public.lms_institutions i on i.id = c.institution_id and i.enabled
  where c.status = 'active' and (c.last_synced_at is null or c.last_synced_at < now() - p_stale)
  order by c.last_synced_at nulls first
  limit p_limit;
$$;

create or replace function public.lms_record_sync_error(p_connection_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lms_connections set last_error = left(p_error, 500) where id = p_connection_id;
$$;

revoke execute on function public.lms_apply_canvas_sync(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.lms_connections_due(interval, integer) from public, anon, authenticated;
revoke execute on function public.lms_record_sync_error(uuid, text) from public, anon, authenticated;
grant execute on function public.lms_apply_canvas_sync(uuid, jsonb) to service_role;
grant execute on function public.lms_connections_due(interval, integer) to service_role;
grant execute on function public.lms_record_sync_error(uuid, text) to service_role;

select cron.schedule('canvas-sync', '41 * * * *', $$ select private.invoke_edge_function('canvas-sync') $$);
