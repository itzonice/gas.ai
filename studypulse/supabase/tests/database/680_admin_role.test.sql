-- Launch safety S32: admin RPCs check the admin role (app_metadata, which only the
-- service role can set) on the server, and answer 403 (insufficient_privilege) otherwise.
begin;
delete from auth.users;
select plan(11);

select tests.create_user('admin-user@example.com') as admin \gset
select tests.create_user('normal-user@example.com') as normal \gset
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
where id = :'admin';
-- A user who set "role": "admin" in their own (editable) user_metadata is not an admin.
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
where id = :'normal';

insert into public.courses (id, user_id, name, code) values
  ('c0000000-0000-0000-0000-00000000ad01', :'normal', 'Biology', 'BIO 201');
insert into public.assignments (id, course_id, title, kind, due_at) values
  ('a0000000-0000-0000-0000-00000000ad01', 'c0000000-0000-0000-0000-00000000ad01', 'Lab 1', 'lab', now() + interval '3 days');
insert into public.assignment_resources (id, assignment_id, course_id, kind, url, title) values
  ('e0000000-0000-0000-0000-00000000ad01', 'a0000000-0000-0000-0000-00000000ad01',
   'c0000000-0000-0000-0000-00000000ad01', 'khan_academy',
   'https://www.khanacademy.org/science/biology/cells', 'Cells');

-- A normal user (even one claiming admin in user_metadata) is refused.
select tests.authenticate_as(:'normal');
select ok(not private.is_admin(), 'user_metadata "role": "admin" does not make an admin');
select throws_ok(
  $$ select public.admin_takedown_content('assignment_resource', 'e0000000-0000-0000-0000-00000000ad01', 'T-1', now()) $$,
  '42501', 'admins only', 'a normal user cannot take content down');
select throws_ok(format($$ select public.admin_takedown_count(%L) $$, :'normal'),
  '42501', 'admins only', 'a normal user cannot read takedown counts');
select throws_ok($$ select private.log_admin_action(auth.uid(), 'takedown', null, null) $$,
  '42501', null, 'a normal user cannot write the admin log');
select throws_ok($$ select count(*) from private.admin_actions $$,
  '42501', null, 'a normal user cannot read the admin log');
select throws_ok(
  format($$ update auth.users set raw_app_meta_data = '{"role": "admin"}' where id = %L $$, :'normal'),
  '42501', null, 'a user cannot write app_metadata');

-- Signed out: no access at all.
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.admin_takedown_content('assignment_resource', 'e0000000-0000-0000-0000-00000000ad01', 'T-1', now()) $$,
  '42501', null, 'signed out cannot call admin RPCs');

-- An admin can, and the action is recorded.
select tests.authenticate_as(:'admin');
select ok(private.is_admin(), 'app_metadata "role": "admin" is an admin');
select is(
  public.admin_takedown_content('assignment_resource', 'e0000000-0000-0000-0000-00000000ad01', 'T-1', now()),
  :'normal'::uuid, 'an admin can take content down; the owner is returned');

reset role;
select is(
  (select action || ':' || target_id from private.admin_actions where admin_id = :'admin'),
  'takedown:e0000000-0000-0000-0000-00000000ad01', 'the admin action is logged with who did it');

-- Removing the role takes effect immediately, without waiting for the token to expire.
update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where id = :'admin';
select tests.authenticate_as(:'admin');
select throws_ok(format($$ select public.admin_takedown_count(%L) $$, :'normal'),
  '42501', 'admins only', 'a removed admin is refused on the next request');

select * from finish();
rollback;
