-- Term dates the student entered when uploading. Passed to the parser prompt and
-- preferred over dates found in the syllabus.
alter table public.syllabus_uploads
  add column term_start_hint date,
  add column term_end_hint date,
  add constraint syllabus_uploads_term_hint_order
    check (term_start_hint is null or term_end_hint is null or term_end_hint >= term_start_hint);
