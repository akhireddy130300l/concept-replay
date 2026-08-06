# Automated ML Training + Shadow Prediction for Swing Trader

## Phase 1 findings (live database, queried now)

Rows
- `swing_training_examples`: 3,394 — historical 2,105 / live 1,289
- `swing_training_outcomes`: 3,394 (1:1)
- Outcomes present: 3-session 2,579 · 10-session 2,334 · 20-session 1,877 · 40-session 0

10-session labels
- positive 1,816 · negative 516 · flat 2 · pending 1,060
- Usable labeled rows (non-pending): **2,334**, of which negatives 516 (22%)
- Historical: 1,509 pos / 350 neg / 245 pending. Live: 307 pos / 166 neg / 815 pending

Coverage
- 844 distinct tickers, **only 46 distinct decision dates** (2026-05-01 → 2026-08-05)
- Duplicate (ticker, date) rows exist — up to 4 per pair (CBOE, PLTR 2026-07-08)

Feature missingness by source (the biggest problem found)

| Feature | historical null % | live null % |
|---|---|---|
| analyst_score, peer_confirmation_score, market_cap | 100 | 0 |
| confidence_score | 20 | 100 |
| risk_reward | 0 | 81 |
| volume_strength | 0 | 49 |
| distance_from_support_pct | 100 | 100 |
| technical_score, final_swing_score, exa_* | 0 | 0 |

Model registry: `trained_models`, `model_versions`, `model_metrics`, `prediction_history` all **0 rows**. No model artifact exists, trained or otherwise. Feature store has 1,685 rows; market regimes 29.

### Leakage audit
Confirmed post-decision (never model inputs): `future_return`, `risk_adjusted_return`, `reward_drawdown`, `holding_days`, `exit_price`, `exit_date`, `target_hit`, `stop_hit`, `max_gain_pct`, `max_drawdown_pct`, `return_pct_current`, `sessions_elapsed`, `outcome_*`, `label_*`, `final_label`, and outcome-table `current_price`.

Verified point-in-time safe from `_shared/swing-ml.ts` (all written at insert from the decision-time snapshot): `current_price`, `one/seven/twenty_session_return_pct`, `volume_strength`, `technical_score`, `risk_reward`, `volatility_score`, `upper/lower_watch_area`, `upside_vs_risk`, all `*_flag`, all Exa `has_*_signal` and counts (Exa queried with `end_published_date` = decision date), Finnhub analyst/peer/target fields, `final_swing_score`, `confidence_score`.

Two structural issues to fix, not leakage but fatal to a naive model:
1. `training_source` is nearly a perfect proxy for both feature presence and label availability. A model would learn "historical ⇒ positive". Mitigation: missingness indicator columns + source-stratified evaluation + a source-only sanity model that must not beat the real model materially.
2. 46 decision dates is too few for walk-forward. Data is adequate for an honest **candidate + shadow**, not for production promotion.

**No unresolved future-data leakage found — safe to proceed.**

## Phase 2 — `ml_training_dataset_v3`
New versioned view: one row per `training_example_id`, deduplicated to the earliest row per (ticker, decision date, feature_version). Splits columns into three explicit groups: keys/metadata, approved model inputs, and label-only fields. Post-decision columns are prefixed `label_` so no input can be selected by accident. Excludes ids and raw timestamps as numeric predictors.

## Phase 3 — Python training in GitHub Actions
`.github/workflows/train-swing-model.yml` (manual dispatch + monthly cron) and `ml_training/` with `data.py`, `features.py`, `train.py`, `evaluate.py`, `artifacts.py`, `requirements.txt`, `tests/`. Data pulled over the Supabase REST API with the service-role key from GitHub encrypted secrets. Nothing secret reaches the browser.

## Phase 4–7 — Models and honest evaluation
Logistic Regression (balanced, scaled), Random Forest (depth/leaf-capped, seeded), and LightGBM (falls back to XGBoost if the wheel fails; the choice is recorded in metadata). Chronological 70/15/15 split by decision date, whole dates kept intact, 10-session purge + embargo at boundaries, walk-forward folds where dates allow. Imputers fit on training rows only, with missingness indicators. Full metric set stored: per-class precision/recall/F1, balanced accuracy, PR-AUC, ROC-AUC, Brier, confusion matrix, calibration, Precision@1/3/5/10, top-K expected and median return, max drawdown, target/stop-hit rate — compared against always-positive and against the existing rule ranking on identical dates.

## Phase 8 — Registry and artifacts
Migration adds `ml_training_runs`, `model_feature_importance`, extends `trained_models` (family, immutable version, artifact/preprocessing/metadata paths, feature list, status candidate|shadow|production|retired|rejected, promoted_at) and `prediction_history` (decision date, rank, rule score, mode, matured result). Artifacts go to a new **private** `ml-artifacts` bucket under an immutable versioned path; writes are never overwritten.

## Phase 9 — `/ml-training` control center
Adds readiness, last run, candidate vs production cards, model comparison table, confusion matrix, PR-AUC / negative recall / Precision@5, feature importance, artifact status, and buttons: Start Training, Run Readiness Check, Promote to Shadow, Promote to Production, Rollback. All routed through the existing owner-gated `ml-training-control` function, extended to dispatch the GitHub workflow with a server-only `GITHUB_TOKEN`. Promotion and rollback require typed confirmation and are logged.

## Phase 10–11 — Schedule and shadow mode
Outcomes stay daily; readiness weekly; candidate training monthly or after 500 new completed 10-session outcomes; skipped on failed data-quality checks. Training only ever produces a candidate. The shadow model scores every ticker the rule engine already checks and writes to `prediction_history`. Email content, ranking and selection are untouched; probabilities appear only on `/ml-training`. Minimum 20 shadow trading days before promotion is even offered.

## Phase 12 — Inference
Primary path: export the selected model to **ONNX** with the preprocessing baked in, store it alongside a JSON feature-order manifest, and run it inside the edge function via `onnxruntime-web` (WASM). The training job asserts Python↔ONNX prediction parity on a held-out sample and refuses to publish an artifact that fails parity. If ONNX export or the WASM runtime proves unreliable in Deno during the smoke test, I fall back to the documented alternative (authenticated Python inference service) rather than pretending Deno can read a `.joblib`.

## Phase 13–14 — Gates and failure safety
Configurable promotion gates stored in the registry: no leakage failures, minimum distinct decision days, minimum negatives, PR-AUC over baseline, Precision@5 over the rule engine, negative-recall floor, calibration limit, expected-return improvement, drawdown ceiling, no critical drift, ≥20 shadow days. Any training/artifact/inference failure is recorded, the candidate is marked invalid where appropriate, no probability is ever fabricated, and the UI shows "ML unavailable — rule score only". The rule engine and all emails keep working untouched.

## Tests
`ml_training/tests/` covers leakage, same-day split isolation, purge/embargo, fit-on-train-only, feature-order stability, missing-value handling, imbalance, artifact save/load, and Python↔ONNX parity. Deno tests cover registry writes, shadow prediction, promotion authorization, rollback, and rule-only fallback. A limited-date-range end-to-end smoke run precedes enabling the schedule.

## What you must configure manually
1. **GitHub repo connected** to this project (Actions cannot run otherwise) — this is a hard blocker for Phase 3 onward.
2. GitHub repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. A fine-grained GitHub PAT with `actions: write`, saved as a server-side secret so the dashboard can dispatch training.

Costs: GitHub Actions minutes only (free tier is ample; a run is a few minutes). No new paid services; Supabase Storage usage is a few MB per model.

## Honest blocker
With 46 decision dates and 516 negatives, any model produced here is a **candidate for shadow observation only**. I will not present it as production-ready, and the gates will block promotion until shadow data accumulates.
