-- Launch safety S20: dispute records, evidence facts, and the 90-day rate (service only).
begin;
select plan(6);

select tests.create_user('sam@example.edu', '{"terms_version": "2026-09-25", "display_name": "Sam"}') as sam \gset
select tests.authenticate_as(:'sam');
select throws_ok(format('select public.dispute_evidence_facts(%L)', :'sam'), '42501', null,
  'users cannot read dispute evidence');
select tests.clear_authentication();

insert into public.billing_events (provider, event_id, event_type, event_created_at, result)
select 'stripe', 'evt_paid_' || g, 'invoice.paid', now() - interval '1 day', 'ignored'
from generate_series(1, 200) g;

select tests.authenticate_as_service_role();
select is((public.dispute_evidence_facts(:'sam') ->> 'email'), 'sam@example.edu', 'evidence has the account email');
select is(jsonb_array_length(public.dispute_evidence_facts(:'sam') -> 'termsAcceptances'), 1,
  'and the Terms acceptance record');
select is(public.record_dispute('dp_1', 'ch_1', 3999, 'usd', 'fraudulent', :'sam'::uuid)::text,
  '{"new": true, "charges": 200, "disputes": 1}', 'a new dispute returns the 90-day counts');
select is((public.record_dispute('dp_1', 'ch_1', 3999, 'usd', 'fraudulent', :'sam'::uuid) ->> 'new'), 'false',
  'a Stripe retry is not new (no second alert)');
select is((public.record_dispute('dp_2', 'ch_2', 3999, 'usd', 'general') ->> 'disputes'), '2',
  '2 disputes in 200 charges: 1%, above the 0.5% alert');
select tests.clear_authentication();

select * from finish();
rollback;
