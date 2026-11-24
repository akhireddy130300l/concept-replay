# Fix the failing Swing ML Training run

The run still fails after ~45 seconds on the latest code, which already has the "skip when key is missing" step. So the failure is now in one of: the unit tests, or the training step itself (key added but rejected, or not enough training data). The exact cause is not confirmed yet.

## Steps
1. **Find the real error**
   - Install the training packages in a temporary sandbox environment and run the 4 test files exactly like GitHub does.
   - Check backend logs of the training data/registry function around the run time (16:3x UTC today) for 401 (wrong key) or other errors.
2. **Fix based on what we find**
   - Tests failing → fix the broken test or code (no change to stock picks, emails, or shadow-only rule).
   - Key rejected (401) → re-sync `ML_TRAINING_KEY` so GitHub and backend match; give you the exact value to paste.
   - Too little daily stock data → make training finish green with a notice ("not enough samples yet, N/needed") instead of failing, so it keeps collecting daily and trains automatically once enough exists.
3. **Make failures readable** — print a clear one-line reason in the GitHub run summary.
4. Verify tests pass locally; you then click **Run workflow** once to confirm green.

## Unchanged
Stock emails, Swing Trader picks, Speaking Gym gate, models stay shadow-only.
