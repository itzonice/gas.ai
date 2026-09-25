begin;
delete from auth.users;
select plan(22);

select tests.create_user('ada@example.com') as ada \gset
select tests.authenticate_as_service_role();
select public.lms_register_institution('State U', 'https://canvas.stateu.edu', 'cid', 'secret') as inst \gset
select public.lms_save_connection(:'ada', :'inst', 'tok') as conn \gset

-- One weighted course with two groups and two assignments, as the function sends it.
create temp table payload as select $j$[{
  "external_id": "101", "name": "Biology 201", "code": "BIO 201", "weighted": true,
  "groups": [{"external_id": "g1", "name": "Labs", "weight": 40, "position": 0},
             {"external_id": "g2", "name": "Exams", "weight": 60, "position": 1}],
  "assignments": [
    {"external_id": "a1", "title": "Lab 1", "due_at": "2027-03-05T23:59:00Z", "points_possible": 10, "points_earned": null, "kind": "lab", "group_external_id": "g1", "external_updated_at": "2027-03-01T00:00:00Z"},
    {"external_id": "a2", "title": "Midterm", "due_at": "2027-03-12T15:00:00Z", "points_possible": 100, "points_earned": null, "kind": "exam", "group_external_id": "g2", "external_updated_at": "2027-03-01T00:00:00Z"}
  ]}]$j$::jsonb as j;
grant select on payload to service_role;

select is(public.lms_apply_canvas_sync(:'conn', (select j from payload)) - 'unchanged' - 'skipped_dismissed' - 'skipped_archived' - 'skipped_course_limit',
  '{"courses_created": 1, "courses_updated": 0, "assignments_created": 2, "assignments_updated": 0}', 'first sync creates everything');
select is((select count(*)::int from public.grade_categories where external_id is not null), 2, 'weighted groups become categories');
select is((select g.name from public.assignments a join public.grade_categories g on g.id = a.category_id where a.external_id = 'a2'), 'Exams',
  'assignments land in their group''s category');
select is((select source from public.assignments where external_id = 'a1'), 'canvas', 'marked as from Canvas');

select is((public.lms_apply_canvas_sync(:'conn', (select j from payload)) ->> 'unchanged')::int, 2, 'a re-sync with no Canvas changes writes nothing');

-- Canvas changes the lab; the user moved the midterm and renamed nothing.
update payload set j = jsonb_set(jsonb_set(jsonb_set(j, '{0,assignments,0,title}', '"Lab 1: Enzymes"'),
  '{0,assignments,0,due_at}', '"2027-03-06T23:59:00Z"'), '{0,assignments,0,external_updated_at}', '"2027-03-02T00:00:00Z"');
select tests.authenticate_as(:'ada');
update public.assignments set due_at = '2027-03-13T15:00:00Z' where external_id = 'a2';
select is((select user_edited_fields from public.assignments where external_id = 'a2'), array['due_at'], 'user edits are tracked per field');
select tests.authenticate_as_service_role();
update payload set j = jsonb_set(jsonb_set(j, '{0,assignments,1,due_at}', '"2027-03-20T15:00:00Z"'),
  '{0,assignments,1,external_updated_at}', '"2027-03-02T00:00:00Z"');
update payload set j = jsonb_set(j, '{0,assignments,1,points_possible}', '120');

select is((public.lms_apply_canvas_sync(:'conn', (select j from payload)) ->> 'assignments_updated')::int, 2, 'changed assignments are updated');
select results_eq($$ select title, due_at from public.assignments where external_id = 'a1' $$,
  $$ values ('Lab 1: Enzymes', '2027-03-06T23:59:00Z'::timestamptz) $$, 'Canvas changes apply');
select is((select due_at from public.assignments where external_id = 'a2'), '2027-03-13T15:00:00Z'::timestamptz,
  'but never over a field the user edited');
select is((select points_possible from public.assignments where external_id = 'a2'), 120.00, 'other fields still follow Canvas');

-- A grade posts without bumping updated_at.
update payload set j = jsonb_set(j, '{0,assignments,0,points_earned}', '9');
select public.lms_apply_canvas_sync(:'conn', (select j from payload));
select is((select points_earned from public.assignments where external_id = 'a1'), 9.00, 'new grades sync');

-- The user deletes the lab; it stays deleted.
select tests.authenticate_as(:'ada');
delete from public.assignments where external_id = 'a1';
select tests.authenticate_as_service_role();
select is((public.lms_apply_canvas_sync(:'conn', (select j from payload)) ->> 'skipped_dismissed')::int, 1, 'deleted items are not re-created');
select is((select count(*)::int from public.assignments where external_id = 'a1'), 0, 'still gone');

-- Provenance can't be forged by clients.
select tests.authenticate_as(:'ada');
insert into public.courses (user_id, name, external_id, lms_connection_id) values (auth.uid(), 'Fake', '999', :'conn');
select results_eq($$ select external_id, lms_connection_id from public.courses where name = 'Fake' $$,
  $$ values (null::text, null::uuid) $$, 'clients cannot claim a Canvas origin on insert');
update public.assignments set external_id = 'zzz', user_edited_fields = '{}' where external_id = 'a2';
select results_eq($$ select external_id, user_edited_fields from public.assignments where title = 'Midterm' $$,
  $$ values ('a2', array['due_at']) $$, 'or change or clear it on update');
select tests.authenticate_as(:'ada');
update public.courses set name = 'My Bio' where external_id = '101';
select tests.authenticate_as_service_role();
select public.lms_apply_canvas_sync(:'conn', (select j from payload));
select is((select name from public.courses where external_id = '101'), 'My Bio', 'a renamed course keeps the user''s name');

-- Free plan: 3 active courses (Bio, Fake + one more), then a 4th from Canvas is skipped.
insert into public.courses (user_id, name) values (:'ada', 'Third');
update payload set j = j || $j$[{"external_id": "202", "name": "Chem", "code": "CHEM 1", "weighted": false, "groups": [], "assignments": [
  {"external_id": "c1", "title": "HW 1", "due_at": null, "points_possible": null, "points_earned": null, "kind": "assignment", "group_external_id": null, "external_updated_at": null}]}]$j$::jsonb;
select is((public.lms_apply_canvas_sync(:'conn', (select j from payload)) ->> 'skipped_course_limit')::int, 1,
  'courses over the free limit are skipped, not errors');
select is((select count(*)::int from public.courses where external_id = '202'), 0, 'and not created');

-- Archived courses are left alone.
update public.courses set archived_at = now() where external_id = '101';
select is((public.lms_apply_canvas_sync(:'conn', (select j from payload)) ->> 'skipped_archived')::int, 1, 'archived courses are skipped');
select is((select count(*)::int from public.assignments a join public.courses c on c.id = a.course_id where c.external_id = '202'), 1,
  'and the freed slot lets the new course in');

select isnt((select last_synced_at from public.lms_connections where id = :'conn'), null, 'the connection records the sync');

select tests.authenticate_as(:'ada');
select throws_ok(format($$ select public.lms_apply_canvas_sync(%L, '[]') $$, :'conn'), '42501', null, 'clients cannot run the sync');

select * from finish();
rollback;
