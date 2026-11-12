-- Study system, part 3 (prompt 73): a study block kind for closed-note practice quizzes.
-- Its own migration because a new enum value can't be used in the transaction that adds it.
alter type public.study_block_kind add value if not exists 'practice_quiz';
