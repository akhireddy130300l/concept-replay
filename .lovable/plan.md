# Indian Law Daily — why Aug 3 sent nothing, and the safest fix

## What the evidence actually shows

Verified in this session (read-only):

- Both cron jobs fired on Aug 3. `cron.job_run_details` shows `law-lesson-email-22utc` (jobid 6) at `2026-08-03 22:00:00Z` and `law-lesson-email-23utc` (jobid 7) at `2026-08-03 23:00:00Z`, both `succeeded` — that only means the HTTP POST was queued, not that the email sent.
- The recipient lookup is fine. `portfolio_feature_access` has exactly one enabled row with `report_email = no-reply-reminder1@outlook.com`, so the "No authorized recipients" path was not taken.
- Authorization is fine. Both jobs send `x-cron-secret` from `public.get_cron_secret()`, which is the same vault secret the function reads — and the same pattern is working for the speaking-progress job.
- The 23:00 UTC call was a designed skip. In August, ET = UTC-4, so 23:00 UTC = 19:00 ET and the function returns `{ok:true, skipped:"not_6pm_et"}`. Only the 22:00 UTC call (18:00 ET) is the real attempt.
- No lesson row was written. `law_daily_lessons` has only two rows ever (Jul 31 and Aug 1). Aug 2 and Aug 3 are both missing — so this is a repeating failure, not a one-off.
- Resend itself is healthy. `send-revision-reminders` successfully delivered to the same mailbox on Aug 4 at 05:23 UTC (`Email sent successfully to: no-reply-reminder1@outlook.com`, Resend id returned).

Evidence that is **not** available: edge logs for this function are gone. `function_edge_logs` currently holds 18 rows spanning only the last few minutes, and `net._http_response` only retains back to roughly 05:00 UTC today. So the Aug 3 22:00 response body and function logs cannot be recovered.

## Diagnosis (partly unconfirmed — say so plainly)

The 22:00 UTC run reached the per-recipient loop and then failed before the DB write. The code only inserts into `law_daily_lessons` after Resend returns 2xx, so a missing row means one of:

1. `geminiJSON(...)` returned null -> `{ok:false, reason:"gemini_failed"}` (most likely; Resend is demonstrably working, and the same `GEMINI_API_KEY` is shared with the swing/stock pipeline which runs heavily earlier in the day and can exhaust daily quota), or
2. Resend returned a non-2xx for that specific send.

Both paths return HTTP 200 with an `ok:true` envelope, and neither is logged, which is exactly why the failure was invisible. I cannot prove which one occurred for Aug 3 — the logs no longer exist. Step 1 of the fix is therefore to make the next failure provable.

## Safest fix

1. **Make failures observable and durable.** Log a structured line for every phase (auth mode, ET hour, recipient count, Gemini attempt/HTTP status + truncated error, Resend status), and stop returning a bare `ok:true` when nothing was sent — return `ok:false` with the reason so `net._http_response` records it even after edge logs rotate.
2. **Make the Gemini call resilient.** Add an explicit timeout plus up to 2 retries with backoff, and treat 429/5xx distinctly from a parse failure so quota exhaustion is named in the response.
3. **Add a catch-up window instead of a single 18:00 shot.** Keep the 18:00 ET send as primary, but allow retry hours (19:00–21:00 ET) that only act when no `sent_at` row exists for today. Existing "already sent today" logic makes this idempotent, so no duplicate emails.
4. **Never send a blank day.** If Gemini still fails after retries, send the lesson email using a deterministic fallback body built from the curriculum entry (law, section, category, recap of the previous topic) and mark the row so it can be re-enriched later.

Step 1 is safe to ship alone if you'd rather confirm the cause before changing send behaviour.

## Technical notes

- Files touched: `supabase/functions/send-law-lesson-email/index.ts` only.
- Cron changes needed for the catch-up window: add jobs at 23/00/01 UTC (or widen the accepted ET hours and add matching cron rows). No schema change.
- No changes to `portfolio_feature_access`, the vault secret, or the Resend sender.
