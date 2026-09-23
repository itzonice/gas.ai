begin;
select plan(12);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset

select results_eq(format('select push_enabled, daily_cap from public.notification_prefs where user_id = %L', :'alice'),
  $$ values (true, 6::smallint) $$, 'signup creates default notification prefs');

insert into public.notification_tokens (user_id, provider, token, platform)
values (:'alice', 'expo', 'ExponentPushToken[alice]', 'ios');
insert into public.notification_log (user_id, kind, channel, status, dedupe_key)
values (:'alice', 'due_24h', 'expo', 'sent', 'due_24h:x');

select throws_ok(format($$ insert into public.notification_tokens (user_id, provider, token, platform)
  values (%L, 'expo', 'ExponentPushToken[alice]', 'android') $$, :'bob'),
  '23505', null, 'a token belongs to one account at a time');
select throws_ok(format($$ insert into public.notification_tokens (user_id, provider, token, platform)
  values (%L, 'web_push', 'https://push.example/1', 'web') $$, :'bob'),
  '23514', null, 'web push tokens need keys');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.notification_tokens', 'B cannot read A''s tokens');
select is_empty('delete from public.notification_tokens returning 1', 'B cannot delete A''s tokens');
select is_empty('select 1 from public.notification_log', 'B cannot read A''s log');
select results_eq('select count(*)::int from public.notification_prefs', array[1], 'B sees only their own prefs');
select is_empty(format('update public.notification_prefs set push_enabled = false where user_id = %L returning 1', :'alice'),
  'B cannot change A''s prefs');
select lives_ok($$ update public.notification_prefs set quiet_hours_start = '23:00', daily_cap = 3 $$,
  'user can edit their prefs');
select throws_ok(format('update public.notification_prefs set user_id = %L', :'alice'),
  '42501', null, 'user cannot reassign their prefs row');
select throws_ok($$ insert into public.notification_log (user_id, kind, channel, status, dedupe_key)
  values (auth.uid(), 'due_2h', 'expo', 'sent', 'k') $$, '42501', null, 'clients cannot write the log');
select throws_ok($$ insert into public.notification_tokens (provider, token, platform)
  values ('expo', 'ExponentPushToken[bob]', 'ios') $$, '42501', null, 'tokens are registered via the server function');

select * from finish();
rollback;
