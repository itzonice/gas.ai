-- Organizations (B2B: schools, tutoring programs) and their members.
--
-- Privacy rules, enforced here rather than in any client:
-- - Organizations only ever see AGGREGATE focus hours (org_focus_summary): total study
--   time per week across opted-in students. Never per-student numbers, sessions,
--   courses, grades, or assignments.
-- - Only students who opted in (share_focus_hours, off by default) are counted, and it's
--   computed live, so opting out removes that student from every report, past weeks too.
-- - A week with fewer than 3 contributing students is suppressed, so small groups can't
--   be used to single out one student.
-- - Admins see who is a member (display name, role, whether they share) to manage the
--   roster, nothing more.

create type public.organization_role as enum ('admin', 'student');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  -- Students join with this code; admins can rotate it.
  join_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex')
    check (join_code ~ '^[0-9a-f]{12}$'),
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organization_role not null default 'student',
  share_focus_hours boolean not null default false,
  sharing_changed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_memberships_user_idx on public.organization_memberships (user_id);

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
-- All writes go through the functions below.
revoke insert, update, delete, truncate on public.organizations from anon, authenticated;
revoke insert, update, delete, truncate on public.organization_memberships from anon, authenticated;
revoke all on public.organizations from anon;
revoke all on public.organization_memberships from anon;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
  );
$$;

-- Members see their organizations; only admins see the join code.
revoke select on public.organizations from authenticated;
grant select (id, name, created_at) on public.organizations to authenticated;
create policy "Members can see their organizations"
on public.organizations for select to authenticated
using (private.is_org_member(id));

create policy "Users see their own memberships; admins see their roster"
on public.organization_memberships for select to authenticated
using (user_id = (select auth.uid()) or private.is_org_admin(organization_id));

-- Functions --------------------------------------------------------------------------------

create or replace function public.create_organization(p_name text)
returns table (organization_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.organizations (name) values (trim(p_name)) returning * into v_org;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org.id, v_user, 'admin');
  return query select v_org.id, v_org.join_code;
end;
$$;

-- Joins as a student. Sharing starts OFF; the student opts in separately.
create or replace function public.join_organization(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select id into v_org from public.organizations where join_code = lower(trim(p_join_code));
  if v_org is null then
    raise exception 'invalid join code' using errcode = 'P0002', hint = 'invalid_join_code';
  end if;
  insert into public.organization_memberships (organization_id, user_id)
  values (v_org, v_user)
  on conflict do nothing;
  return v_org;
end;
$$;

create or replace function public.leave_organization(p_organization_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.organization_memberships
  where organization_id = p_organization_id and user_id = (select auth.uid());
$$;

-- The student's own choice; nobody else can change it.
create or replace function public.set_focus_sharing(p_organization_id uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organization_memberships
  set share_focus_hours = p_share, sharing_changed_at = now()
  where organization_id = p_organization_id and user_id = (select auth.uid())
    and share_focus_hours is distinct from p_share;
  if not found and not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = (select auth.uid())
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.rotate_join_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'only organization admins can do this' using errcode = '42501';
  end if;
  update public.organizations set join_code = encode(extensions.gen_random_bytes(6), 'hex')
  where id = p_organization_id returning join_code into v_code;
  return v_code;
end;
$$;

-- Admin view of the roster: names, roles, and whether each student shares. No study data.
create or replace function public.organization_roster(p_organization_id uuid)
returns table (user_id uuid, display_name text, role public.organization_role, share_focus_hours boolean, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'only organization admins can do this' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name, m.role, m.share_focus_hours, m.joined_at
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.role, p.display_name nulls last;
end;
$$;

-- The only study data an organization can see: per ISO week (Monday, UTC), total focus
-- hours across students currently opted in, and how many contributed. Weeks with fewer
-- than 3 contributors are returned with nulls (suppressed), so the week still shows.
create or replace function public.org_focus_summary(p_organization_id uuid, p_weeks integer default 12)
returns table (week_start date, focus_hours numeric, students_counted integer, suppressed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_admin(p_organization_id) then
    raise exception 'only organization admins can do this' using errcode = '42501';
  end if;
  return query
    with weeks as (
      select generate_series(
        date_trunc('week', now() at time zone 'UTC')::date - (least(greatest(p_weeks, 1), 52) - 1) * 7,
        date_trunc('week', now() at time zone 'UTC')::date,
        interval '7 days'
      )::date as week_start
    ),
    per_week as (
      select date_trunc('week', s.started_at at time zone 'UTC')::date as week_start,
             sum(s.duration_minutes) as minutes,
             count(distinct s.user_id) as students
      from public.study_sessions s
      join public.organization_memberships m
        on m.user_id = s.user_id and m.organization_id = p_organization_id
       and m.role = 'student' and m.share_focus_hours
      where s.duration_minutes is not null
        and s.started_at >= (select min(w.week_start) from weeks w)
      group by 1
    )
    select w.week_start,
           case when coalesce(p.students, 0) >= 3 then round(p.minutes / 60.0, 1) end,
           case when coalesce(p.students, 0) >= 3 then p.students::integer end,
           coalesce(p.students, 0) < 3
    from weeks w left join per_week p using (week_start)
    order by w.week_start;
end;
$$;

revoke execute on function public.create_organization(text) from public, anon;
revoke execute on function public.join_organization(text) from public, anon;
revoke execute on function public.leave_organization(uuid) from public, anon;
revoke execute on function public.set_focus_sharing(uuid, boolean) from public, anon;
revoke execute on function public.rotate_join_code(uuid) from public, anon;
revoke execute on function public.organization_roster(uuid) from public, anon;
revoke execute on function public.org_focus_summary(uuid, integer) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.join_organization(text) to authenticated;
grant execute on function public.leave_organization(uuid) to authenticated;
grant execute on function public.set_focus_sharing(uuid, boolean) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;
grant execute on function public.organization_roster(uuid) to authenticated;
grant execute on function public.org_focus_summary(uuid, integer) to authenticated;
revoke execute on function private.is_org_admin(uuid) from public, anon;
revoke execute on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
