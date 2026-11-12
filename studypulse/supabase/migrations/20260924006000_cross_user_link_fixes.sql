-- Fixes from the cross-user access suite (supabase/tests/e2e).
--
-- 1. A flashcard could point at another user's assignment: RLS only checked the card's
--    course, and the assignment foreign key didn't include the course. Cards (and card
--    generations, for defense in depth) now reference the assignment together with its
--    course, the way assignment_resources does, so the assignment must belong to the
--    card's course. Deleting the assignment still just unlinks the card.
update public.flashcards f
set assignment_id = null
where f.assignment_id is not null
  and not exists (
    select 1 from public.assignments a where a.id = f.assignment_id and a.course_id = f.course_id
  );
alter table public.flashcards drop constraint flashcards_assignment_id_fkey;
alter table public.flashcards
  add constraint flashcards_assignment_fkey foreign key (assignment_id, course_id)
  references public.assignments (id, course_id) on delete set null (assignment_id);

update public.card_generations g
set assignment_id = null
where g.assignment_id is not null
  and not exists (
    select 1 from public.assignments a where a.id = g.assignment_id and a.course_id = g.course_id
  );
alter table public.card_generations drop constraint card_generations_assignment_id_fkey;
alter table public.card_generations
  add constraint card_generations_assignment_fkey foreign key (assignment_id, course_id)
  references public.assignments (id, course_id) on delete set null (assignment_id);

-- 2. Registering a push token another account already had moved that account's row to the
--    caller and returned its id (and kept its device id and web push keys). A push token
--    identifies a device, so the device still moves to whoever signed in on it last (the
--    earlier account must stop getting notifications there), but now as a new row: the
--    earlier account's row is deleted and nothing of it is returned or carried over.
create or replace function public.register_push_token(
  p_provider public.push_provider,
  p_token text,
  p_platform text,
  p_device_id text default null,
  p_app_version text default null,
  p_web_push_keys jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_provider = 'expo' and p_token !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'not an Expo push token' using errcode = '22023';
  end if;

  delete from public.notification_tokens
  where provider = p_provider and token = p_token and user_id <> v_user_id;

  insert into public.notification_tokens (user_id, provider, token, platform, device_id, app_version, web_push_keys, last_seen_at, invalidated_at)
  values (v_user_id, p_provider, p_token, p_platform, p_device_id, p_app_version, p_web_push_keys, now(), null)
  on conflict (provider, token) do update
    set platform = excluded.platform,
        device_id = coalesce(excluded.device_id, public.notification_tokens.device_id),
        app_version = coalesce(excluded.app_version, public.notification_tokens.app_version),
        web_push_keys = coalesce(excluded.web_push_keys, public.notification_tokens.web_push_keys),
        last_seen_at = now(),
        invalidated_at = null
    where public.notification_tokens.user_id = v_user_id
  returning id into v_id;

  if v_id is null then
    -- Another account registered the same token between the delete and the insert.
    raise exception 'push token is being registered by another session' using errcode = '40001';
  end if;

  -- Token refresh: older tokens from the same device are no longer valid.
  if p_device_id is not null then
    update public.notification_tokens
    set invalidated_at = now()
    where user_id = v_user_id and device_id = p_device_id and provider = p_provider
      and id <> v_id and invalidated_at is null;
  end if;

  return v_id;
end;
$$;
