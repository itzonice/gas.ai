-- Launch safety S8: an organization can have more members than one response returns
-- (PostgREST max_rows is 100), so the roster is paged: at most 100 per call, in a stable
-- order, with an offset for the next page.
drop function public.organization_roster(uuid);

create function public.organization_roster(
  p_organization_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
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
    order by m.role, p.display_name nulls last, m.user_id
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.organization_roster(uuid, integer, integer) from public, anon;
grant execute on function public.organization_roster(uuid, integer, integer) to authenticated;
