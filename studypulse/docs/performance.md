# Query bounds and performance (launch safety S8)

## Bounded reads

- **PostgREST `max_rows = 100`** (`supabase/config.toml`; hosted: Settings → API → Max
  rows): no table, view, or set-returning RPC response has more than 100 rows, whatever a
  client asks for.
- **API client lists page** at most 100 rows (`MAX_PAGE_SIZE`): `assignments.list`,
  `organizations.roster` (the RPC now takes `p_limit`/`p_offset`), resources, weekly
  focus (last N weeks), Canvas school search (50), connections, subscriptions. A course's
  assignments load in pages of 100, stopping at 1,000.
- **Cron jobs claim and page in batches of 100** (nightly replan now loops over claims
  instead of one 5,000-user claim, which the row cap would have cut short).
- **Date ranges are capped**: the Calendar takes at most 62 days (client and SQL).
- **Every foreign key has an index** (12 were missing); test 560 fails if a new one lacks it.
- Intentionally whole-account reads: the privacy export and account deletion (one user's
  data, by design).

## Today feed: found and fixed

Measured with `load/seed-load.sql` at 3,000 students (36,037 assignments, 9,004 courses)
and `load/explain-today-calendar.sql` (EXPLAIN ANALYZE of every statement inside the
functions, as the demo user through RLS):

| Query                           | Before                                                   | After |
| ------------------------------- | -------------------------------------------------------- | ----- |
| `get_today_feed()` (whole call) | 3,345 ms (sequential scan of all 36k assignments, twice) | 36 ms |
| Ranked-task statement           | 3,340 ms                                                 | 23 ms |
| `get_calendar()` (41 days)      | 7 ms                                                     | 7 ms  |

Cause: the ranked-task query joined the `assignment_grade_shares` view, whose window
functions stop Postgres from pushing the user filter down, so it computed grade shares for
every user's assignments and then discarded all but the caller's. It now uses
`private.user_grade_shares(user)`, the same calculation over the caller's courses only
(test 140 checks both give identical numbers).

Plan after the fix (ranked-task statement, costs trimmed):

```
Sort (actual time=22.613..22.630 rows=10 loops=1)
  Sort Key: (public.task_priority(COALESCE(gs.grade_share, '0'::numeric), a.due_at, '2026-09-25 10:46:12.922996+00'::timestamp with time zone, ((GREATEST((COALESCE(a.estimated_minutes, public.default_task_minutes(a.kind)) - COALESCE(l.minutes, '0'::bigint)), '0'::bigint))::integer)::numeric, a.status, '120'::numeric)) DESC, a.due_at, a.title
    ->  Result (actual time=0.010..0.011 rows=1 loops=1)
  ->  Result (actual time=22.508..22.603 rows=10 loops=1)
        ->  Hash Right Join (actual time=21.544..21.572 rows=10 loops=1)
              Hash Cond: (gs.assignment_id = a.id)
              ->  Function Scan on user_grade_shares gs (actual time=18.590..18.594 rows=37 loops=1)
              ->  Hash (actual time=2.941..2.953 rows=10 loops=1)
                    ->  Hash Left Join (actual time=1.908..2.934 rows=10 loops=1)
                          Hash Cond: (a.id = l.assignment_id)
                          Filter: ((GREATEST((COALESCE(a.estimated_minutes, public.default_task_minutes(a.kind)) - COALESCE(l.minutes, '0'::bigint)), '0'::bigint))::integer > 0)
                          ->  Nested Loop (actual time=0.361..1.367 rows=12 loops=1)
                                ->  Bitmap Heap Scan on courses c (actual time=0.024..0.028 rows=4 loops=1)
                                      Filter: (archived_at IS NULL)
                                      ->  Bitmap Index Scan on courses_user_id_idx (actual time=0.013..0.013 rows=4 loops=1)
                                            Index Cond: (user_id = '00000000-0000-4000-8000-00000000d3e0'::uuid)
                                ->  Bitmap Heap Scan on assignments a (actual time=0.183..0.330 rows=3 loops=4)
                                      Filter: (((due_at IS NULL) OR ((due_at >= ('2026-09-25 04:00:00+00'::timestamp with time zone - '7 days'::interval)) AND (due_at <= ('2026-09-26 04:00:00+00'::timestamp with time zone + '30 days'::interval)))) AND (SubPlan 1) AND (status = ANY ('{todo,in_progress}'::public.assignment_status[])))
                                      ->  Bitmap Index Scan on assignments_course_due_idx (actual time=0.005..0.005 rows=9 loops=4)
                                            Index Cond: (course_id = c.id)
                                        ->  Result (actual time=0.082..0.082 rows=1 loops=15)
                          ->  Hash (actual time=1.537..1.544 rows=9 loops=1)
                                ->  Subquery Scan on l (actual time=1.520..1.532 rows=9 loops=1)
                                      ->  GroupAggregate (actual time=1.519..1.529 rows=9 loops=1)
```

The Calendar's statements all use `assignments_course_due_idx`,
`study_blocks_user_starts_idx`, and `courses_user_id_idx`; re-run the script above to
see them.
