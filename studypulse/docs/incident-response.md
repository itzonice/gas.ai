# Incident response (data breach runbook)

Launch audit L9. What to do if personal data may have been exposed, lost, or changed by
someone who shouldn't have. It's general information, not legal advice: **call a
lawyer early** in any real incident, because notice rules and deadlines differ by place.

## The clock

| Who                            | Deadline                                                          |
| ------------------------------ | ----------------------------------------------------------------- |
| EU/UK regulator (GDPR Art. 33) | **72 hours** after we become aware, unless unlikely to cause harm |
| Affected EU/UK users (Art. 34) | Without undue delay, if high risk                                 |
| US residents                   | Each state's law applies (often 30 to 60 days); counsel decides   |
| Apple / Google                 | If store policy or a store account is affected                    |
| Vendors                        | Tell them at once if their system is the source                   |

Start the clock when someone on the team has reasonable certainty that personal data was
affected, and write that time down.

## Step by step

1. **Contain (first hour).**
   - Rotate the leaked secret: Supabase service role and JWT secret, Stripe keys, the
     Anthropic key, webhook secrets. Old keys stop working when rotated.
   - Sign everyone out if sessions may be stolen (`auth.sessions` delete, or rotate the
     JWT secret).
   - Take the affected feature offline with its env flag if needed.
2. **Keep evidence.** Export the relevant Supabase, Vercel, Sentry, and GitHub logs before
   they expire. Don't delete anything that shows what happened.
3. **Work out the scope.** Which data (see [data-inventory.md](data-inventory.md)), whose,
   how many people, from when to when, and whether it was read or only reachable.
4. **Decide on notice (within 48 hours of the start).** With counsel, using the table
   above. Record the decision and why, even if the answer is "no notice needed".
5. **Notify.** Plain words: what happened, what data, what we did, what they should do
   (for example, change a reused password), and how to reach us.
6. **Fix the cause** and add a test or CI check so it can't come back.
7. **Write it up** within two weeks: timeline, cause, fix, and what changes in
   [security-program.md](security-program.md).

## Contacts

| Who                             | How                                                                  |
| ------------------------------- | -------------------------------------------------------------------- |
| Incident lead                   | [name, phone]                                                        |
| Lawyer                          | [name, phone]                                                        |
| Lead EU regulator (if EU users) | [the authority where the business is established, or ICO for the UK] |
| Supabase support                | Dashboard, Support                                                   |
| Stripe                          | Dashboard, Support                                                   |

## Incident log

Keep every incident here, including ones that turned out not to need notice.

| Date found | What | Data / people affected | Notice given | Link to write-up |
| ---------- | ---- | ---------------------- | ------------ | ---------------- |
