# Copyright notices and takedowns

The public policy is at `/copyright` (launch safety S17). Nothing a student uploads is
shown to anyone else, so notices should be rare. When one arrives, handle it as follows.

## Before launch (manual)

1. Register a DMCA designated agent with the US Copyright Office at
   https://dmca.copyright.gov. It costs $6 and must be renewed every 3 years; put the
   renewal in the calendar.
2. Put exactly the registered details (name, address, email, phone) on
   `apps/web/app/(legal)/copyright/page.tsx`, replacing the bracketed placeholders.

## Handling a notice

1. **Check it's complete.** It needs the six elements listed on `/copyright`. If it's
   incomplete, reply asking for what's missing; don't remove anything yet.
2. **Find the item.** Use the details in the notice (account email, file name) with the
   service role in the Supabase dashboard. It will be a `syllabus_uploads`, `flashcards`,
   or `assignment_resources` row.
3. **Remove it.** Run the script with the production service-role key in your shell
   environment. Never paste the key into tickets or chat.

   ```sh
   node scripts/takedown.mjs syllabus_upload <id> --notice "TICKET-123" --received 2026-10-01
   ```

   For an upload, it deletes the stored file, clears the extracted text, and marks the
   upload removed; a flashcard or link row is deleted. It records the notice in
   `private.content_takedowns` and prints how many takedowns the account has had.

4. **Tell the account holder** by email what was removed and why, and that they may send a
   counter-notice (the process is on `/copyright`).
5. **Counter-notice:** forward it to the complainant. If they don't say they've sued
   within 10 business days, the student may re-upload, and you set `restored_at` on the
   takedown row.
6. **Repeat infringers:** at 3 takedowns (the script flags it), review the account. If it
   is a repeat infringer, close it with Settings → Delete account on their behalf (the
   admin API `DELETE /auth/v1/admin/users/<id>`).
