-- Launch safety S8: reads stay bounded and indexed.
begin;
delete from auth.users;
select plan(4);

select is_empty($$
  select c.conrelid::regclass::text || '.' || a.attname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f' and n.nspname in ('public', 'private') and array_length(c.conkey, 1) = 1
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
$$, 'every foreign key has an index');

-- A roster bigger than one page comes back in pages of at most 100.
select tests.create_user('admin@example.com') as admin \gset
select tests.authenticate_as(:'admin');
select join_code from public.create_organization('Big School') \gset
select organization_id as org from public.organization_memberships limit 1 \gset
select tests.clear_authentication();
insert into public.organization_memberships (organization_id, user_id, role)
select :'org', tests.create_user('m' || g || '@example.com'), 'student' from generate_series(1, 120) g;
select tests.authenticate_as(:'admin');

select is((select count(*)::int from public.organization_roster(:'org', 500)), 100, 'a page never exceeds 100');
select is((select count(*)::int from public.organization_roster(:'org', 100, 100)), 21, 'the next page has the rest');
select is(
  (select count(distinct user_id)::int from (
     select user_id from public.organization_roster(:'org', 100, 0)
     union all select user_id from public.organization_roster(:'org', 100, 100)) x),
  121, 'pages don''t overlap or skip anyone');

select * from finish();
rollback;
