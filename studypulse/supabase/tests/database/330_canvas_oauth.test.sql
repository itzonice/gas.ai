begin;
delete from auth.users;
select plan(22);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.authenticate_as_service_role();

select public.lms_register_institution('State U', 'https://canvas.stateu.edu', '10000000000001', 'client-s3cret') as inst \gset
select is((select client_secret from public.lms_institution_client(:'inst')), 'client-s3cret', 'client secret decrypts from Vault');
select ok(not exists (select 1 from public.lms_institutions i where to_jsonb(i)::text like '%client-s3cret%'),
  'the table holds no plaintext secret');
select throws_ok($$ select public.lms_register_institution('Bad', 'http://canvas.bad.edu', 'x', 'y') $$, '23514', null,
  'only https base URLs');

-- OAuth state: single use, expires ------------------------------------------------------------
select public.lms_begin_oauth(:'ada', :'inst', repeat('a', 64));
select results_eq(format($$ select user_id, institution_id from public.lms_consume_oauth_state(%L) $$, repeat('a', 64)),
  format($$ values (%L::uuid, %L::uuid) $$, :'ada', :'inst'), 'a state resolves to who started it');
select is_empty(format($$ select 1 from public.lms_consume_oauth_state(%L) $$, repeat('a', 64)), 'and only once');
select public.lms_begin_oauth(:'ada', :'inst', repeat('b', 64));
update public.lms_oauth_states set expires_at = now() - interval '1 second';
select is_empty(format($$ select 1 from public.lms_consume_oauth_state(%L) $$, repeat('b', 64)), 'expired states are refused');

-- Connections -----------------------------------------------------------------------------------
select public.lms_save_connection(:'ada', :'inst', 'access-1', '42', 'Ada L', 'refresh-1', now() + interval '1 hour') as conn \gset
select results_eq(format($$ select access_token, refresh_token, client_secret, base_url from public.lms_connection_credentials(%L) $$, :'conn'),
  $$ values ('access-1', 'refresh-1', 'client-s3cret', 'https://canvas.stateu.edu') $$, 'credentials decrypt');
select ok(not exists (select 1 from public.lms_connections c where to_jsonb(c)::text like '%access-1%'),
  'no plaintext token in the table');

select public.lms_update_tokens(:'conn', 'access-2', now() + interval '1 hour');
select is((select access_token from public.lms_connection_credentials(:'conn')), 'access-2', 'refresh stores the new access token');
select is((select refresh_token from public.lms_connection_credentials(:'conn')), 'refresh-1', 'and keeps the refresh token');

select access_token_secret_id as sid from public.lms_connections where id = :'conn' \gset
select is(public.lms_save_connection(:'ada', :'inst', 'access-3', p_expires_at => now()), :'conn'::uuid,
  'reconnecting updates the same connection');
select is((select access_token_secret_id from public.lms_connections where id = :'conn'), :'sid'::uuid, 'reusing its Vault secret');

select public.lms_mark_needs_reauth(:'conn', 'invalid_grant');
select is((select status::text from public.lms_connections where id = :'conn'), 'needs_reauth', 'revoked refresh tokens flag the connection');

-- What clients can see ----------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select is((select name from public.lms_institutions), 'State U', 'users can list schools');
select throws_ok($$ select client_secret_id from public.lms_institutions $$, '42501', null, 'but not their credentials');
select is((select status::text from public.lms_connections), 'needs_reauth', 'users see their own connection status');
select throws_ok($$ select access_token_secret_id from public.lms_connections $$, '42501', null, 'but not token references');
select throws_ok(format($$ select * from public.lms_connection_credentials(%L) $$, :'conn'), '42501', null,
  'and cannot read credentials');

select tests.authenticate_as(:'bob');
select is(public.lms_disconnect(:'conn'), false, 'other users cannot disconnect it');

select tests.authenticate_as(:'ada');
select is(public.lms_disconnect(:'conn'), true, 'the owner can');
select tests.clear_authentication();
select ok(not exists (select 1 from vault.secrets where id = :'sid'), 'and its Vault secrets are deleted');

select public.lms_save_connection(:'bob', :'inst', 'bob-access', '7', 'Bob', 'bob-refresh', now()) as bobconn \gset
select access_token_secret_id as bsid from public.lms_connections where id = :'bobconn' \gset
delete from auth.users where id = :'bob';
select ok(not exists (select 1 from vault.secrets where id = :'bsid'), 'deleting an account deletes its tokens from Vault');

select * from finish();
rollback;
