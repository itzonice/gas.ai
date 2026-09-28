-- Launch safety S33: row level security on every table we own, not just public ones.
-- Tables in `private` were already out of reach (no grants to API roles, schema not
-- exposed), but RLS with no policies adds a second lock: if a grant or an exposed schema
-- is ever added by mistake, API roles still read nothing. The service role (BYPASSRLS)
-- and SECURITY DEFINER functions owned by postgres are unaffected.
do $$
declare
  t record;
begin
  for t in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname in ('private', 'request_guard')
      and not c.relrowsecurity
  loop
    execute format('alter table %I.%I enable row level security', t.nspname, t.relname);
  end loop;
end;
$$;
