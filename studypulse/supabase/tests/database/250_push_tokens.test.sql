begin;
delete from auth.users;
select plan(10);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset

select tests.authenticate_as(:'ada');
select public.register_push_token('expo', 'ExponentPushToken[abc123]', 'ios', 'device-1', '1.0.0') as t1 \gset
select is(public.register_push_token('expo', 'ExponentPushToken[abc123]', 'ios', 'device-1', '1.0.1'), :'t1'::uuid,
  're-registering refreshes the same row');
select is((select app_version from public.notification_tokens where id = :'t1'), '1.0.1', 'app version updated');
select throws_ok($$ select public.register_push_token('expo', 'not-a-token', 'ios') $$, '22023', null,
  'malformed Expo tokens are rejected');

-- Token rotation on the same device retires the old one.
select public.register_push_token('expo', 'ExponentPushToken[def456]', 'ios', 'device-1') as t2 \gset
select isnt((select invalidated_at from public.notification_tokens where id = :'t1'), null, 'the old token on the device is retired');
select is((select invalidated_at from public.notification_tokens where id = :'t2'), null, 'the new token is active');

-- The device signs into Bob's account: the token moves to Bob.
select tests.authenticate_as(:'bob');
select public.register_push_token('expo', 'ExponentPushToken[def456]', 'ios', 'device-1');
select tests.clear_authentication();
select is((select user_id from public.notification_tokens where id = :'t2'), :'bob'::uuid, 'a token moves with the device to the new account');

-- Invalidation and cleanup
select tests.authenticate_as_service_role();
select is(public.invalidate_push_tokens(array[:'t2'::uuid]), 1, 'service role can invalidate tokens');
select tests.clear_authentication();
update public.notification_tokens set invalidated_at = now() - interval '8 days' where id = :'t2';
update public.notification_tokens set last_seen_at = now() - interval '100 days', invalidated_at = null where id = :'t1';
select is(private.cleanup_push_tokens(), 2, 'stale and long-invalid tokens are deleted');

select tests.authenticate_as(:'bob');
select public.register_push_token('expo', 'ExponentPushToken[ghi789]', 'android');
select public.unregister_push_token('expo', 'ExponentPushToken[ghi789]');
select is_empty('select 1 from public.notification_tokens', 'unregistering removes the token');
select throws_ok(format('select public.invalidate_push_tokens(array[%L::uuid])', :'t1'), '42501', null,
  'clients cannot invalidate tokens');

select * from finish();
rollback;
