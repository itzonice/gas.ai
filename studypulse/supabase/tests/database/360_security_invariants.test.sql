-- Security invariants from the audit (docs/security-audit.md). Each is a query that must
-- come back empty; a new table, view, policy, or function that breaks one fails here.
begin;
select plan(8);

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'every public table has RLS enabled');

select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname in ('public', 'storage') and roles && array['public', 'anon']::name[]
$$, 'no policy applies to anonymous or PUBLIC');

select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname in ('public', 'storage') and (qual = 'true' or with_check = 'true')
$$, 'no policy is unconditionally true');

select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and cmd in ('UPDATE', 'ALL') and with_check is null
$$, 'every UPDATE policy has a WITH CHECK (rows cannot be moved to another owner)');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)
$$, 'every view runs as the caller (security_invoker), so RLS applies');

select is_empty($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
$$, 'anonymous users have no table privileges');

select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute')
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
$$, 'SECURITY DEFINER functions pin search_path and are not callable anonymously');

select is_empty($$ select id from storage.buckets where public $$, 'no public storage buckets');

select * from finish();
rollback;
