-- Owner-only row level security. Courses are owned directly through user_id;
-- child tables (grade_categories, assignments, study_sessions) are owned through
-- their course. Policies target `authenticated` only, so `anon` sees nothing.

-- Helpers live in a schema PostgREST doesn't expose, so they can't be called as RPCs.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- True when the current user owns the course. Security definer so the lookup
-- doesn't re-enter courses' own RLS for every child row; the result only ever
-- depends on auth.uid(), so it reveals nothing about other users.
create or replace function private.owns_course(course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = owns_course.course_id
      and c.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.owns_course(uuid) from public, anon;
grant execute on function private.owns_course(uuid) to authenticated, service_role;

-- courses ------------------------------------------------------------------

create policy "Users can view their own courses"
on public.courses for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own courses"
on public.courses for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own courses"
on public.courses for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own courses"
on public.courses for delete to authenticated
using ((select auth.uid()) = user_id);

-- grade_categories -----------------------------------------------------------

create policy "Users can view categories of their courses"
on public.grade_categories for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create categories in their courses"
on public.grade_categories for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update categories of their courses"
on public.grade_categories for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete categories of their courses"
on public.grade_categories for delete to authenticated
using ((select private.owns_course(course_id)));

-- assignments --------------------------------------------------------------

create policy "Users can view assignments of their courses"
on public.assignments for select to authenticated
using ((select private.owns_course(course_id)));

create policy "Users can create assignments in their courses"
on public.assignments for insert to authenticated
with check ((select private.owns_course(course_id)));

create policy "Users can update assignments of their courses"
on public.assignments for update to authenticated
using ((select private.owns_course(course_id)))
with check ((select private.owns_course(course_id)));

create policy "Users can delete assignments of their courses"
on public.assignments for delete to authenticated
using ((select private.owns_course(course_id)));

-- study_sessions -----------------------------------------------------------
-- Checked through the course like other children, and user_id must also be the
-- caller so the denormalized owner can't be spoofed.

create policy "Users can view their own study sessions"
on public.study_sessions for select to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can log study sessions in their courses"
on public.study_sessions for insert to authenticated
with check ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can update their own study sessions"
on public.study_sessions for update to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)))
with check ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

create policy "Users can delete their own study sessions"
on public.study_sessions for delete to authenticated
using ((select auth.uid()) = user_id and (select private.owns_course(course_id)));

-- anon has no policies; drop its default table privileges too (defence in depth).
revoke all on public.profiles, public.courses, public.grade_categories,
  public.assignments, public.study_sessions from anon;
