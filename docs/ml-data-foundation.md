# Swing Trader ML Data Foundation

This document describes the permanent data-collection layer that feeds all
future Swing Trader ML / DL / RL work. **No model is trained yet.** The goal
is to guarantee that from today onward every checked ticker is captured with
enough fidelity that future feature engineering never needs to re-query
external providers.

## Architecture

Two engines, one schema:

- **Live engine** — `send-revision-reminders` calls `saveTrainingExamples`
  every run. `training_source = 'live'`.
- **Historical replay engine** — `historical-swing-trainer` edge function
  replays any date range using point-in-time Yahoo bars, historical Exa news,
  and best-available Finnhub context. `training_source = 'historical'`.

Both write to `swing_training_examples` + `swing_training_outcomes`. The
`ml_training_dataset_v2` view joins them and is the single source consumed
by `export-training-dataset` and the `/ml-training` dashboard.

## Versioning

Every row carries `feature_version` (currently `v1`) and `dataset_version`
(currently `dataset_v1`). Old rows keep their original version so future
schema changes never invalidate past data. New versions are additive.

## Splits

`split_bucket` is assigned at insert time:

- `train` — historical rows and live rows older than 30 days.
- `val` — live rows 10–30 days old.
- `test` — live rows younger than 10 days.

This is a time-based split. Future data never leaks into past training rows.

## Raw provider snapshots

Each example stores three JSONB snapshots so future feature engineering can
recompute anything without hitting Yahoo / Exa / Finnhub again:

- `yahoo_snapshot` — price, returns, volume ratio, watch levels, support/resistance.
- `finnhub_snapshot` — full FinnhubBundle (profile, peers, analyst, targets).
- `exa_snapshot` — Exa search results with titles, urls, published dates, highlights.

## Known look-ahead limitations

- **Historical Finnhub**: the free Finnhub tier has no point-in-time
  peers/analyst/targets. Historical rows have `finnhub_snapshot = null` and
  `data_quality_flags` includes `finnhub_lookahead_unavailable`. ML pipelines
  should drop analyst/peer features on historical rows or impute them.
- **Historical universe**: Russell 1000 is stored as current constituents,
  which introduces survivorship bias — delisted names from the replay window
  are missing. Documented for transparency.
- **Live-only fields**: news screen and analyst score on live rows use
  today's provider values, which is correct — live rows describe the moment
  of observation.

## Reproducibility

Running the historical replay twice over the same date range with the same
universe produces identical `swing_training_examples` rows (feature computation
is deterministic). Exa results can differ because their index updates; the
raw response is stored in `exa_snapshot` so downstream ML can rebuild features
from the exact captured payload.

## Exports

`export-training-dataset` streams `ml_training_dataset_v2` as CSV or NDJSON,
filtered by date range, dataset version, and split bucket. Response headers
include `x-row-count`, `x-feature-version`, `x-dataset-version`. Parquet is
deferred — Deno has no stable parquet writer; JSON/CSV round-trip cleanly to
pandas / DuckDB.

## Model registry (empty)

Tables `trained_models`, `model_versions`, `model_metrics`, `prediction_history`
are created but unused. They exist so the future training pipeline can plug in
without another migration.

## Readiness threshold

The `/ml-training` dashboard reports "Ready for first ML model" once
`swing_training_outcomes` has 1,000 completed 10-session outcomes. This is a
conservative floor — the roadmap starts with a simple baseline (logistic
regression / random forest) and only moves to XGBoost / LightGBM once the
baseline holds up on the time-based test split.
