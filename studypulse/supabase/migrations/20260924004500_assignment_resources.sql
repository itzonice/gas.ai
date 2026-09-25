-- Study system, part 5 (prompt 75): per-assignment study links: Khan Academy lessons,
-- NotebookLM notebooks, Anki decks (AnkiWeb shared decks), or any other https link.
-- course_id is carried with a composite key so RLS and account deletion follow the course.

create table public.assignment_resources (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null check (kind in ('khan_academy', 'notebooklm', 'anki_deck', 'other')),
  url text not null check (char_length(url) <= 2048),
  title text check (char_length(trim(title)) between 1 and 200),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_resources_assignment_fkey foreign key (assignment_id, course_id)
    references public.assignments (id, course_id) on delete cascade,
  constraint assignment_resources_unique_url unique (assignment_id, url),
  -- https only, and the host has to match the kind (so a "Khan Academy" badge is honest).
  constraint assignment_resources_url_matches_kind check (
    url ~ '^https://[^/\s@]+(/\S*)?$' and case kind
      when 'khan_academy' then url ~* '^https://([a-z0-9-]+\.)?khanacademy\.org(/|$)'
      when 'notebooklm' then url ~* '^https://notebooklm\.google\.com(/|$)'
      when 'anki_deck' then url ~* '^https://ankiweb\.net/shared/'
      else true
    end
  )
);

create index assignment_resources_assignment_idx on public.assignment_resources (assignment_id, position);
create index assignment_resources_course_idx on public.assignment_resources (course_id);

create trigger assignment_resources_set_updated_at before update on public.assignment_resources
for each row execute function public.set_updated_at();

-- At most 20 links per assignment.
create or replace function private.limit_assignment_resources()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.assignment_resources where assignment_id = new.assignment_id) >= 20 then
    raise exception 'An assignment can have at most 20 links' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.limit_assignment_resources() from public, anon, authenticated;
create trigger assignment_resources_limit before insert on public.assignment_resources
for each row execute function private.limit_assignment_resources();

alter table public.assignment_resources enable row level security;

create policy "Users can view links in their courses"
on public.assignment_resources for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can add links in their courses"
on public.assignment_resources for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update links in their courses"
on public.assignment_resources for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete links in their courses"
on public.assignment_resources for delete to authenticated
using ((select private.owns_course(course_id)));

revoke all on public.assignment_resources from anon;
