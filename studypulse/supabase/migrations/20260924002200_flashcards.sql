-- Flashcards for review, exportable to Anki and Quizlet. Owned through their course,
-- like other child tables.
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  front text not null check (char_length(trim(front)) between 1 and 2000),
  back text not null check (char_length(trim(back)) between 1 and 5000),
  tags text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_course_idx on public.flashcards (course_id);
create index flashcards_assignment_idx on public.flashcards (assignment_id);

alter table public.flashcards enable row level security;

create trigger flashcards_set_updated_at before update on public.flashcards
for each row execute function public.set_updated_at();

create policy "Users can view cards in their courses"
on public.flashcards for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create cards in their courses"
on public.flashcards for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update cards in their courses"
on public.flashcards for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete cards in their courses"
on public.flashcards for delete to authenticated
using ((select private.owns_course(course_id)));

revoke all on public.flashcards from anon;
