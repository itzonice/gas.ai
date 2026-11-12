-- Launch safety S25: keep personal data only as long as it's needed. A daily job deletes:
-- - notification_log rows (they hold reminder text, i.e. assignment titles) after 90 days;
-- - study_plan_alerts after 90 days;
-- - Google/Canvas OAuth state rows a day after they expire;
-- - external calendar busy times 30 days after they end.
-- Other retention (analytics outbox, dedupe keys, push tokens, rate-limit counters) was
-- already scheduled; the full list is in docs/data-inventory.md.

create or replace function private.cleanup_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log integer;
  v_alerts integer;
  v_states integer;
  v_busy integer;
begin
  delete from public.notification_log where created_at < now() - interval '90 days';
  get diagnostics v_log = row_count;
  delete from public.study_plan_alerts where created_at < now() - interval '90 days';
  get diagnostics v_alerts = row_count;
  delete from public.google_oauth_states where expires_at < now() - interval '1 day';
  get diagnostics v_states = row_count;
  delete from public.lms_oauth_states where expires_at < now() - interval '1 day';
  get diagnostics v_busy = row_count;
  v_states := v_states + v_busy;
  delete from public.external_busy_times where ends_at < now() - interval '30 days';
  get diagnostics v_busy = row_count;
  return jsonb_build_object('notification_log', v_log, 'study_plan_alerts', v_alerts,
                            'oauth_states', v_states, 'external_busy_times', v_busy);
end;
$$;
revoke execute on function private.cleanup_retention() from public, anon, authenticated;

select cron.schedule('cleanup-retention', '43 3 * * *', $$ select private.cleanup_retention() $$);
