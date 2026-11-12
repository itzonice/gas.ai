-- Fix F5-F6: task_priority never returns NaN, a negative number, or more than 100, and
-- treats missing or non-finite inputs as missing (TS does the same; see priority.test.ts).
begin;
select plan(7);

select ok(public.task_priority(null, null, now(), null, 'todo', null) between 0 and 10,
  'all inputs missing: a low-band number');
select ok(public.task_priority('NaN', now() + interval '1 day', now(), 30, 'todo') between 0 and 10,
  'NaN share counts as no share (low band), not NaN');
select ok(public.task_priority(10, 'infinity', now(), 30, 'todo') between 0 and 10,
  'an infinite due date counts as undated');
select ok(public.task_priority(10, '-infinity', now(), 30, 'todo') between 0 and 10,
  'and so does minus infinity');
select ok(public.task_priority('Infinity', now() + interval '1 day', now(), 'NaN', 'in_progress', 'NaN') between 10 and 90,
  'infinite share saturates; NaN minutes and capacity fall back to defaults');
select ok(public.task_priority(0, now() - interval '400 days', now(), 1e9, 'in_progress', 1) between 90 and 100,
  'long-overdue huge work stays within the overdue band');
select is(public.task_priority(50, now() - interval '1 day', now(), 60, 'skipped'), 0::numeric,
  'skipped overdue work scores 0');

select * from finish();
rollback;
