-- Study system, part 1 (prompt 71): weekly class meetings, parsed from syllabi, and a
-- "make 5-20 cards" task after each class, due within 24 hours of it ending.

create table public.course_meetings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- ISO weekday: 1 = Monday ... 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  -- Local wall-clock times in the user's timezone (profiles.timezone).
  start_time time not null,
  end_time time not null,
  kind text not null default 'lecture' check (kind in ('lecture', 'lab', 'discussion', 'other')),
  location text check (char_length(location) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_meetings_positive_duration check (end_time > start_time),
  constraint course_meetings_unique unique (course_id, weekday, start_time, kind),
  -- Target for the composite foreign key from assignments.
  constraint course_meetings_id_course_key unique (id, course_id)
);

create index course_meetings_course_idx on public.course_meetings (course_id);

create trigger course_meetings_updated_at before update on public.course_meetings
for each row execute function public.set_updated_at();

alter table public.course_meetings enable row level security;

create policy "Users can view meetings of their courses"
on public.course_meetings for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create meetings in their courses"
on public.course_meetings for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update meetings of their courses"
on public.course_meetings for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete meetings of their courses"
on public.course_meetings for delete to authenticated
using ((select private.owns_course(course_id)));

revoke all on public.course_meetings from anon;

-- Card tasks are ordinary assignments (so they rank in Today, show on the calendar, and
-- get reminders) that remember which class they follow. The composite key keeps the
-- meeting inside the assignment's own course; one task per meeting per class date.
alter table public.assignments
  add column meeting_id uuid,
  add column class_date date,
  add constraint assignments_meeting_fkey foreign key (meeting_id, course_id)
    references public.course_meetings (id, course_id) on delete set null (meeting_id),
  add constraint assignments_class_date_needs_meeting check (class_date is null or meeting_id is not null);

create unique index assignments_meeting_class_key on public.assignments (meeting_id, class_date)
  where meeting_id is not null;

alter table public.assignments drop constraint assignments_source_check;
alter table public.assignments add constraint assignments_source_check
  check (source in ('manual', 'syllabus', 'canvas', 'study_system'));

-- Students can turn card tasks off.
alter table public.profiles add column card_tasks_enabled boolean not null default true;

-- Creates the card task for every class that ended in the last 24 hours (in each user's
-- timezone) and doesn't have one yet. Idempotent, so it can run as often as we like and
-- catches up after a missed run. Skips archived courses, days outside the term, and
-- classes that ended before the meeting was added.
create or replace function private.create_card_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with classes as (
    select m.id as meeting_id, m.course_id, coalesce(c.code, c.name) as course_label, d.class_date,
           (d.class_date + m.end_time) at time zone p.timezone as ended_at
    from public.course_meetings m
    join public.courses c on c.id = m.course_id and c.archived_at is null
    join public.profiles p on p.id = c.user_id and p.card_tasks_enabled
    cross join lateral (
      -- Yesterday and today in the user's timezone cover every class that ended in the last day.
      select ((now() at time zone p.timezone)::date - g) as class_date from generate_series(0, 1) g
    ) d
    where extract(isodow from d.class_date) = m.weekday
      and (c.term_start is null or d.class_date >= c.term_start)
      and (c.term_end is null or d.class_date <= c.term_end)
  )
  insert into public.assignments (course_id, title, kind, due_at, estimated_minutes, source, meeting_id, class_date)
  select k.course_id,
         format('Make 5–20 cards: %s, %s class', k.course_label, to_char(k.class_date, 'Dy Mon FMDD')),
         'other', k.ended_at + interval '24 hours', 20, 'study_system', k.meeting_id, k.class_date
  from classes k
  join public.course_meetings m on m.id = k.meeting_id
  where k.ended_at <= now()
    and k.ended_at > now() - interval '24 hours'
    and k.ended_at >= m.created_at
  on conflict (meeting_id, class_date) where meeting_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.create_card_tasks() from public, anon, authenticated;

select cron.schedule('create-card-tasks', '*/15 * * * *', $$ select private.create_card_tasks() $$);

-- commit_parsed_syllabus also stores the class meetings (payload.meetings, optional).
create or replace function public.commit_parsed_syllabus(p_upload_id uuid, p_payload jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_upload record;
  v_payload jsonb;
  v_course jsonb;
  v_course_id uuid;
  v_categories jsonb;
  v_assignments jsonb;
  v_meetings jsonb;
  v_bad text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_upload from private.claim_upload_for_commit(p_upload_id);
  if not found then
    raise exception 'syllabus upload % not found', p_upload_id using errcode = 'P0002';
  end if;
  if v_upload.status = 'committed' and v_upload.course_id is not null then
    return v_upload.course_id; -- retry of a successful commit
  end if;
  if v_upload.status <> 'parsed' then
    raise exception 'syllabus upload is %, not parsed', v_upload.status using errcode = '55000';
  end if;

  v_payload := coalesce(p_payload, v_upload.parse_result);
  v_course := v_payload -> 'course';
  v_categories := coalesce(v_payload -> 'categories', '[]'::jsonb);
  v_assignments := coalesce(v_payload -> 'assignments', '[]'::jsonb);
  v_meetings := coalesce(v_payload -> 'meetings', '[]'::jsonb);

  -- Shape checks with clear messages; column constraints catch the rest.
  if jsonb_typeof(v_course) is distinct from 'object' then
    raise exception 'payload.course must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(v_categories) <> 'array' or jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'payload.categories and payload.assignments must be arrays' using errcode = '22023';
  end if;
  if jsonb_typeof(v_meetings) <> 'array' then
    raise exception 'payload.meetings must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_categories) > 30 or jsonb_array_length(v_assignments) > 500
     or jsonb_array_length(v_meetings) > 30 then
    raise exception 'too many categories or assignments' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_categories) c
    where jsonb_typeof(c) <> 'object' or nullif(trim(c ->> 'name'), '') is null
  ) then
    raise exception 'every category needs a name' using errcode = '22023';
  end if;
  if exists (
    select lower(trim(c ->> 'name')) from jsonb_array_elements(v_categories) c
    group by 1 having count(*) > 1
  ) then
    raise exception 'category names must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_assignments) a
    where jsonb_typeof(a) <> 'object' or nullif(trim(a ->> 'title'), '') is null
  ) then
    raise exception 'every assignment needs a title' using errcode = '22023';
  end if;
  select a ->> 'category_name' into v_bad
  from jsonb_array_elements(v_assignments) a
  where nullif(trim(a ->> 'category_name'), '') is not null
    and not exists (
      select 1 from jsonb_array_elements(v_categories) c
      where lower(trim(c ->> 'name')) = lower(trim(a ->> 'category_name'))
    )
  limit 1;
  if v_bad is not null then
    raise exception 'assignment category "%" is not in categories', v_bad using errcode = '22023';
  end if;

  -- Course
  insert into public.courses (user_id, name, code, instructor, term_start, term_end, target_grade, color, letter_scale)
  values (
    v_user_id,
    trim(v_course ->> 'name'),
    nullif(trim(v_course ->> 'code'), ''),
    nullif(trim(v_course ->> 'instructor'), ''),
    (v_course ->> 'term_start')::date,
    (v_course ->> 'term_end')::date,
    (v_course ->> 'target_grade')::numeric,
    nullif(v_course ->> 'color', ''),
    nullif(v_course -> 'letter_scale', 'null'::jsonb)
  )
  returning id into v_course_id;

  -- Categories (weight null means "unknown"; store 0 so the student fills it in)
  insert into public.grade_categories (course_id, name, weight, drop_lowest, position)
  select
    v_course_id,
    trim(c.value ->> 'name'),
    coalesce((c.value ->> 'weight')::numeric, 0),
    coalesce((c.value ->> 'drop_lowest')::smallint, 0),
    (c.ordinality - 1)::smallint
  from jsonb_array_elements(v_categories) with ordinality as c;

  -- Assignments, linked to categories by case-insensitive name
  insert into public.assignments (
    course_id, category_id, title, kind, due_at, points_possible, estimated_minutes, source
  )
  select
    v_course_id,
    gc.id,
    trim(a ->> 'title'),
    coalesce(nullif(a ->> 'kind', ''), 'assignment')::public.assignment_kind,
    (a ->> 'due_at')::timestamptz,
    (a ->> 'points_possible')::numeric,
    (a ->> 'estimated_minutes')::integer,
    'syllabus'
  from jsonb_array_elements(v_assignments) a
  left join public.grade_categories gc
    on gc.course_id = v_course_id
   and lower(gc.name) = lower(trim(a ->> 'category_name'));

  -- Class meetings (weekday as mon..sun or ISO 1..7); duplicates collapse.
  insert into public.course_meetings (course_id, weekday, start_time, end_time, kind, location)
  select distinct on (w.weekday, (m ->> 'start_time')::time, coalesce(m ->> 'kind', 'lecture'))
    v_course_id,
    w.weekday,
    (m ->> 'start_time')::time,
    (m ->> 'end_time')::time,
    coalesce(nullif(m ->> 'kind', ''), 'lecture'),
    nullif(trim(m ->> 'location'), '')
  from jsonb_array_elements(v_meetings) m
  cross join lateral (
    select coalesce(
      array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], lower(m ->> 'weekday')),
      case when (m ->> 'weekday') ~ '^[1-7]$' then (m ->> 'weekday')::int end
    )::smallint as weekday
  ) w;

  perform private.mark_upload_committed(p_upload_id, v_course_id);
  return v_course_id;
end;
$$;
