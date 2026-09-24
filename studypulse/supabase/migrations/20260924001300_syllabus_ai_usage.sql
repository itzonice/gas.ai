-- Token usage of every AI call made for an upload (OCR + parse attempts), for cost
-- tracking per user.
alter table public.syllabus_uploads
  add column ai_usage jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_usage) = 'array');
