-- Launch safety S34: no function we own builds SQL by pasting strings together. Dynamic
-- SQL must go through format() with %I (identifiers) and %L (literals), or bind values
-- with EXECUTE ... USING. This fails on any EXECUTE whose statement uses || or format's
-- unquoted %s.
begin;
select plan(3);

-- A deliberately unsafe function, to prove the check sees it (rolled back at the end).
create function public.s34_unsafe_probe(p_table text) returns void language plpgsql as $f$
begin
  execute 'delete from ' || p_table;
end;
$f$;

create temp table our_function_sources as
select n.nspname || '.' || p.proname as name, p.prosrc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private', 'request_guard')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- Each EXECUTE statement, up to its terminating semicolon.
create temp table execute_statements as
select name, (regexp_matches(prosrc, '\mexecute\M([^;]*);', 'gi'))[1] as stmt
from our_function_sources;

select ok(
  exists (select 1 from execute_statements where name = 'public.s34_unsafe_probe' and stmt ~ '\|\|'),
  'the check catches a concatenated EXECUTE'
);

select is_empty(
  $$ select name || ': ' || stmt from execute_statements
     where stmt ~ '\|\|' and name <> 'public.s34_unsafe_probe' $$,
  'no EXECUTE builds its statement with || concatenation'
);

select is_empty(
  $$ select name || ': ' || stmt from execute_statements
     where stmt ~* 'format\s*\(' and stmt ~ '%s' $$,
  'no EXECUTE format() uses unquoted %s; use %I for identifiers and %L for literals'
);

select * from finish();
rollback;
