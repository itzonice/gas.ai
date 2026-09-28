-- Launch safety S20: chargebacks. stripe-webhook records each dispute here, gathers
-- evidence (dispute_evidence_facts), stages it on the Stripe dispute, and alerts the
-- owner, louder when disputes pass 0.5% of charges in the last 90 days.

create table private.billing_disputes (
  dispute_id text primary key check (dispute_id ~ '^dp_[A-Za-z0-9]+$'),
  charge_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  amount_cents integer not null,
  currency text not null,
  reason text not null,
  evidence_due_by timestamptz,
  -- The text evidence staged on the dispute, as sent.
  evidence jsonb,
  created_at timestamptz not null default now()
);
create index billing_disputes_created_idx on private.billing_disputes (created_at);
create index billing_disputes_user_idx on private.billing_disputes (user_id);
revoke all on private.billing_disputes from public, anon, authenticated;

-- What we know about an account, for dispute evidence (service role only). Sign-ins are
-- the account's sessions (time and browser; no IP addresses).
create or replace function public.dispute_evidence_facts(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = p_user_id),
    'name', (select p.display_name from public.profiles p where p.id = p_user_id),
    'termsAcceptances', coalesce((
      select jsonb_agg(jsonb_build_object('version', t.version, 'context', t.context,
                                          'accepted_at', t.accepted_at) order by t.accepted_at)
      from public.terms_acceptances t where t.user_id = p_user_id
    ), '[]'::jsonb),
    'signIns', coalesce((
      select jsonb_agg(jsonb_build_object('at', s.created_at, 'user_agent', left(s.user_agent, 200))
                       order by s.created_at desc)
      from (select * from auth.sessions where user_id = p_user_id order by created_at desc limit 20) s
    ), '[]'::jsonb),
    'usage', jsonb_build_object(
      'courses', (select count(*) from public.courses c where c.user_id = p_user_id),
      'uploads', (select count(*) from public.syllabus_uploads x where x.user_id = p_user_id),
      'study_sessions', (select count(*) from public.study_sessions s where s.user_id = p_user_id),
      'study_minutes', (select coalesce(sum(s.duration_minutes), 0) from public.study_sessions s
                        where s.user_id = p_user_id),
      'first_active_at', (select min(s.started_at) from public.study_sessions s where s.user_id = p_user_id),
      'last_active_at', (select max(s.started_at) from public.study_sessions s where s.user_id = p_user_id)
    )
  );
$$;

-- Records a dispute (idempotent on its id) and returns {new, disputes, charges}: whether
-- it was new (so a Stripe retry doesn't alert twice) and the 90-day counts, where charges
-- are paid Stripe invoices seen by the webhook.
create or replace function public.record_dispute(
  p_dispute_id text,
  p_charge_id text,
  p_amount_cents integer,
  p_currency text,
  p_reason text,
  p_user_id uuid default null,
  p_evidence_due_by timestamptz default null,
  p_evidence jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  insert into private.billing_disputes
    (dispute_id, charge_id, user_id, amount_cents, currency, reason, evidence_due_by, evidence)
  values
    (p_dispute_id, p_charge_id, p_user_id, p_amount_cents, p_currency, p_reason, p_evidence_due_by, p_evidence)
  on conflict (dispute_id) do nothing
  returning true into v_new;
  return jsonb_build_object(
    'new', coalesce(v_new, false),
    'disputes', (select count(*) from private.billing_disputes
                 where created_at > now() - interval '90 days'),
    'charges', (select count(*) from public.billing_events
                where provider = 'stripe' and event_type = 'invoice.paid'
                  and event_created_at > now() - interval '90 days')
  );
end;
$$;

revoke execute on function public.dispute_evidence_facts(uuid) from public, anon, authenticated;
revoke execute on function public.record_dispute(text, text, integer, text, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.dispute_evidence_facts(uuid) to service_role;
grant execute on function public.record_dispute(text, text, integer, text, text, uuid, timestamptz, jsonb) to service_role;
