
# ML Data Foundation — Full Build Plan

This is a large one-pass build. Approving this plan authorizes the full set of migrations, edge functions, and UI below. Nothing outside Swing Trader is touched.

---

## 1. Database migrations (single migration)

New columns on existing tables:
- `swing_training_examples`: `feature_version text default 'v1'`, `dataset_version text default 'dataset_v1'`, `training_source text default 'live'` (`live`|`historical`), `historical_run_id uuid null`, `historical_date date null`, `yahoo_snapshot jsonb`, `finnhub_snapshot jsonb`, `exa_snapshot jsonb`, `entry_price numeric`, `exit_price numeric`, `entry_date date`, `exit_date date`, `commission_bps numeric default 0`, `slippage_bps numeric default 0`, `position_size_pct numeric default 0`, `split_bucket text` (`train`|`val`|`test`), `data_quality_flags text[]`.
- Backfill defaults for existing rows.

New tables (all with `GRANT` + RLS: service_role full, authenticated read-only for the dashboard):
- `historical_training_runs` (id, started_at, completed_at, start_date, end_date, current_date, tickers_processed, examples_created, outcomes_created, status, resume_supported, config jsonb, last_error text).
- `ml_feature_statistics` (feature_name, dataset_version, mean, std, min, max, missing_count, outlier_count, importance_placeholder, updated_at) — unique on (feature_name, dataset_version).
- `ml_data_drift` (measured_at, feature_name, dataset_version, historical_mean, live_mean, psi, ks_stat, drift_flag).
- `ml_data_quality_log` (run_id, ticker, historical_date, reason, details jsonb, created_at).
- `ml_universe_russell1000` (ticker primary key, name, sector, added_at) — seeded via a follow-up insert tool call from a static list.
- Empty model-registry tables: `trained_models`, `model_versions`, `model_metrics`, `prediction_history` (schemas prepared, no writes yet).

SQL view: `ml_training_dataset_v2` — joins examples + outcomes + snapshots, respects `dataset_version`.

## 2. Shared modules (`supabase/functions/_shared/`)

- `ml-features.ts` — canonical `FEATURE_VERSION = 'v1'`, `buildFeatureVector(input, snapshots)`, `validateExample(row) → {ok, flags[]}`. Single source of truth so historical and live produce identical vectors.
- `ml-splits.ts` — time-based split assignment: train ≤ cutoff-20%, val = next 10%, test = last 10%, based on `historical_date` or `checked_date_et`.
- `ml-stats.ts` — recompute `ml_feature_statistics` and `ml_data_drift` (PSI + KS on numeric features, historical vs last-30d live).
- Extend `swing-ml.ts` to write the new columns, snapshots, backtest fields, and split bucket on every insert. Live path unchanged in behavior — only enriched.

## 3. Historical replay engine

New edge function `historical-swing-trainer` (JWT-verified; header `x-diag-key: DIAG_KEY` required):
- Body: `{ start_date, end_date, batch_size?=10, resume?=true, universe?='russell1000', dry_run?=false }`.
- Runs async via `EdgeRuntime.waitUntil`; returns run id immediately.
- Loop per trading day (skips weekends + US market holidays list):
  1. Load Russell 1000 tickers.
  2. Fetch each ticker's Yahoo daily bars for `[day-60, day+45]` in one batch (with per-ticker cache keyed by ticker, no reuse of the live cache).
  3. Point-in-time gainers scan: compute 1d/7d/20d returns and volume ratio **as of `day`**, take top 60 by same rules the live pipeline uses.
  4. For each selected ticker, build the full feature vector using **only bars ≤ day**.
  5. News via Exa, `start_published_date=day-14, end_published_date=day` — no future news.
  6. Finnhub profile/peers/analyst: documented look-ahead limitation — stored under `finnhub_snapshot.as_of='today'` and `data_quality_flags` includes `finnhub_lookahead`; analyst_score/peer_score also written to top-level columns so live+historical share schema.
  7. Compute deterministic outcomes from bars `day+1 … day+40`: returns at 3/10/20/40, max gain, max DD, target/stop hits, labels.
  8. Insert example + outcome in one transaction; `training_source='historical'`, `historical_date=day`, `historical_run_id=run.id`.
- Batching: process `batch_size` trading days, then `await sleep(2000)`, checkpoint `current_date`.
- Resume: on start, if `resume=true` and an in-progress run exists for the same date range, continue from `current_date + 1`.
- Retries: transient Yahoo/Exa/Finnhub failures retry 3× with exponential backoff; permanent failures logged to `ml_data_quality_log`.
- Rate limits: Exa concurrency 1, delay 4.5s (matches live). Finnhub concurrency 2. Yahoo concurrency 3.

## 4. Live daily engine

Unchanged behavior. Only `saveTrainingExamples` now writes `training_source='live'`, `feature_version`, `dataset_version`, snapshots, backtest fields, split bucket. Zero risk to today's email.

## 5. Dataset export

New edge function `export-training-dataset` (JWT-verified + `x-diag-key`):
- Query: `?from_date&to_date&format=csv|json&dataset_version=dataset_v1&split=train|val|test|all`.
- Streams from `ml_training_dataset_v2`.
- CSV via manual writer, JSON via NDJSON stream. Parquet deferred (documented — Deno lacks a stable parquet writer; JSON/CSV are ML-ready).
- Response headers include row count, feature_version, dataset_version.

## 6. `/ml-training` dashboard

New route (authenticated, owner-only via existing `portfolio_feature_access` check pattern):
- Cards: total examples, historical vs live split, pending vs completed outcomes, win/flat/loss %, avg return, avg max DD, avg holding window.
- Feature completeness bar (from `ml_feature_statistics`).
- Training readiness score (0–100%) with bucket label: `Collecting data` / `Good` / `Excellent` / `Ready for first ML model`. Threshold: 1,000 completed 10-session outcomes = 100%.
- Historical runs table with status + resume button.
- Drift alerts list (top 10 features by PSI).
- Export button → calls `export-training-dataset`.

## 7. Logging

Every stage emits structured `[hist-trainer]` / `[ml-stats]` / `[ml-export]` logs: day started, universe size, tickers processed, examples saved, outcomes generated, batch complete, resume checkpoint, dataset totals, api failures, retries, skipped rows with reason.

## 8. Documentation

- `docs/ml-data-foundation.md` — architecture overview, feature list, versioning policy, known look-ahead limitations, reproducibility notes.
- Update `docs/swing-ml-roadmap.md` — mark data foundation complete, list next phases (baseline model, calibration, backtest harness, paper trading).

---

## Explicit non-goals (this pass)

- No model training, no inference, no SHAP.
- No parquet writer.
- No delisted-ticker reconstruction (documented survivorship bias).
- No historical Finnhub analyst/peer snapshots (documented; flagged per row).
- No changes to Speaking Gym, Portfolio, LearnLoop, Quiz, Rewards, Auth, or the stock email layout.

## Estimated data volume

Russell 1000 × ~250 trading days/year × top-60 filter ≈ **~15k examples/year** of historical replay. A `2024-01-01 → today` backfill ≈ **~30k examples**. Live adds ~50/day.

## Risks / blockers

- Historical Yahoo rate limits — mitigated by per-ticker chart cache and 3-concurrent limit; expect a full-year backfill to take **6–12 hours of wall time** across many batched invocations. First run should be small (e.g., 1 month) to validate.
- Exa cost — ~30k historical news queries at Exa's per-search price. Confirm you're OK with that spend before triggering a big backfill; the function itself is safe to deploy.
- Finnhub free tier has no historical peers/analyst — accepted, flagged per row.
- Edge function 150s wall limit per invocation → replay uses `EdgeRuntime.waitUntil` + self-reinvocation every `batch_size` days.

## Order of tool calls once approved

1. One migration (all schema + tables + view + grants + RLS).
2. Parallel writes: shared modules, both edge functions, dashboard page + route, docs.
3. Insert-tool call to seed `ml_universe_russell1000`.
4. Register new functions in `supabase/config.toml`.
5. Smoke test: invoke `historical-swing-trainer` with `dry_run=true` for a single day, verify logs and one example row shape.
