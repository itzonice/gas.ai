#!/usr/bin/env bash
# Two simultaneous "Save to calendar" submits of the same upload (fix F13). pgTAP runs in
# one session, so this uses two real sessions: A commits and holds its transaction open;
# B submits the same upload meanwhile, waits on A's row lock, and must get the same course
# back instead of creating a second one. Then the other order of arrival (both at once).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     bash supabase/tests/concurrency/commit_parsed_syllabus.sh
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
q() { psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

USER_ID=$(q -c "select gen_random_uuid()")
UPLOAD_A=$(q -c "select gen_random_uuid()")
UPLOAD_B=$(q -c "select gen_random_uuid()")
cleanup() { q -c "delete from auth.users where id = '$USER_ID'" >/dev/null || true; }
trap cleanup EXIT

PAYLOAD='{"course": {"name": "Concurrency 101"}, "categories": [{"name": "Exams", "weight": 100}],
  "assignments": [{"title": "Final", "kind": "exam", "category_name": "Exams", "due_at": "2027-05-01T15:00:00Z"}]}'
q <<SQL >/dev/null
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('$USER_ID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'race-$USER_ID@example.com', '{}', now(), now());
insert into public.syllabus_uploads (id, user_id, source, extracted_text, status, parse_result) values
  ('$UPLOAD_A', '$USER_ID', 'text', 'x', 'parsed', '$PAYLOAD'::jsonb),
  ('$UPLOAD_B', '$USER_ID', 'text', 'x', 'parsed', '$PAYLOAD'::jsonb);
SQL

# One client: acts as the user through the authenticated role, commits the upload, then
# optionally holds the transaction open so the other client has to wait on it.
submit() {
  local upload=$1 hold=$2
  q <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$USER_ID", "role": "authenticated"}', true) \gset ignored_
select public.commit_parsed_syllabus('$UPLOAD_A'::uuid) where '$upload' = 'A'
union all
select public.commit_parsed_syllabus('$UPLOAD_B'::uuid) where '$upload' = 'B';
select pg_sleep($hold) \gset ignored_
commit;
SQL
}

fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. A holds its transaction for 2 s; B arrives 0.5 s later and must wait for it.
OUT=$(mktemp -d)
submit A 2 >"$OUT/a" &
sleep 0.5
submit A 0 >"$OUT/b" &
wait
A=$(tr -d '[:space:]' <"$OUT/a"); B=$(tr -d '[:space:]' <"$OUT/b")
[[ -n "$A" && "$A" == "$B" ]] || fail "overlapping submits returned different courses: '$A' vs '$B'"
echo "ok 1 - a submit made while another is in flight waits and returns the same course"

# 2. Both at the same instant (whichever wins the lock, the other returns its course).
submit B 0 >"$OUT/c" &
submit B 0 >"$OUT/d" &
wait
C=$(tr -d '[:space:]' <"$OUT/c"); D=$(tr -d '[:space:]' <"$OUT/d")
[[ -n "$C" && "$C" == "$D" ]] || fail "simultaneous submits returned different courses: '$C' vs '$D'"
echo "ok 2 - simultaneous submits return the same course"

COUNTS=$(q -c "select count(*) filter (where true) || ' ' ||
  (select count(*) from public.assignments a join public.courses c2 on c2.id = a.course_id where c2.user_id = '$USER_ID')
  from public.courses where user_id = '$USER_ID'")
[[ "$COUNTS" == "2 2" ]] || fail "expected 2 courses and 2 assignments (one per upload), got '$COUNTS'"
echo "ok 3 - each upload created exactly one course and its assignments"
