-- Keep the normalized text the parser saw, so uploads can be reparsed (new prompt
-- versions, evals) without re-running OCR.
create type public.syllabus_extraction_method as enum ('text_layer', 'ocr', 'pasted', 'url');

alter table public.syllabus_uploads
  add column extracted_text text,
  add column extraction_method public.syllabus_extraction_method,
  add column page_count integer check (page_count is null or page_count > 0);
