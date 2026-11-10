-- Study: card sets, spaced review, and notes.
--
-- - card_sets groups flashcards inside a course ("Chapter 5 vocabulary"). A card keeps its
--   course_id and references its set together with that course, so a card can only sit in
--   a set of its own course and ownership still follows the course (rule 5).
-- - Each card carries its own review state (when it's next due, how well it's known). Cards
--   belong to one student, so the state lives on the card.
-- - notes holds the student's class notes, per course.
-- Everything is owner-only through RLS, bounded per course, and deleted with the course.

-- card_sets ---------------------------------------------------------------------

create table public.card_sets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_sets_id_course_key unique (id, course_id)
);

create index card_sets_course_idx on public.card_sets (course_id, updated_at desc);

create trigger card_sets_set_updated_at before update on public.card_sets
for each row execute function public.set_updated_at();

-- At most 200 sets per course.
create or replace function private.limit_card_sets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.card_sets where course_id = new.course_id) >= 200 then
    raise exception 'A course can have at most 200 card sets' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.limit_card_sets() from public, anon, authenticated;
create trigger card_sets_limit before insert on public.card_sets
for each row execute function private.limit_card_sets();

alter table public.card_sets enable row level security;

create policy "Users can view card sets in their courses"
on public.card_sets for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create card sets in their courses"
on public.card_sets for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update card sets in their courses"
on public.card_sets for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete card sets in their courses"
on public.card_sets for delete to authenticated
using ((select private.owns_course(course_id)));

revoke all on public.card_sets from anon;

-- flashcards: a set, an order, a star, and review state ------------------------------

alter table public.flashcards
  add column set_id uuid,
  add column position integer not null default 0 check (position >= 0),
  add column starred boolean not null default false,
  -- Review state. due_at is null until the card is first studied ("new").
  add column due_at timestamptz,
  add column interval_days integer not null default 0 check (interval_days between 0 and 36500),
  add column ease numeric(3, 2) not null default 2.50 check (ease between 1.30 and 3.00),
  add column reps integer not null default 0 check (reps >= 0),
  add column lapses integer not null default 0 check (lapses >= 0),
  add column last_reviewed_at timestamptz;

-- Cards made before sets existed came from notes; they go into one set per course.
insert into public.card_sets (course_id, title)
select distinct f.course_id, 'Cards from notes'
from public.flashcards f;

update public.flashcards f
set set_id = s.id
from public.card_sets s
where s.course_id = f.course_id and f.set_id is null;

with ordered as (
  select id, row_number() over (partition by set_id order by created_at, id) - 1 as pos
  from public.flashcards
)
update public.flashcards f
set position = o.pos
from ordered o
where o.id = f.id;

alter table public.flashcards alter column set_id set not null;
alter table public.flashcards
  add constraint flashcards_set_fkey foreign key (set_id, course_id)
  references public.card_sets (id, course_id) on delete cascade;

create index flashcards_set_idx on public.flashcards (set_id, position);
create index flashcards_due_idx on public.flashcards (course_id, due_at);

-- At most 1,000 cards per set (ten pages of 100, the most a client reads).
create or replace function private.limit_flashcards()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.flashcards where set_id = new.set_id) >= 1000 then
    raise exception 'A card set can have at most 1,000 cards' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.limit_flashcards() from public, anon, authenticated;
create trigger flashcards_limit before insert on public.flashcards
for each row execute function private.limit_flashcards();

-- notes ---------------------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- An empty title shows as "Untitled note".
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 100000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_course_idx on public.notes (course_id, updated_at desc);

create trigger notes_set_updated_at before update on public.notes
for each row execute function public.set_updated_at();

-- At most 500 notes per course.
create or replace function private.limit_notes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.notes where course_id = new.course_id) >= 500 then
    raise exception 'A course can have at most 500 notes' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.limit_notes() from public, anon, authenticated;
create trigger notes_limit before insert on public.notes
for each row execute function private.limit_notes();

alter table public.notes enable row level security;

create policy "Users can view notes in their courses"
on public.notes for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create notes in their courses"
on public.notes for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update notes in their courses"
on public.notes for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete notes in their courses"
on public.notes for delete to authenticated
using ((select private.owns_course(course_id)));

revoke all on public.notes from anon;

-- The Study screen in one call ------------------------------------------------------
-- Courses (for the pickers), every set with its card counts, the most recent notes with
-- a short excerpt (never the whole body), and how many cards were reviewed today in the
-- student's timezone. Runs as the caller, so RLS applies to every row it reads.
create or replace function public.get_study_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_timezone text;
  v_day_start timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select coalesce(p.timezone, 'UTC') into v_timezone from public.profiles p where p.id = v_user;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_day_start := date_trunc('day', now() at time zone v_timezone) at time zone v_timezone;

  return jsonb_build_object(
    'timezone', v_timezone,
    'reviewed_today', (
      select count(*)
      from public.flashcards f
      join public.courses c on c.id = f.course_id and c.archived_at is null
      where f.last_reviewed_at >= v_day_start
    ),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'code', c.code, 'color', c.color
      ) order by coalesce(c.code, c.name), c.id)
      from public.courses c
      where c.archived_at is null
    ), '[]'::jsonb),
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'course_id', s.course_id,
        'title', s.title,
        'description', s.description,
        'updated_at', s.updated_at,
        'cards', n.cards,
        'due', n.due,
        'fresh', n.fresh,
        'starred', n.starred
      ) order by s.updated_at desc, s.id)
      from public.card_sets s
      join public.courses c on c.id = s.course_id and c.archived_at is null
      cross join lateral (
        select
          count(*) as cards,
          count(*) filter (where f.due_at <= now()) as due,
          count(*) filter (where f.due_at is null) as fresh,
          count(*) filter (where f.starred) as starred
        from public.flashcards f
        where f.set_id = s.id
      ) n
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(x.note order by x.pinned desc, x.updated_at desc, x.id)
      from (
        select
          n.id, n.pinned, n.updated_at,
          jsonb_build_object(
            'id', n.id,
            'course_id', n.course_id,
            'title', n.title,
            'excerpt', left(regexp_replace(left(n.body, 600), '\s+', ' ', 'g'), 200),
            'pinned', n.pinned,
            'updated_at', n.updated_at
          ) as note
        from public.notes n
        join public.courses c on c.id = n.course_id and c.archived_at is null
        order by n.pinned desc, n.updated_at desc, n.id
        limit 200
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_study_overview() from public, anon;
grant execute on function public.get_study_overview() to authenticated;
