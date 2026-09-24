-- Local demo data, loaded by `supabase db reset`. Never run against production.
--
-- Demo login: demo@studypulse.dev / studypulse-demo
--
-- Dates are relative to the day the seed runs, so the demo always sits mid-term:
-- past work is graded, upcoming work is due over the next weeks, and there are two
-- weeks of logged study sessions.

do $$
declare
  demo_id constant uuid := '00000000-0000-4000-8000-00000000d3e0';
  tz constant text := 'America/New_York';
  term_start constant date := current_date - 42;
  term_end constant date := current_date + 63;

  bio constant uuid := '00000000-0000-4000-8000-0000000000b1';
  calc constant uuid := '00000000-0000-4000-8000-0000000000c2';
  hist constant uuid := '00000000-0000-4000-8000-0000000000a3';
  psyc constant uuid := '00000000-0000-4000-8000-0000000000d4';

  rec record;
  day_offset integer;
begin
  -- User, identity (needed for email/password login), profile via the signup trigger.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    demo_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'demo@studypulse.dev', extensions.crypt('studypulse-demo', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('timezone', tz, 'display_name', 'Demo Student', 'school', 'State University'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), demo_id, demo_id::text, 'email',
    jsonb_build_object('sub', demo_id::text, 'email', 'demo@studypulse.dev', 'email_verified', true),
    now(), now(), now()
  );

  -- Courses ------------------------------------------------------------------
  insert into public.courses (id, user_id, name, code, instructor, term_start, term_end, target_grade, color) values
    (bio,  demo_id, 'Cell Biology',                'BIO 201',  'Dr. Okafor',    term_start, term_end, 90, '#2E7D32'),
    (calc, demo_id, 'Calculus II',                 'MATH 221', 'Prof. Lindqvist', term_start, term_end, 85, '#1565C0'),
    (hist, demo_id, 'Modern World History',        'HIST 110', 'Dr. Ramírez',   term_start, term_end, 88, '#8E24AA'),
    (psyc, demo_id, 'Introduction to Psychology',  'PSYC 101', 'Prof. Chen',    term_start, term_end, 92, '#EF6C00');

  -- Grade categories (weights sum to 100 per course) ----------------------------
  insert into public.grade_categories (course_id, name, weight, position) values
    (bio, 'Exams', 50, 0), (bio, 'Labs', 25, 1), (bio, 'Quizzes', 15, 2), (bio, 'Participation', 10, 3),
    (calc, 'Midterms', 40, 0), (calc, 'Final Exam', 30, 1), (calc, 'Problem Sets', 20, 2), (calc, 'Quizzes', 10, 3),
    (hist, 'Essays', 40, 0), (hist, 'Midterm', 20, 1), (hist, 'Final Exam', 25, 2), (hist, 'Reading Responses', 15, 3),
    (psyc, 'Exams', 60, 0), (psyc, 'Research Participation', 10, 1), (psyc, 'Quizzes', 20, 2), (psyc, 'Reflection Papers', 10, 3);

  -- Assignments ------------------------------------------------------------------
  -- (course, category, title, kind, days from today, local due time, points possible,
  --  points earned (null = ungraded), estimated minutes)
  for rec in
    select * from (values
      (bio, 'Quizzes', 'Quiz 1: Membranes', 'quiz', -35, '09:00', 20, 18, 60),
      (bio, 'Labs', 'Lab 1: Microscopy', 'lab', -30, '23:59', 50, 46, 120),
      (bio, 'Quizzes', 'Quiz 2: Organelles', 'quiz', -21, '09:00', 20, 15, 60),
      (bio, 'Labs', 'Lab 2: Osmosis', 'lab', -16, '23:59', 50, 44, 120),
      (bio, 'Exams', 'Midterm Exam', 'exam', -9, '10:00', 100, 84, 480),
      (bio, 'Labs', 'Lab 3: Enzyme Kinetics', 'lab', 3, '23:59', 50, null, 150),
      (bio, 'Quizzes', 'Quiz 3: Cell Signaling', 'quiz', 6, '09:00', 20, null, 60),
      (bio, 'Labs', 'Lab 4: Mitosis', 'lab', 20, '23:59', 50, null, 150),
      (bio, 'Exams', 'Final Exam', 'exam', 58, '08:00', 150, null, 720),

      (calc, 'Quizzes', 'Quiz 1: Integration by Parts', 'quiz', -33, '11:00', 10, 9, 45),
      (calc, 'Problem Sets', 'Problem Set 1', 'assignment', -28, '23:59', 30, 28, 180),
      (calc, 'Problem Sets', 'Problem Set 2', 'assignment', -21, '23:59', 30, 24, 180),
      (calc, 'Problem Sets', 'Problem Set 3', 'assignment', -14, '23:59', 30, 29, 180),
      (calc, 'Midterms', 'Midterm 1', 'exam', -10, '11:00', 100, 78, 540),
      (calc, 'Problem Sets', 'Problem Set 4', 'assignment', -7, '23:59', 30, 31, 180),
      (calc, 'Problem Sets', 'Problem Set 5', 'assignment', 1, '23:59', 30, null, 180),
      (calc, 'Quizzes', 'Quiz 2: Series Convergence', 'quiz', 4, '11:00', 10, null, 45),
      (calc, 'Midterms', 'Midterm 2', 'exam', 12, '11:00', 100, null, 600),
      (calc, 'Problem Sets', 'Problem Set 6', 'assignment', 15, '23:59', 30, null, 180),
      (calc, 'Final Exam', 'Final Exam', 'exam', 60, '14:00', 200, null, 900),

      (hist, 'Reading Responses', 'Response 1: Industrialization', 'discussion', -31, '23:59', 10, 9, 60),
      (hist, 'Reading Responses', 'Response 2: Empire', 'discussion', -24, '23:59', 10, 10, 60),
      (hist, 'Essays', 'Essay 1: Causes of WWI', 'project', -17, '23:59', 100, 88, 600),
      (hist, 'Reading Responses', 'Response 3: Interwar Period', 'discussion', -10, '23:59', 10, 8, 60),
      (hist, 'Midterm', 'Midterm Exam', 'exam', -3, '13:00', 100, null, 480),
      (hist, 'Reading Responses', 'Response 4: Decolonization', 'discussion', 2, '23:59', 10, null, 60),
      (hist, 'Essays', 'Essay 2: Cold War Primary Sources', 'project', 18, '23:59', 100, null, 720),
      (hist, 'Final Exam', 'Final Exam', 'exam', 59, '09:00', 100, null, 600),

      (psyc, 'Quizzes', 'Quiz 1: Research Methods', 'quiz', -34, '23:59', 25, 24, 45),
      (psyc, 'Reflection Papers', 'Reflection 1', 'assignment', -27, '23:59', 20, 19, 90),
      (psyc, 'Quizzes', 'Quiz 2: Neuroscience', 'quiz', -20, '23:59', 25, 21, 45),
      (psyc, 'Exams', 'Exam 1', 'exam', -13, '14:00', 100, 91, 420),
      (psyc, 'Quizzes', 'Quiz 3: Sensation & Perception', 'quiz', -6, '23:59', 25, 23, 45),
      (psyc, 'Reading Responses', 'Chapter 7 reading', 'reading', 0, '23:59', null, null, 60),
      (psyc, 'Research Participation', 'SONA study credit', 'other', 9, '23:59', 10, null, 60),
      (psyc, 'Exams', 'Exam 2', 'exam', 16, '14:00', 100, null, 480),
      (psyc, 'Exams', 'Final Exam', 'exam', 61, '14:00', 150, null, 720)
    ) as t(course_id, category, title, kind, days, due_time, possible, earned, minutes)
  loop
    insert into public.assignments (
      course_id, category_id, title, kind, due_at, status, points_possible, points_earned, estimated_minutes, source
    )
    select
      rec.course_id,
      gc.id,
      rec.title,
      rec.kind::public.assignment_kind,
      -- Local due date/time in the demo user's timezone, stored in UTC.
      ((current_date + rec.days) + rec.due_time::time) at time zone tz,
      case
        when rec.earned is not null or rec.days < 0 then 'done'
        when rec.days <= 3 then 'in_progress'
        else 'todo'
      end::public.assignment_status,
      rec.possible,
      rec.earned,
      rec.minutes,
      'syllabus'
    -- Unknown categories (the psych reading) stay uncategorized, like a real parse.
    from (select 1) one
    left join public.grade_categories gc on gc.course_id = rec.course_id and gc.name = rec.category;
  end loop;

  -- Study sessions: the last 14 days, 1-2 sessions on most days --------------------
  for day_offset in 1..14 loop
    continue when day_offset % 6 = 0; -- a couple of rest days
    insert into public.study_sessions (user_id, course_id, assignment_id, started_at, ended_at, source)
    select
      demo_id,
      a.course_id,
      a.id,
      s.start_local at time zone tz,
      (s.start_local + make_interval(mins => s.minutes)) at time zone tz,
      'timer'
    from (
      select
        (current_date - day_offset) + time '16:00' + make_interval(hours => n * 3) as start_local,
        30 + ((day_offset * 17 + n * 23) % 5) * 15 as minutes,
        n
      from generate_series(0, 1 - (day_offset % 2)) as n
    ) s
    cross join lateral (
      -- Study for whatever was due soonest after that day, rotating across courses.
      select a.id, a.course_id
      from public.assignments a
      join public.courses c on c.id = a.course_id
      where c.user_id = demo_id and a.due_at > (current_date - day_offset)::timestamptz
      order by (a.course_id = (array[bio, calc, hist, psyc])[1 + (day_offset + s.n) % 4]) desc, a.due_at
      limit 1
    ) a;
  end loop;

  -- A few planned study blocks for the coming days ---------------------------------
  insert into public.study_blocks (user_id, course_id, assignment_id, starts_at, ends_at, kind, source)
  select demo_id, a.course_id, a.id,
         ((current_date + b.day) + time '18:00') at time zone tz,
         ((current_date + b.day) + time '18:00' + make_interval(mins => b.minutes)) at time zone tz,
         case when a.kind = 'exam' then 'exam_prep' else 'study' end::public.study_block_kind,
         'scheduler'
  from (values ('Problem Set 5', 0, 90), ('Lab 3: Enzyme Kinetics', 1, 60), ('Midterm 2', 2, 90), ('Midterm 2', 5, 90))
    as b(title, day, minutes)
  join public.assignments a on a.title = b.title
  join public.courses c on c.id = a.course_id and c.user_id = demo_id;
end;
$$;
