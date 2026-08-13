# Phase B ML Audit (non-destructive review)

Scope: code review + full test-suite run only. No production database, Auth, training data,
deterministic stock-selection logic, entry/target/stop math, or email behaviour was touched.
Lovable Cloud is paused, so **no production ML performance is claimed anywhere in this document.**

---

## 1. Test suite — actually run

`pytest ml_training/tests -v` → **14 passed, 0 failed, 1.56s** (Python 3.13, scikit-learn/pandas/numpy).

| Test | Result |
| --- | --- |
| walk_forward_folds_never_leak_forward | PASS |
| walk_forward_validation_blocks_move_forward_in_time | PASS |
| walk_forward_returns_nothing_when_history_is_too_short | PASS |
| summarize_reports_mean_and_std | PASS |
| calibrator_preserves_ranking_and_improves_calibration | PASS |
| calibrator_is_a_noop_without_enough_data | PASS |
| expected_value_subtracts_costs_and_counts_trades | PASS |
| split_dates_are_chronological_and_disjoint | PASS |
| purge_and_embargo_removes_overlapping_train_dates | PASS |
| purge_never_leaks_when_dates_are_dense | PASS |
| rule_decision_fields_are_not_model_features | PASS |
| whole_decision_dates_stay_together | PASS |
| leakage_guard_rejects_future_columns | PASS |
| metrics_are_sane_on_perfect_scores | PASS |

These prove the code obeys its own contracts. They prove **nothing** about predictive skill on real market data.

---

## 2. Findings against the requested checklist

### PASS — verified in code now

**Walk-forward has no future-data leakage.** `walkforward.walk_forward_windows` sorts unique decision
dates, and for fold *i* the training set is `ordered[:v0]` filtered to `d <= min(val) - (purge+embargo)`.
Training dates are therefore strictly earlier than every validation date by at least 21 calendar days.
Validation blocks are contiguous and move strictly forward.

**Purge/embargo prevents overlapping-label leakage.** Label horizon is 10 sessions ≈ 14 calendar days;
`purge_days=16`, `embargo_days=5` → 21-day gap, wider than the label window. Applied in both
`splits.apply_purge_embargo` (train vs val+test, and val vs test) and in every CV fold.

**Test set untouched during training, tuning and calibration.**
- Model selection uses `_val_key` → validation PR-AUC then validation precision@3; `train.py` raises if
  validation is empty rather than silently falling back to test.
- CV folds are cut from `masks["train"] | masks["val"]` only.
- The calibrator is fitted on `parts["val"]`.
- Test is read exactly once per split loop for reporting, plus once for the calibrated report.

**Isotonic calibration never sees test labels.** `ProbabilityCalibrator.fit` is called only with
`(val_raw, y["val"])`. It no-ops below 100 rows or single-class, so it can't overfit a tiny fold.
Isotonic is monotone, so ranking and precision@k are unchanged — it moves Brier/ECE only.

**EV includes the 0.15% friction.** `metrics.expected_value(..., cost_pct=0.15)` subtracts 0.15 from
each top-k realised percentage return before averaging; the test asserts the exact arithmetic.

**Top-k ranking has no look-ahead.** `_precision_at_k`, `_return_stats` and `expected_value` all group
by `decision_date` and rank only within that date's candidates — exactly how the engine picks. No
cross-date or global ranking anywhere.

**Feature-time integrity (static contract).** `features.LEAKY_COLUMNS`, `BASELINE_COLUMNS` and
`RULE_DECISION_COLUMNS` (incl. `gap_to_selected`, `near_miss`, `status_at_check`, `selection_blocker`)
are asserted out of the matrix by `assert_no_leakage(cols)` before any fit. Preprocessing (median
impute, scaler, one-hot) is fit inside the Pipeline on the training split only, so no scaler statistics
bleed across the boundary.

### GAPS — real, currently unmitigated

1. **Duplicate observations are not deduplicated.** Nothing in `train.py` enforces uniqueness on
   `(ticker, decision_date, dataset_version)`. If the exporter or historical replay ever emitted a row
   twice, the duplicate lands in the same split and inflates metrics. Needs a dedupe guard plus a
   database-side uniqueness check once Cloud is back.
2. **Survivorship bias is present by construction.** The replay universe was seeded from the *current*
   Russell 1000 membership (`ml_universe_russell1000`, 503 tickers). Companies delisted or removed
   before today are absent, so historical backtests are biased upward. Cannot be fixed in Python — it
   needs point-in-time index membership, or an explicit caveat on every historical number.
3. **Validation is used twice** — for model selection *and* for calibration fitting. Calibration is
   monotone so it can't help selection, but the calibrated ECE reported for test is slightly optimistic.
   Cleaner: an inner calibration slice, or nested CV.
4. **Non-deterministic tie-breaks in ranking.** `np.argsort(-s)` breaks ties by array order. With
   coarse probabilities (e.g. the `always_positive` baseline, all 1.0) precision@k depends on row order.
   Affects baseline comparability, not the model's own ranking much.
5. **`min_frequency=10` one-hot on categoricals** is fit per split; rare sectors collapse to
   "infrequent" differently across folds. Not leakage, but a source of fold-to-fold variance.
6. **Overlapping labels remain *inside* the training set.** Purging only protects the boundaries.
   Rows within train still share overlapping 10-session windows, which understates true variance —
   standard for this design, worth noting when reading the ±std.

---

## 3. What Phase B actually does, end to end

```text
export-training-dataset (NDJSON, matured only)
  -> features.prepare_frame        dtype coercion; every contract column exists
  -> drop rows with null target; sort by decision_date
  -> chronological_split           60/20/20 by whole decision dates
       + purge 16d + embargo 5d at train|val and val|test boundaries
  -> assert_no_leakage(cols)       57 inputs: 25 numeric, 25 boolean, 7 categorical
  -> baselines on TEST             always_positive, rule_engine (rule score/10), previous model
  -> for each estimator            LogisticRegression / BalancedRandomForest / LightGBM(or XGBoost)
       Pipeline[preprocessor -> model], fit on TRAIN only
       evaluate on train/val/test  ROC-AUC, PR-AUC, Brier, ECE, precision@{1,3,5,10},
                                   return/drawdown of top-3, EV per trade net of 0.15%
  -> select best by VALIDATION PR-AUC (tie-break: validation precision@3)
  -> purged walk-forward CV        4 folds cut from train+val only -> mean ± std
  -> ProbabilityCalibrator         isotonic, fit on VALIDATION only
       -> apply to test scores     reported as metrics.test_calibrated
  -> register EVERY estimator as CANDIDATE (joblib+gzip+base64, ≤6MB)
       never auto-promoted; promotion stays a manual registry action
  -> shadow predictions            unmatured rows (last 15 decision dates)
       calibrated probability + confidence, logged against the model version
       -> written to the registry only; does NOT touch emails, ranking,
          or entry/target/stop math
```

Deterministic stock selection and the production emails are unchanged by Phase B. The model output is
recorded and compared later; it does not influence what a user sees.

---

## 4. Verification status, honestly separated

**Verifiable now (done above):** split chronology, purge/embargo arithmetic, leakage guard, feature
contract, calibration fit source, EV cost arithmetic, per-date ranking, walk-forward fold construction,
all 14 tests.

**Requires the production database:** true row counts and matured/unmatured balance; duplicate check on
`(ticker, decision_date)`; class balance drift over time; real PR-AUC / precision@3 / EV vs the rule
engine; whether calibration actually improves Brier on real scores; feature null rates and coverage;
whether 4 folds are even feasible given the number of distinct decision dates.

**Must run once Cloud is restored:** a full historical walk-forward backtest end to end; calibrated
probabilities measured against realised outcomes; EV after the 0.15% friction compared against the
deterministic baseline; shadow-prediction accuracy tracked for at least one full label horizon;
survivorship-bias sensitivity check against a point-in-time universe.

Until those run, no accuracy or profitability claim about this system is defensible.

---

## 5. Proposed Phase C — not implemented

Gate: **do not start Phase C until Phase B has produced a real historical walk-forward backtest with
calibrated probabilities and EV after costs, beating the deterministic baseline.**

### C1 — Gradient-boosted ranker (LambdaRank / LGBMRanker)
*Why:* the engine picks top-3 per day; a ranker optimises exactly that instead of pointwise probability.
*Data:* existing dataset grouped by `decision_date`, no new columns.
*Evaluation:* same purged walk-forward folds; primary metric precision@3 and EV per trade vs the Phase B
best classifier.
*Promotion:* +≥0.03 mean precision@3 AND +≥0.10%/trade EV across ≥4 folds, with fold std no worse than
the baseline's.

### C2 — Volatility-normalised targets
*Why:* a fixed percentage target treats a 1%-ATR and a 6%-ATR stock identically; normalising by ATR
makes the label comparable across names and regimes.
*Data:* ATR at decision time — already derivable from the stored snapshots, no new provider calls.
*Evaluation:* retrain the Phase B champion on the normalised target, translate back to raw return, and
compare EV after costs on the same folds.
*Promotion:* strictly better EV after costs; a metric-only improvement without an EV gain does not pass.

### C3 — Sequence model (1D-CNN or small GRU on 40-session price/volume windows)
*Why:* current features are point-in-time scalars; path shape (base, breakout, fade) carries information
they cannot express.
*Data:* 40-session OHLCV history per (ticker, decision_date) from the raw snapshots — needs a stored
sequence table; this is the main new engineering cost.
*Evaluation:* stacked as an extra feature into C1 rather than as a standalone model, so the comparison
isolates the sequence contribution.
*Promotion:* must clear C1's bar and remain stable across folds; drop it if it only wins on one window.

### C4 — Regime conditioning
*Why:* the same setup behaves differently in trending vs choppy markets; `market_regimes` already exists.
*Data:* existing regime labels as an interaction, plus per-regime metric reporting.
*Evaluation:* per-regime precision@3 and EV, not just the global average.
*Promotion:* no regime may get materially worse; global gains that hide a broken regime are rejected.

### Common promotion criteria for anything in Phase C
1. Beats the Phase B champion on purged walk-forward mean EV after 0.15% costs.
2. Beats the deterministic rule engine on the untouched test window.
3. Calibration error no worse than the Phase B champion's.
4. ≥30 shadow trading days logged with no material degradation vs offline estimates.
5. Manual promotion in the registry. Nothing auto-promotes, ever.
