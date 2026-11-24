# Multi-Model Tournament (scalable and reliable)

## Goal
Every model gets judged on real market results, not just the one that won training. Adding a new model type later should take one small change. The current stock picks and the promotion rules stay as they are.

## What changes for you
- All three models (Balanced Random Forest, LightGBM, Logistic Regression) make daily shadow predictions.
- The 5 PM EST scoring job scores all three side by side.
- The Model Performance card shows a **leaderboard** with rank, win rate, average return, ROC AUC, and how many predictions are scored.
- A model only goes live through the existing gate: at least 30 scored predictions, a win rate of 55% or more, an average return of +1.5% or more, and an ROC AUC of 0.52 or more. If more than one model qualifies, the one with the best scored results wins. Only one model is live at a time.
- If one model fails, it is skipped and the others still run. The job never fails as a whole because of one model.

## Reliability safeguards
- Predictions are saved once per model, ticker and day (a database unique key), so retries never create duplicates.
- Predictions are saved in batches, with a limit on how many each model can save per run.
- Each model's prediction errors are recorded in the job log. A failed model does not cancel the run.
- Old model versions are retired automatically. Only the latest version of each type stays a candidate, so the database does not grow without limit.
- Promotion uses a single lock and keeps a record of every promotion. It never switches back and forth between models (a challenger must beat the live model by a set margin).

## Out of scope for now
New model types (XGBoost, CatBoost, ensemble). The structure will be ready for them, but none are added in this step.

## Technical details
- `ml_training/train.py`: run the shadow prediction step for every registered model inside try/except per model, not only for `best`. Log the result for each model.
- `ml_training/registry.py` and the predictions function it calls: insert in batches with upsert on `(model_version_id, ticker, prediction_date)`.
- Migration (additive): a unique index on `prediction_history(model_version_id, ticker, prediction_date)`, deduplicating existing rows first. Also mark older candidate versions as `retired`.
- `_shared/model-promotion-gate.ts`: rank eligible candidates by win rate, then average return. Require a margin of at least 2 points over the current live model.
- `_shared/model-performance.ts` and `ModelPerformanceCard.tsx`: show ranking order and a "Leader" badge.
- Tests: per-model failure isolation (Python), duplicate prevention on upsert, choosing between several eligible models, the challenger margin, and leaderboard ordering. Run the full suite and redeploy the affected functions.
