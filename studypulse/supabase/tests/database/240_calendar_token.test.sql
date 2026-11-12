begin;
delete from auth.users;
select plan(5);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as(:'ada');
select public.rotate_calendar_token() as token1 \gset
select ok(:'token1' ~ '^[A-Za-z0-9_-]{43}$', 'the token is 43 URL-safe characters (256 bits)');
select is((select calendar_token_hash from public.profiles),
  encode(extensions.digest(:'token1', 'sha256'), 'hex'), 'only the SHA-256 hash is stored');
select public.rotate_calendar_token() as token2 \gset
select isnt(:'token1'::text, :'token2'::text, 'rotating issues a new token and invalidates the old hash');
select throws_ok($$ update public.profiles set calendar_token_hash = repeat('a', 64) $$, '42501', null,
  'clients cannot set the hash directly');
select public.revoke_calendar_token();
select is((select calendar_token_hash from public.profiles), null, 'revoking turns the feed off');

select * from finish();
rollback;
