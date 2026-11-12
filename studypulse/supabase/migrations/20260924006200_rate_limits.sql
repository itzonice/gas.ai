-- Launch safety S10: per-user and per-IP rate limits for every edge function (and per
-- token for the ICS feed). Fixed-window counters: one row per bucket per window. Buckets
-- name the function and a user id, or a SHA-256 of the client IP (raw IPs are never
-- stored); rows are deleted after a day.

create table private.rate_limit_counters (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
create index rate_limit_counters_window_idx on private.rate_limit_counters (window_start);
revoke all on private.rate_limit_counters from public, anon, authenticated;

-- Counts one hit on `p_bucket` and says whether it's within `p_limit` per window.
-- Returns {allowed, remaining, retry_after} (retry_after in whole seconds, 0 if allowed).
create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds not between 1 and 86400 or char_length(p_bucket) not between 1 and 200 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limit_counters as c (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning hits into v_hits;
  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'remaining', greatest(p_limit - v_hits, 0),
    'retry_after', case when v_hits <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now()))))::integer end
  );
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create or replace function private.cleanup_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.rate_limit_counters where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from gone;
$$;
revoke execute on function private.cleanup_rate_limits() from public, anon, authenticated;

select cron.schedule('cleanup-rate-limits', '*/15 * * * *', $$ select private.cleanup_rate_limits() $$);
