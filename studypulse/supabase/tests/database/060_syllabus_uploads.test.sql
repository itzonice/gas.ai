begin;
-- Start from an empty database (seed data included); rolled back with the test.
delete from auth.users;
select plan(11);

select tests.create_user('alice@example.com') as alice \gset
select tests.create_user('bob@example.com') as bob \gset

insert into public.syllabus_uploads (id, user_id, source, file_path, status)
values ('d0000000-0000-0000-0000-00000000000a', :'alice', 'pdf', :'alice' || '/syllabus.pdf', 'pending');

select throws_ok(format($$ insert into public.syllabus_uploads (user_id, source, file_path)
  values (%L, 'pdf', %L) $$, :'alice', :'bob' || '/x.pdf'),
  '23514', null, 'file_path must be inside the owner''s folder');
select throws_ok($$ update public.syllabus_uploads set status = 'failed' $$,
  '23514', null, 'failed uploads need an error message');
select throws_ok($$ update public.syllabus_uploads set status = 'parsed' $$,
  '23514', null, 'parsed uploads need a parse result');

select is((select public from storage.buckets where id = 'syllabi'), false, 'syllabi bucket is private');

select tests.authenticate_as(:'bob');
select is_empty('select 1 from public.syllabus_uploads', 'B cannot read A''s uploads');
select is_empty('delete from public.syllabus_uploads returning 1', 'B cannot delete A''s uploads');
select throws_ok(format($$ insert into public.syllabus_uploads (source, file_path) values ('pdf', %L) $$, :'bob' || '/b.pdf'),
  '42501', null, 'clients cannot create uploads directly (edge function only)');

select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('syllabi', %L) $$, :'bob' || '/b.pdf'),
  'B can upload into their own folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('syllabi', %L) $$, :'alice' || '/planted.pdf'),
  '42501', null, 'B cannot upload into A''s folder');

select tests.clear_authentication();
insert into storage.objects (bucket_id, name) values ('syllabi', :'alice' || '/syllabus.pdf');
select tests.authenticate_as(:'bob');
select is_empty(format($$ select 1 from storage.objects where name = %L $$, :'alice' || '/syllabus.pdf'),
  'B cannot see A''s files');

select tests.authenticate_as(:'alice');
select results_eq('select count(*)::int from public.syllabus_uploads', array[1], 'A sees their own upload');

select * from finish();
rollback;
