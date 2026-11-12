-- Core academic schema: courses, their grade categories and assignments, and the
-- study sessions a student logs against them. RLS is enabled here (deny-all);
-- policies are added in the RLS migration.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  code text check (char_length(code) <= 50),
  instructor text check (char_length(instructor) <= 200),
  -- Calendar dates in the user's timezone (no time component).
  term_start date,
  term_end date,
  -- Grade the student is aiming for, as a percentage.
  target_grade numeric(5, 2),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_term_order check (term_end is null or term_start is null or term_end >= term_start)
);

create index courses_user_id_idx on public.courses (user_id);

create table public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  -- Share of the final grade, as a percentage.
  weight numeric(5, 2) not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_categories_course_name_key unique (course_id, name),
  -- Target for composite foreign keys that keep children within one course.
  constraint grade_categories_id_course_key unique (id, course_id)
);

create type public.assignment_kind as enum (
  'assignment', 'quiz', 'exam', 'project', 'reading', 'lab', 'discussion', 'other'
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Nullable: parsed assignments may not map to a category, and deleting a
  -- category keeps its assignments.
  category_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 300),
  description text,
  kind public.assignment_kind not null default 'assignment',
  due_at timestamptz,
  status text not null default 'todo',
  completed_at timestamptz,
  points_earned numeric(8, 2),
  points_possible numeric(8, 2),
  -- Student's estimate of total effort, used for ranking and scheduling.
  estimated_minutes integer,
  source text not null default 'manual' check (source in ('manual', 'syllabus', 'canvas')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_id_course_key unique (id, course_id),
  -- The category must belong to the same course. Deleting it only clears category_id.
  constraint assignments_category_fkey foreign key (category_id, course_id)
    references public.grade_categories (id, course_id)
    on delete set null (category_id)
);

create index assignments_course_id_idx on public.assignments (course_id);
create index assignments_category_id_idx on public.assignments (category_id);
create index assignments_course_due_idx on public.assignments (course_id, due_at);

create table public.study_sessions (
  -- Clients may supply the id so retries of "start session" are idempotent.
  id uuid primary key default gen_random_uuid(),
  -- Denormalized owner so per-user queries and overlap checks don't need a join.
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  started_at timestamptz not null,
  -- Null while the session is running.
  ended_at timestamptz,
  duration_minutes integer generated always as (
    case when ended_at is null then null
    else floor(extract(epoch from (ended_at - started_at)) / 60)::integer end
  ) stored,
  source text not null default 'timer' check (source in ('timer', 'manual')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
create index study_sessions_course_id_idx on public.study_sessions (course_id);
create index study_sessions_assignment_id_idx on public.study_sessions (assignment_id);

alter table public.courses enable row level security;
alter table public.grade_categories enable row level security;
alter table public.assignments enable row level security;
alter table public.study_sessions enable row level security;

create trigger courses_set_updated_at before update on public.courses
for each row execute function public.set_updated_at();
create trigger grade_categories_set_updated_at before update on public.grade_categories
for each row execute function public.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
for each row execute function public.set_updated_at();
create trigger study_sessions_set_updated_at before update on public.study_sessions
for each row execute function public.set_updated_at();
