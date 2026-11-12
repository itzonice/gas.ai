-- Launch safety S8: every foreign key gets an index, so deletes of parents (account
-- deletion, course deletion) and joins don't scan whole tables.
create index if not exists courses_lms_connection_idx on public.courses (lms_connection_id);
create index if not exists syllabus_uploads_course_idx on public.syllabus_uploads (course_id);
create index if not exists study_blocks_rescheduled_from_idx on public.study_blocks (rescheduled_from);
create index if not exists notification_log_assignment_idx on public.notification_log (assignment_id);
create index if not exists notification_log_token_idx on public.notification_log (token_id);
create index if not exists billing_events_user_idx on public.billing_events (user_id);
create index if not exists lms_oauth_states_institution_idx on public.lms_oauth_states (institution_id);
create index if not exists lms_oauth_states_user_idx on public.lms_oauth_states (user_id);
create index if not exists lms_connections_institution_idx on public.lms_connections (institution_id);
create index if not exists card_generations_assignment_idx on public.card_generations (assignment_id);
create index if not exists card_generations_course_idx on public.card_generations (course_id);
create index if not exists google_oauth_states_user_idx on public.google_oauth_states (user_id);
