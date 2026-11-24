# Fix the failing "Swing ML Training" GitHub email

## Why you get this email
GitHub runs the stock-model training every weekday at 9:00 UTC (4 AM Eastern). When the run fails, GitHub emails the repo owner. Your stock emails and Swing Trader picks are not affected — training is shadow-only.

## Most likely cause (not yet confirmed)
The run failed in 40 seconds, before any real training could happen. That timing points to one of:
1. The two GitHub repository secrets `SUPABASE_FUNCTIONS_URL` and `ML_TRAINING_KEY` are missing or wrong, so the trainer stops immediately.
2. A unit test step failing on GitHub's machine.

I cannot open GitHub's run log from here, so step 1 confirms which one.

## Steps
1. Confirm the cause: read the failed run's error text (you paste the red lines from "View workflow run", or I check backend training logs for a missing call).
2. If secrets are missing: generate a fresh training key in the backend, and give you the exact two values to paste into GitHub > Settings > Secrets > Actions.
3. If a test fails: fix the test/code so it passes, without changing stock selection or email logic.
4. Make the workflow friendlier: if secrets are absent, skip training with a clear notice instead of failing, so you stop getting failure emails.
5. Trigger one manual run and confirm it goes green.

## Technical details
- Workflow: `.github/workflows/ml-train.yml`; trainer exits via `SystemExit` in `ml_training/config.py` when env vars are empty.
- Add a guard step checking secrets and setting `skip=true` output; train step conditional on it.
