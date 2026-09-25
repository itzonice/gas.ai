-- Launch safety S21: which Terms of Service version each user accepted, and when, at
-- sign-up and at checkout. Evidence for disputes (S20) and for enforcing the terms.
--
-- - Email sign-up: the form sends terms_version with the sign-up; a trigger records it
--   as the account is created.
-- - Apple/Google sign-up: recorded when the student continues past the age question
--   (accept_terms).
-- - Checkout: stripe-checkout records it (service role) and puts terms_version on the
--   Stripe session and subscription.

create or replace function private.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-25'::text $$;

create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  context text not null check (context in ('signup', 'checkout', 'reaccept')),
  accepted_at timestamptz not null default now()
);
create index terms_acceptances_user_idx on public.terms_acceptances (user_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
create policy "Users can view their own terms acceptances" on public.terms_acceptances
for select to authenticated using ((select auth.uid()) = user_id);

-- Email sign-ups carry terms_version in their metadata; record it once the profile exists
-- (this trigger's name sorts after on_auth_user_created, so it runs after it).
create or replace function private.record_signup_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if v_version is not null and v_version = private.current_terms_version() then
    insert into public.terms_acceptances (user_id, version, context) values (new.id, v_version, 'signup');
  end if;
  return new;
end;
$$;
revoke execute on function private.record_signup_terms() from public, anon, authenticated;

create trigger on_auth_user_created_terms
after insert on auth.users
for each row execute function private.record_signup_terms();

-- The signed-in user accepts the current terms (Apple/Google sign-up, or a new version).
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_version is distinct from private.current_terms_version() then
    raise exception 'These aren''t the current terms. Reload and try again.' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (user_id, version, context)
  values (
    v_user,
    p_version,
    case when exists (select 1 from public.terms_acceptances where user_id = v_user) then 'reaccept' else 'signup' end
  );
end;
$$;
revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- Checkout (service role): the user saw and accepted the current terms on the pricing page.
create or replace function public.record_checkout_terms(p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  insert into public.terms_acceptances (user_id, version, context)
  values (p_user_id, private.current_terms_version(), 'checkout')
  returning version;
$$;
revoke execute on function public.record_checkout_terms(uuid) from public, anon, authenticated;
grant execute on function public.record_checkout_terms(uuid) to service_role;

-- Whether the user has accepted the current terms (clients prompt when it's false).
create or replace function public.terms_current()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.terms_acceptances
    where user_id = (select auth.uid()) and version = private.current_terms_version()
  );
$$;
revoke execute on function public.terms_current() from public, anon;
grant execute on function public.terms_current() to authenticated;
