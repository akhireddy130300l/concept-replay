# Swing Trader ML — Next Phase Plan (Deep Learning Readiness)

Status: planning only. Nothing here changes stock email ranking, selection, or delivery.
Prerequisite: Cloud backend online + verified row counts in `swing_training_examples` /
`swing_training_outcomes`.

## Where we are

- Tabular baseline: LogReg / RandomForest / XGBoost trained via `ml_training/` in GitHub Actions.
- Chronological splits with purge + embargo; model selection on **validation PR-AUC only**.
- Shadow-only: predictions logged to `prediction_history`, never used for selection.
- Metadata excluded from inputs: `gap_to_selected`, `near_miss`, `status_at_check`, `selection_blocker`.

## Phase A — Trust the labels (do first)

1. Leakage audit report per feature: correlation with the label at the decision timestamp,
   plus a "was this value knowable at t0?" flag committed in `ml_training/features.py`.
2. Label definition freeze: one primary label (10-session forward return > threshold),
   with 3/20/40-session labels kept as secondary heads.
3. Volatility normalisation: express targets and returns in ATR units, not raw %.
   A 3% move on a low-vol name is not the same event as 3% on a high-vol name.
4. Base-rate + class-balance report per regime bucket, written into the training job record.

## Phase B — Stronger tabular before deep learning

1. Gradient boosting with monotonic constraints on features where direction is known
   (e.g. higher analyst upside should not lower probability). — *pending*
2. **Done:** Probability calibration — isotonic fit on the validation fold only
   (`ml_training/calibration.py`), applied to test metrics (`test_calibrated`) and to
   shadow predictions. Ranking is preserved; Brier and ECE improve.
3. **Done:** Purged, embargoed walk-forward CV (`ml_training/walkforward.py`) over the
   train+val region, reported as mean ± std under `metrics.walk_forward`. The test split
   is still read exactly once.
4. **Done:** Cost-sensitive evaluation — `expected_value()` in `ml_training/metrics.py`
   reports EV per trade, win rate, worst trade and downside mean on the top-3 picks per
   decision date, net of a 0.15% round-trip friction assumption.


## Phase C — Sequence models (the actual deep-learning step)

Only start once Phase B plateaus and there are ≥ 5,000 matured outcomes.

| Model | Input | Why |
| --- | --- | --- |
| 1D-CNN / TCN | 60 days of OHLCV + volume z-scores | Learns shape patterns the hand-made indicators miss |
| GRU / LSTM | Same window + regime channel | Captures ordering and momentum decay |
| Small Transformer | Multi-ticker window with market-index channel | Cross-sectional context, relative strength |

Rules:
- Same chronological split machinery — never shuffle.
- Ensemble with the tabular model rather than replacing it; deep model gets a weight only
  if it beats the boosted baseline on walk-forward validation PR-AUC **and** on EV per trade.
- Export to ONNX for Deno inference; the Edge Function must never call Python at request time.

## Phase D — Regime awareness

- Populate `market_regimes` daily (trend / chop / high-vol / risk-off) from index-level data.
- Add regime as a model input *and* as an evaluation slice — a model that only works in
  bull chop is not a model.
- Kill-switch rule: if realised hit-rate in the live regime drops below the base rate for
  20 consecutive decisions, the shadow model stays shadow.

## Phase E — Promotion policy (still manual)

Promotion to shadow is automatic-eligible; promotion to production stays a human click.
Gates for a candidate → shadow:
1. Val PR-AUC > baseline + 0.02
2. Calibration error (ECE) < 0.05
3. Positive EV per trade after costs on the test fold
4. No feature in the top-10 importance is a metadata/rule-derived field

Gates for shadow → production:
1. ≥ 60 live shadow decisions matured
2. Live PR-AUC within 0.03 of test PR-AUC (no drift blow-up)
3. Manual review recorded in `ml_model_promotions`

## What to build in the app when the backend returns

1. `/ml-training` → **Evaluation tab**: walk-forward curve, calibration plot, PR curve,
   per-regime slice table.
2. `/ml-training` → **Shadow tab**: live shadow predictions vs realised outcomes, running EV.
3. Email footer line (once shadow is stable): "Model view: X% — shadow only, not used for selection."

## Non-goals for this phase

- No auto-promotion to production.
- No change to the deterministic entry/target/stop math.
- No LLM in the scoring path — Gemini/Exa stay in research and narration only.
