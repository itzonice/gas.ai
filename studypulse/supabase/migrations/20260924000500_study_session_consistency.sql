-- A study session's course must match its assignment's course, and its user must
-- own that course. RLS already stops clients from crossing users, but this also
-- covers service-role writers (jobs, imports) and catches same-user mix-ups.
-- If only assignment_id is given, course_id is filled in from the assignment.

create or replace function public.check_study_session_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_course uuid;
  course_owner uuid;
begin
  if new.assignment_id is not null then
    select a.course_id into assignment_course
    from public.assignments a
    where a.id = new.assignment_id;

    if assignment_course is null then
      raise exception 'assignment % does not exist', new.assignment_id
        using errcode = 'foreign_key_violation';
    end if;

    if new.course_id is null then
      new.course_id := assignment_course;
    elsif new.course_id <> assignment_course then
      raise exception 'study session course % does not match assignment course %',
        new.course_id, assignment_course
        using errcode = 'check_violation',
              hint = 'Omit course_id to use the assignment''s course.';
    end if;
  end if;

  select c.user_id into course_owner from public.courses c where c.id = new.course_id;
  if course_owner is distinct from new.user_id then
    raise exception 'study session user does not own course %', new.course_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger study_sessions_check_consistency
before insert or update of course_id, assignment_id, user_id on public.study_sessions
for each row execute function public.check_study_session_consistency();

-- Moving an assignment to another course would strand its sessions; carry them along.
create or replace function public.move_sessions_with_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.study_sessions
  set course_id = new.course_id
  where assignment_id = new.id;
  return new;
end;
$$;

create trigger assignments_move_sessions
after update of course_id on public.assignments
for each row
when (old.course_id is distinct from new.course_id)
execute function public.move_sessions_with_assignment();
