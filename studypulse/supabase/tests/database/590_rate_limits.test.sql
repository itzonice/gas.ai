-- Launch safety S10: shared rate-limit counters (service only) and a private syllabus bucket.
begin;
select plan(8);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as(:'ada');
select throws_ok($$ select public.rate_limit_hit('user:x:1', 5, 60) $$, '42501', null,
  'users cannot touch rate-limit counters');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select is((public.rate_limit_hit('user:t:1', 2, 60))->>'allowed', 'true', 'first hit allowed');
select is((public.rate_limit_hit('user:t:1', 2, 60))->>'allowed', 'true', 'second hit allowed');
select public.rate_limit_hit('user:t:1', 2, 60) as third \gset
select is((:'third'::jsonb)->>'allowed', 'false', 'third hit over a limit of 2 is refused');
select ok(((:'third'::jsonb)->>'retry_after')::int between 1 and 60, 'refusal says when to retry');
select is((public.rate_limit_hit('user:t:2', 2, 60))->>'allowed', 'true', 'buckets are independent');
select throws_ok($$ select public.rate_limit_hit('x', 0, 60) $$, '22023', null, 'nonsense limits are rejected');
select tests.clear_authentication();

select is((select public from storage.buckets where id = 'syllabi'), false,
  'the syllabus bucket is private (files only through short-lived signed URLs)');

select * from finish();
rollback;
