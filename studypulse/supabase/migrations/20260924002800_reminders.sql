-- Reminder delivery: the 15-minute send-reminders cron, its data source, and dedupe.

-- One row per reminder ever claimed for sending. Claiming is an insert that does
-- nothing on conflict, so two overlapping cron runs can't both send the same reminder.
create table public.notification_dedupe (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

alter table public.notification_dedupe enable row level security;
-- Internal: service role only.
revoke all on public.notification_dedupe from anon, authenticated;

-- Claims reminders for sending; returns the keys this call won (already-claimed keys
-- are left out). Service role only.
create or replace function public.claim_reminders(p_user_id uuid, p_keys text[])
returns text[]
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.notification_dedupe (user_id, dedupe_key)
    select p_user_id, k from unnest(p_keys) as k
    on conflict do nothing
    returning dedupe_key
  )
  select coalesce(array_agg(dedupe_key), '{}') from claimed;
$$;

-- Users who can receive push reminders, with what the reminder rules need: timezone,
-- prefs, and open assignments due in the next 8 days (7-day exam countdowns included).
-- Paged by user id for large runs. Service role only.
create or replace function public.reminder_batch(p_now timestamptz, p_after uuid default null, p_limit integer default 500)
returns table (user_id uuid, timezone text, prefs jsonb, assignments jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.timezone,
    to_jsonb(np) - 'user_id' - 'created_at' - 'updated_at',
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
  join public.notification_prefs np on np.user_id = p.id
  where np.push_enabled
    and (p_after is null or p.id > p_after)
    and exists (
      select 1 from public.notification_tokens t
      where t.user_id = p.id and t.invalidated_at is null
    )
  order by p.id
  limit p_limit;
$$;

revoke execute on function public.claim_reminders(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.reminder_batch(timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_reminders(uuid, text[]) to service_role;
grant execute on function public.reminder_batch(timestamptz, uuid, integer) to service_role;

-- Old dedupe rows only matter while their reminder could still fire.
create or replace function private.cleanup_notification_dedupe()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.notification_dedupe where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from deleted;
$$;
revoke execute on function private.cleanup_notification_dedupe() from public, anon, authenticated;

select cron.schedule('send-reminders', '*/15 * * * *', $$ select private.invoke_edge_function('send-reminders') $$);
select cron.schedule('cleanup-notification-dedupe', '37 4 * * *', $$ select private.cleanup_notification_dedupe() $$);
