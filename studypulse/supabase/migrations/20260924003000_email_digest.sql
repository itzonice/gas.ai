-- Daily email digest (Resend) for users push doesn't reach: push turned off, or no
-- active device. Sent by the send-email-digests cron function at the user's digest time.

-- On by default: it only goes to users without push, and every email has a one-click
-- unsubscribe link (email-unsubscribe function) that turns this off.
alter table public.notification_prefs alter column email_digest_enabled set default true;

-- Users due a digest right now: opted in, confirmed email, push not reaching them,
-- local time within 3 hours after their digest time, and not yet sent today.
-- Includes open assignments due in the next 8 days. Paged by user id. Service role only.
create or replace function public.email_digest_batch(p_now timestamptz, p_after uuid default null, p_limit integer default 500)
returns table (user_id uuid, email text, display_name text, timezone text, digest_time text, assignments jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    u.email::text,
    p.display_name,
    p.timezone,
    to_char(np.morning_digest_time, 'HH24:MI'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'course', coalesce(c.code, c.name), 'kind', a.kind,
        'dueAt', to_char(a.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'status', a.status
      ) order by a.due_at)
      from public.assignments a
      join public.courses c on c.id = a.course_id
      where c.user_id = p.id and c.archived_at is null
        and a.status in ('todo', 'in_progress')
        and a.due_at > p_now and a.due_at <= p_now + interval '8 days'
    ), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.notification_prefs np on np.user_id = p.id
  cross join lateral (select (p_now at time zone p.timezone) as local_now) l
  where np.email_digest_enabled
    and u.email is not null
    and u.email_confirmed_at is not null
    and not (
      np.push_enabled and exists (
        select 1 from public.notification_tokens t where t.user_id = p.id and t.invalidated_at is null
      )
    )
    -- time - time is a signed interval, so this never wraps past midnight (a late
    -- digest time sends until midnight at the latest, as in planEmailDigest).
    and l.local_now::time - np.morning_digest_time between interval '0' and interval '3 hours'
    and not exists (
      select 1 from public.notification_dedupe d
      where d.user_id = p.id and d.dedupe_key = 'email_digest:' || to_char(l.local_now::date, 'YYYY-MM-DD')
    )
    and (p_after is null or p.id > p_after)
  order by p.id
  limit p_limit;
$$;

revoke execute on function public.email_digest_batch(timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.email_digest_batch(timestamptz, uuid, integer) to service_role;

-- One-click unsubscribe (service role; the function verifies the signed link first).
create or replace function public.unsubscribe_email_digest(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notification_prefs set email_digest_enabled = false
    where user_id = p_user_id and email_digest_enabled
    returning 1
  )
  select exists (select 1 from public.notification_prefs where user_id = p_user_id);
$$;

revoke execute on function public.unsubscribe_email_digest(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_email_digest(uuid) to service_role;

select cron.schedule('send-email-digests', '*/15 * * * *', $$ select private.invoke_edge_function('send-email-digests') $$);
