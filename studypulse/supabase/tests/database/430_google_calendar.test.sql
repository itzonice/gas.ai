begin;
delete from auth.users;
select plan(17);

select tests.create_user('gcal@example.com') as u \gset
select tests.create_user('gcal-other@example.com') as o \gset

select tests.authenticate_as_service_role();
-- OAuth state: single use.
select lives_ok(format($$ select public.gcal_begin_oauth(%L, repeat('a', 64)) $$, :'u'), 'state recorded');
select is(public.gcal_consume_oauth_state(repeat('a', 64)), :'u'::uuid, 'the state names who started the flow');
select is(public.gcal_consume_oauth_state(repeat('a', 64)), null::uuid, 'and works only once');

-- Tokens round-trip through Vault.
select public.gcal_save_connection(:'u', 'access-1', 'refresh-1', now() + interval '1 hour');
select results_eq(format($$ select access_token, refresh_token, status::text from public.gcal_credentials(%L) $$, :'u'),
  $$ values ('access-1', 'refresh-1', 'active') $$, 'credentials decrypt from Vault');
select public.gcal_update_tokens(:'u', 'access-2', now() + interval '1 hour');
select results_eq(format($$ select access_token, refresh_token from public.gcal_credentials(%L) $$, :'u'),
  $$ values ('access-2', 'refresh-1') $$, 'a refresh keeps the refresh token unless a new one comes');
select is((select count(*)::int from vault.secrets s join public.google_calendar_connections c
  on s.id in (c.access_token_secret_id, c.refresh_token_secret_id)), 2, 'two secrets, updated in place');

-- Event map resets when the calendar changes.
insert into public.google_calendar_events (user_id, item_key, event_id, content_hash)
values (:'u', 'block:00000000-0000-0000-0000-000000000001', 'e1', 'h');
select public.gcal_set_calendar(:'u', 'cal-1');
select is((select count(*)::int from public.google_calendar_events), 0, 'a new calendar forgets old event ids');

-- Busy times: replaced per window, with a change flag.
select is(public.gcal_replace_busy(:'u', now(), now() + interval '28 days',
  jsonb_build_array(jsonb_build_object('startsAt', now() + interval '1 day', 'endsAt', now() + interval '1 day 2 hours'))),
  true, 'new busy time is a change');
select is(public.gcal_replace_busy(:'u', now(), now() + interval '28 days',
  jsonb_build_array(jsonb_build_object('startsAt', now() + interval '1 day', 'endsAt', now() + interval '1 day 2 hours'))),
  false, 'the same busy time is not');

-- Clients: see their own connection (no token ids), change options, but no service functions.
select tests.authenticate_as(:'u');
select results_eq('select status::text, push_enabled from public.google_calendar_connections',
  $$ values ('active', true) $$, 'users see their connection');
select throws_ok('select access_token_secret_id from public.google_calendar_connections', '42501', null,
  'but not where the tokens are');
select lives_ok('update public.google_calendar_connections set push_enabled = false', 'users can pause pushing');
select throws_ok(format($$ select * from public.gcal_credentials(%L) $$, :'u'), '42501', null,
  'clients cannot read tokens');
select is((select count(*)::int from public.external_busy_times), 1, 'users see their busy times');

-- Disconnect by the owner removes the connection, its secrets, and busy times.
select ok(public.gcal_disconnect(:'u'), 'disconnect');
select tests.authenticate_as_service_role();
select is((select count(*)::int from vault.secrets where name is null and created_at > now() - interval '1 minute'
  and id not in (select unnest(array[access_token_secret_id, refresh_token_secret_id]) from public.lms_connections)), 0,
  'tokens are deleted from Vault');
select is((select count(*)::int from public.external_busy_times), 0, 'busy times go too');

select * from finish();
rollback;
