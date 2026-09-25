-- At most one live upload per stored file, so concurrent retries of upload-syllabus
-- can't start two parses. A failed upload may be retried with a new row.
create unique index syllabus_uploads_active_file_key
on public.syllabus_uploads (file_path)
where file_path is not null and status <> 'failed';
