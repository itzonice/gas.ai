begin;
delete from auth.users;
select plan(8);

select tests.create_user('ada@example.com') as ada \gset
insert into public.courses (id, user_id, name) values ('c0000000-0000-0000-0000-000000000001', :'ada', 'Bio');

select lives_ok($$ insert into public.grade_categories (course_id, name, weight, drop_lowest)
  values ('c0000000-0000-0000-0000-000000000001', 'Quizzes', 20, 2) $$, 'drop_lowest can be set');
select throws_ok($$ update public.grade_categories set drop_lowest = -1 $$, '23514', null, 'negative drop_lowest rejected');

select lives_ok($$ update public.courses set letter_scale = '[{"letter":"A","min":90},{"letter":"B","min":80},{"letter":"F","min":0}]' $$,
  'a descending letter scale is accepted');
select throws_ok($$ update public.courses set letter_scale = '[{"letter":"A","min":80},{"letter":"B","min":90}]' $$,
  '23514', null, 'non-descending minimums rejected');
select throws_ok($$ update public.courses set letter_scale = '[{"letter":"A","min":90},{"letter":"A","min":80}]' $$,
  '23514', null, 'duplicate letters rejected');
select throws_ok($$ update public.courses set letter_scale = '[]' $$, '23514', null, 'empty scale rejected');

-- commit_parsed_syllabus stores both
insert into public.syllabus_uploads (id, user_id, source, extracted_text, status, parse_result)
values ('d0000000-0000-0000-0000-000000000001', :'ada', 'text', 'x', 'parsed', '{}');
select tests.authenticate_as(:'ada');
select commit_parsed_syllabus('d0000000-0000-0000-0000-000000000001',
  '{"course": {"name": "Chem", "letter_scale": [{"letter": "P", "min": 60}, {"letter": "F", "min": 0}]},
    "categories": [{"name": "Labs", "weight": 100, "drop_lowest": 1}], "assignments": []}') as course_id \gset
select is((select drop_lowest from public.grade_categories where course_id = :'course_id'), 1::smallint,
  'commit stores drop_lowest');
select is((select letter_scale -> 0 ->> 'letter' from public.courses where id = :'course_id'), 'P',
  'commit stores the letter scale');

select * from finish();
rollback;
