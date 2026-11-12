-- Syllabus uploads and their parse results, plus the private storage bucket that
-- holds the original files. Files live at `syllabi/{user_id}/{upload_id}.{ext}`.

create type public.syllabus_source as enum ('pdf', 'image', 'text', 'url');
create type public.syllabus_upload_status as enum ('pending', 'processing', 'parsed', 'committed', 'failed');

create table public.syllabus_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source public.syllabus_source not null,
  -- Storage object path inside the `syllabi` bucket (file sources only).
  file_path text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[^/]+$'),
  original_filename text check (char_length(original_filename) <= 255),
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes > 0),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  status public.syllabus_upload_status not null default 'pending',
  -- Validated parser output (see packages/core/parser). Null until parsed.
  parse_result jsonb,
  -- Human-readable failure reason when status = 'failed'.
  error text,
  -- Parser prompt + schema version that produced parse_result, for evals and reparsing.
  prompt_version text,
  model text,
  -- Set once the parse is committed into real rows.
  course_id uuid references public.courses (id) on delete set null,
  parsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint syllabus_uploads_source_fields check (
    case source
      when 'pdf' then file_path is not null
      when 'image' then file_path is not null
      when 'url' then source_url is not null
      else true
    end
  ),
  constraint syllabus_uploads_file_in_own_folder check (
    file_path is null or split_part(file_path, '/', 1) = user_id::text
  ),
  constraint syllabus_uploads_failed_has_error check (status <> 'failed' or error is not null),
  constraint syllabus_uploads_parsed_has_result check (
    status not in ('parsed', 'committed') or parse_result is not null
  )
);

create index syllabus_uploads_user_created_idx on public.syllabus_uploads (user_id, created_at desc);

alter table public.syllabus_uploads enable row level security;

create trigger syllabus_uploads_set_updated_at before update on public.syllabus_uploads
for each row execute function public.set_updated_at();

-- Uploads are created and advanced by edge functions (service role), which validate
-- the file and run the parser. Clients can read and delete their own.
create policy "Users can view their own syllabus uploads"
on public.syllabus_uploads for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete their own syllabus uploads"
on public.syllabus_uploads for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.syllabus_uploads from anon;
revoke insert, update on public.syllabus_uploads from authenticated;

-- Storage ------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'syllabi',
  'syllabi',
  false,
  20 * 1024 * 1024,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Each user may only touch objects under their own `{user_id}/` folder.
create policy "Users can read their own syllabus files"
on storage.objects for select to authenticated
using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload syllabus files to their own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own syllabus files"
on storage.objects for delete to authenticated
using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);
