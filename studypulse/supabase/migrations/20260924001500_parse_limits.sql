-- Server-side syllabus parse quotas and Pro-only parse sources.
--
-- Limits live in private.parse_limits() (single source of truth; packages/core/src/plans
-- mirrors them for display). Enforcement is a BEFORE INSERT trigger on
-- syllabus_uploads that locks the user's profile row, so concurrent uploads can't
-- both squeeze under the limit. "Today" is the user's local day (profiles.timezone).
--
-- An upload counts toward the quota unless it failed before any AI call was made
-- (e.g. a bad file), so users aren't charged for our validation errors but can't get
-- free AI work by forcing failures.
--
-- Plan tier comes from profiles.plan_tier for now; the billing prompts replace this
-- with is_pro(user_id).

create or replace function private.parse_limits(p_tier public.plan_tier)
returns table (daily_parses integer, allowed_sources public.syllabus_source[], ocr_allowed boolean)
language sql
immutable
set search_path = ''
as $$
  select l.daily_parses, l.allowed_sources, l.ocr_allowed from (values
    ('free'::public.plan_tier, 3, array['pdf', 'text']::public.syllabus_source[], false),
    ('pro'::public.plan_tier, 25, array['pdf', 'image', 'text', 'url']::public.syllabus_source[], true)
  ) as l(tier, daily_parses, allowed_sources, ocr_allowed)
  where l.tier = p_tier;
$$;

-- Uploads that count toward the user's quota since their local midnight.
create or replace function private.parses_today(p_user_id uuid, p_timezone text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.syllabus_uploads u
  where u.user_id = p_user_id
    and u.created_at >= (date_trunc('day', now() at time zone p_timezone) at time zone p_timezone)
    and (u.status <> 'failed' or jsonb_array_length(u.ai_usage) > 0);
$$;

create or replace function private.enforce_parse_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier public.plan_tier;
  v_timezone text;
  v_limits record;
  v_used integer;
begin
  -- Lock the profile row: serializes concurrent uploads by the same user.
  select p.plan_tier, p.timezone into v_tier, v_timezone
  from public.profiles p
  where p.id = new.user_id
  for update;

  select * into v_limits from private.parse_limits(coalesce(v_tier, 'free'));

  if not (new.source = any (v_limits.allowed_sources)) then
    raise exception 'Importing from % requires StudyPulse Pro', new.source
      using errcode = 'SPP01', hint = 'pro_required';
  end if;

  v_used := private.parses_today(new.user_id, coalesce(v_timezone, 'UTC'));
  if v_used >= v_limits.daily_parses then
    raise exception 'Daily syllabus limit reached (% per day)', v_limits.daily_parses
      using errcode = 'SPL01', hint = 'parse_limit_reached';
  end if;

  return new;
end;
$$;

create trigger syllabus_uploads_enforce_limits
before insert on public.syllabus_uploads
for each row execute function private.enforce_parse_limits();

-- Quota for the current user, for the upload screen.
create or replace function public.get_parse_quota()
returns table (
  plan_tier public.plan_tier,
  daily_limit integer,
  used_today integer,
  remaining integer,
  allowed_sources public.syllabus_source[],
  ocr_allowed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tier public.plan_tier;
  v_timezone text;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.plan_tier, p.timezone into v_tier, v_timezone from public.profiles p where p.id = v_user_id;
  v_used := private.parses_today(v_user_id, coalesce(v_timezone, 'UTC'));
  return query
    select coalesce(v_tier, 'free'), l.daily_parses, v_used, greatest(l.daily_parses - v_used, 0), l.allowed_sources, l.ocr_allowed
    from private.parse_limits(coalesce(v_tier, 'free')) l;
end;
$$;

-- Parse entitlements for a user, for server-side checks the trigger can't make (the
-- pipeline only learns a PDF needs OCR after extracting it). Service role only.
create or replace function public.parse_entitlements(p_user_id uuid)
returns table (plan_tier public.plan_tier, ocr_allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.plan_tier, l.ocr_allowed
  from public.profiles p, private.parse_limits(p.plan_tier) l
  where p.id = p_user_id;
$$;

revoke execute on function private.enforce_parse_limits() from public, anon, authenticated;
revoke execute on function public.parse_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.parse_entitlements(uuid) to service_role;
revoke execute on function public.get_parse_quota() from public, anon;
grant execute on function public.get_parse_quota() to authenticated;
