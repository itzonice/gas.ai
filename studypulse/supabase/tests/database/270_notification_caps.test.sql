begin;
delete from auth.users;
select plan(9);

select tests.create_user('ada@example.com', '{"timezone": "America/Chicago"}') as ada \gset
select tests.authenticate_as_service_role();

-- Daily cap: claims in the given (most urgent first) order until the cap is reached.
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 2,
    '[{"key": "due_2h:a", "kind": "due_2h"}, {"key": "due_24h:b", "kind": "due_24h"}, {"key": "morning_digest:d", "kind": "morning_digest"}]'),
  array['due_2h:a', 'due_24h:b'],
  'claims the most urgent reminders up to the cap');
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 2, '[{"key": "morning_digest:d", "kind": "morning_digest"}]'),
  '{}'::text[],
  'nothing more once the cap is reached');
select is((select count(*)::integer from public.notification_dedupe where dedupe_key = 'morning_digest:d'), 0,
  'cap-skipped reminders are not recorded, so they can go out after the day rolls over');

-- Yesterday's (local day) sends don't count.
update public.notification_dedupe set created_at = date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago' - interval '1 minute';
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 2, '[{"key": "morning_digest:d", "kind": "morning_digest"}]'),
  array['morning_digest:d'],
  'the cap resets at local midnight');

-- Cooldown: one assignment doesn't get reminded twice within 6 hours...
delete from public.notification_dedupe;
select public.claim_reminders(:'ada', 'America/Chicago', 10,
  '[{"key": "exam_countdown:e:1", "kind": "exam_countdown", "assignmentId": "e0000000-0000-0000-0000-000000000001"}]');
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 10,
    '[{"key": "due_24h:e", "kind": "due_24h", "assignmentId": "e0000000-0000-0000-0000-000000000001"}, {"key": "due_24h:f", "kind": "due_24h", "assignmentId": "f0000000-0000-0000-0000-000000000001"}]'),
  array['due_24h:f'],
  'a second reminder for the same assignment within 6 hours is suppressed');
select ok((select suppressed from public.notification_dedupe where dedupe_key = 'due_24h:e'),
  'suppressed reminders are recorded so they are not retried');
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 10,
    '[{"key": "due_2h:e", "kind": "due_2h", "assignmentId": "e0000000-0000-0000-0000-000000000001"}]'),
  array['due_2h:e'],
  'the 2-hour reminder is exempt from the cooldown');

-- ...but can be after it.
update public.notification_dedupe set created_at = now() - interval '7 hours';
select is(
  public.claim_reminders(:'ada', 'America/Chicago', 10,
    '[{"key": "due_24h:e2", "kind": "due_24h", "assignmentId": "e0000000-0000-0000-0000-000000000001"}]'),
  array['due_24h:e2'],
  'reminders resume after the cooldown');

select throws_ok($$ select public.claim_reminders(gen_random_uuid(), 'UTC', 1, '{}') $$, '22023', null,
  'rejects a non-array payload');

select * from finish();
rollback;
