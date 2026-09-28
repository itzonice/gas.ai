-- Study system, part 2 (prompt 72): notes -> retrieval cards. Each generation is logged
-- (for the daily limit and AI cost monitoring); the cards themselves go into flashcards,
-- so the Anki and Quizlet exports include them.

create table public.card_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  notes_chars integer not null check (notes_chars > 0),
  card_count integer not null default 0 check (card_count >= 0),
  prompt_version text,
  error text,
  ai_usage jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index card_generations_user_created_idx on public.card_generations (user_id, created_at);

create trigger card_generations_set_updated_at before update on public.card_generations
for each row execute function public.set_updated_at();

-- Users can see their own history; only the edge function (service role) writes.
alter table public.card_generations enable row level security;

create policy "Users can view their card generations"
on public.card_generations for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.card_generations from anon;
revoke insert, update, delete on public.card_generations from authenticated;

-- Limits: Free 5 generations a day, Pro 50 (the user's local day). Failures before any AI
-- call don't count; failures after one do, so forcing errors can't buy free AI work.
create or replace function private.card_generation_limit(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when public.is_pro(p_user_id) then 50 else 5 end;
$$;

create or replace function private.card_generations_today(p_user_id uuid, p_timezone text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.card_generations g
  where g.user_id = p_user_id
    and g.created_at >= (date_trunc('day', now() at time zone p_timezone) at time zone p_timezone)
    and (g.status <> 'failed' or jsonb_array_length(g.ai_usage) > 0);
$$;

create or replace function private.enforce_card_generation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_limit integer;
begin
  -- Lock the profile row so concurrent requests can't both squeeze under the limit.
  select p.timezone into v_timezone from public.profiles p where p.id = new.user_id for update;
  v_limit := private.card_generation_limit(new.user_id);
  if private.card_generations_today(new.user_id, coalesce(v_timezone, 'UTC')) >= v_limit then
    raise exception 'Daily card limit reached (% per day)', v_limit
      using errcode = 'SPK01', hint = 'card_limit_reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_card_generation_limit() from public, anon, authenticated;

create trigger card_generations_enforce_limit
before insert on public.card_generations
for each row execute function private.enforce_card_generation_limit();

-- Remaining generations today, for the notes screen.
create or replace function public.get_card_quota()
returns table (daily_limit integer, used_today integer, remaining integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer;
  v_used integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_limit := private.card_generation_limit(v_user);
  v_used := private.card_generations_today(
    v_user, coalesce((select timezone from public.profiles where id = v_user), 'UTC'));
  return query select v_limit, v_used, greatest(v_limit - v_used, 0);
end;
$$;

revoke execute on function public.get_card_quota() from public, anon;
grant execute on function public.get_card_quota() to authenticated;

-- AI cost monitoring (prompt 69) now counts card generations too. `uploads` still
-- counts syllabus uploads; `cost_cents` covers both.
create or replace function public.ai_cost_by_user(p_since timestamptz, p_until timestamptz default now())
returns table (user_id uuid, uploads integer, cost_cents numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, sum(x.uploads)::integer, round(sum(x.cost), 4)
  from (
    select s.user_id, 1 as uploads, private.ai_usage_cost_cents(s.ai_usage) as cost
    from public.syllabus_uploads s
    where s.created_at >= p_since and s.created_at <= p_until and s.ai_usage <> '[]'::jsonb
    union all
    select g.user_id, 0, private.ai_usage_cost_cents(g.ai_usage)
    from public.card_generations g
    where g.created_at >= p_since and g.created_at <= p_until and g.ai_usage <> '[]'::jsonb
  ) x
  group by x.user_id
  order by 3 desc;
$$;
