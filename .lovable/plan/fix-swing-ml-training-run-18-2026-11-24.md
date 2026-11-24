# Fix Swing ML Training run #18

## What went wrong
The data export now returns all 3,000 rows (the earlier fix worked). Training then stopped on a safety check: **517 stocks have 2–4 different snapshots for the same day**. The stock check runs more than once a day (and some days exist in both the historical replay and the live check), so the same ticker/date gets saved multiple times with slightly different numbers. The trainer refuses to guess which one is real, so it exits with an error.

The "Node.js 20 is deprecated" line is only a warning, not the cause.

## Fix
1. **Pick one snapshot per stock per day, with a fixed rule** (instead of failing):
   - Prefer the live check over a historical replay of the same day.
   - Among those, keep the earliest check of the day (the snapshot the decision was really made from), using the row ID to break ties.
   - Only keep rows that already have a final outcome.
2. Log how many duplicates were collapsed in each run, so it's visible in GitHub and in the training history.
3. Update the GitHub workflow actions to their latest versions to remove the Node 20 warning.
4. Add tests: duplicates get collapsed with the rule above; the same input always gives the same result; truly identical rows still get merged.
5. Run the training tests, then you click **Run workflow** once more to confirm it turns green.

Nothing changes in stock emails, stock picks, or Swing Trader. The model stays shadow-only.

## Technical details
- `ml_training/integrity.py`: `enforce_uniqueness` resolves conflicting keys `(ticker, decision_date, dataset_version)` by sorting `training_source` (live first), `checked_at` asc, `example_id` asc and keeping the first; returns `collapsed_conflicts` in the report instead of raising `DuplicateRowsError`.
- `ml_training/train.py`: add collapsed count to the duplicate-audit log line.
- `.github/workflows/ml-train.yml`: `actions/checkout@v5`, `actions/setup-python@v6`.
- `ml_training/tests/`: new dedup tests; run full suite.
- No database changes (source rows stay intact; soft-delete rule respected).
