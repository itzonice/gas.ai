-- Removes everything seed-load.sql and the k6 parser test created (cascades from users).
delete from auth.users where email like '%@load.test';
