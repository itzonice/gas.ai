-- Drop-lowest-N per grade category and an optional custom letter-grade scale per course.

alter table public.grade_categories
  add column drop_lowest smallint not null default 0
    constraint grade_categories_drop_lowest_range check (drop_lowest between 0 and 20);

-- A letter scale is a non-empty array of {"letter": "A-", "min": 90} with unique
-- letters and strictly descending minimums between 0 and 100.
create or replace function public.is_valid_letter_scale(scale jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry jsonb;
  prev numeric := null;
  letters text[] := '{}';
  letter text;
  min_value numeric;
begin
  if scale is null then
    return true;
  end if;
  if jsonb_typeof(scale) <> 'array' or jsonb_array_length(scale) = 0 or jsonb_array_length(scale) > 20 then
    return false;
  end if;
  for entry in select value from jsonb_array_elements(scale) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry -> 'min') <> 'number'
       or jsonb_typeof(entry -> 'letter') <> 'string' then
      return false;
    end if;
    letter := trim(entry ->> 'letter');
    min_value := (entry ->> 'min')::numeric;
    if letter = '' or char_length(letter) > 5 or letter = any (letters)
       or min_value < 0 or min_value > 100 or (prev is not null and min_value >= prev) then
      return false;
    end if;
    letters := letters || letter;
    prev := min_value;
  end loop;
  return true;
end;
$$;

alter table public.courses
  add column letter_scale jsonb
    constraint courses_letter_scale_valid check (public.is_valid_letter_scale(letter_scale));

comment on column public.courses.letter_scale is
  'Custom letter scale, e.g. [{"letter":"A","min":93},...]; null uses the default scale.';

-- commit_parsed_syllabus also stores drop_lowest per category and the course's
-- letter scale (payload.course.letter_scale). Same function otherwise.
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

  -- Shape checks with clear messages; column constraints catch the rest.
  if jsonb_typeof(v_course) is distinct from 'object' then
    raise exception 'payload.course must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(v_categories) <> 'array' or jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'payload.categories and payload.assignments must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(v_categories) > 30 or jsonb_array_length(v_assignments) > 500 then
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

  perform private.mark_upload_committed(p_upload_id, v_course_id);
  return v_course_id;
end;
$$;

