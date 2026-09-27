-- Guard rail (S33): every table in every schema we own has row level security on, and
-- every storage bucket is private. Supabase-managed schemas (auth, storage, realtime, …)
-- and the test helpers' own schema are excluded.
begin;
select plan(3);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and not c.relrowsecurity
      and n.nspname not in (
        'auth', 'storage', 'realtime', '_realtime', 'extensions', 'graphql', 'graphql_public',
        'net', 'cron', 'vault', 'pgsodium', 'pgsodium_masks', 'supabase_functions',
        'supabase_migrations', 'information_schema', 'tests', '_analytics', 'pgbouncer'
      )
      and n.nspname not like 'pg\_%'
  $$,
  'every table in our schemas has RLS enabled'
);

select is_empty(
  $$ select id from storage.buckets where public $$,
  'every storage bucket is private (files are served through short-lived signed URLs)'
);

select is_empty(
  $$
    select n.nspname || '.' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm')
      and n.nspname = 'private'
      and (has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
  $$,
  'API roles have no privileges on private tables and views'
);

select * from finish();
rollback;
