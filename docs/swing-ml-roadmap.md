# Swing Trader Watch — ML/AI Roadmap

Swing Trader Watch today is a **rule + heuristic** system built on:

- **Yahoo Finance** — price, chart, volume, technicals
- **Exa Search** — fresh news, catalysts, risks (with generic law-firm noise filtered out)
- **Finnhub** — company profile, peers, analyst recommendation trend, price target

The goal of this roadmap is to evolve it into a **real ML/AI model** that scores
each ticker's probability of a positive 3 / 10 / 20 / 40-session outcome, while
keeping the current provider setup unchanged.

> **Safety.** Nothing here is financial advice. Model output is an
> **AI probability estimate**, never a guaranteed prediction.

---

## Phase 1 — Data collection (current phase ✅)

- Save one feature snapshot per checked ticker in `swing_training_examples`.
- Immediately create a **pending outcome row** in `swing_training_outcomes`
  for every new training example, so the pipeline is easy to verify.
- On every subsequent stock-email run, update those pending outcome rows
  (price, max gain, max drawdown, target/stop hit, labels) for examples from
  the last 40 trading sessions.

Labeling rule per window (3 / 10 / 20 / 40 sessions):

- `positive` — return > +2%, or target hit before stop, or max gain ≥ +3% without hitting stop
- `negative` — return < −2%, or stop hit before target, or max drawdown ≤ −3% before meaningful upside
- `flat`     — return between −2% and +2% and neither target nor stop hit
- `pending`  — not enough sessions have passed yet

Outcome updates are **best-effort** — failures are logged and never block email delivery.

## Phase 2 — Baseline model (next phase, requires ~1,000+ completed outcomes)

Train an offline classifier in Python (logistic regression, random forest,
XGBoost) that predicts probability of a `positive` label per window from the
features saved in Phase 1.

## Phase 3 — Backtesting

Compare model score vs. current rule-based score:

- hit rate (positive / total)
- average return per selection
- max drawdown per selection
- target-hit rate, stop-hit rate

## Phase 4 — Production scoring

Export the model artifact (weights + preprocessing metadata). During the stock
email run, compute an **AI Swing Probability** score alongside the rule-based
score and show both in the email.

## Phase 5 — Continuous improvement

- Retrain weekly or monthly on fresh outcomes.
- Compare model performance over time.
- Keep human-readable explanations next to any AI probability.

---

## Next phase: Train first model in Jupyter

Once ~1,000+ completed outcomes have accumulated in
`swing_training_outcomes`, run the first baseline model offline:

1. **Export the dataset view as CSV**

   Query the joined view `swing_ml_training_dataset_v1` and export to CSV.
   From the Lovable Cloud admin database access:

   ```sql
   COPY (SELECT * FROM public.swing_ml_training_dataset_v1)
   TO STDOUT WITH CSV HEADER;
   ```

   Save the result as `swing_ml_training_dataset_v1.csv`.

2. **Open it in Jupyter Notebook** (or run the starter script directly).

3. **Train baseline models**:
   - Logistic Regression
   - Random Forest
   - (XGBoost / LightGBM later)

   Prediction targets:
   - `probability_3_session_positive`
   - `probability_10_session_positive`
   - `probability_20_session_positive`
   - `probability_40_session_positive`

4. **Evaluate**:
   - accuracy, precision, recall, F1, ROC-AUC
   - hit rate, average return, max drawdown
   - target-hit rate, stop-hit rate

5. **Deploy later**:
   - save model weights / artifact
   - load model during Swing Trader scoring
   - render "AI Swing Probability" in the email next to the rule-based score

A starter script is provided at:
`docs/notebooks/swing_model_v1_starter.py`

---

## ML readiness warning (email)

The email footer shows honest wording and a readiness badge:

> Not ready yet: N / 1,000 completed 10-session outcomes. ML model not trained
> yet. Collecting training data.

Once N ≥ 1,000, the badge flips to **Ready to train baseline model** and the
message points here.

Do **not** say "AI model is trained" until a model has actually been trained,
evaluated, and deployed.

---

## Monitoring views

Two read-only Postgres views are available for diagnostics:

- `swing_ml_readiness_summary_v1` — pending/completed/positive/negative/flat
  counts per window (3/10/20/40 sessions), plus distinct tickers and
  status breakdown.
- `swing_ml_feature_quality_v1` — per-day completeness of Yahoo, Exa, and
  Finnhub features on `swing_training_examples`.

Sample queries:

```sql
SELECT * FROM public.swing_ml_readiness_summary_v1;
SELECT * FROM public.swing_ml_feature_quality_v1 LIMIT 14;
```

---

## Example model artifact

An example artifact JSON showing the shape a future trained baseline model
should follow lives at `docs/model-artifacts/swing_model_v1_example.json`.
It is documentation only — no model is loaded from disk yet by the edge
functions.


---

## Phase 5 — Deep-Learning Readiness (added 2026-07-11)

Once the baseline gradient-boosted model in `docs/model-artifacts/swing_model_v1_example.json`
is trained and validated, the pipeline should be positioned for deeper sequence models
without another schema migration.

### Decision tiers

| Tier | Trigger | Model family | Notes |
| ---- | ------- | ------------ | ----- |
| T1   | ≥ 1,000 completed 10-session outcomes | LogReg / XGBoost | Baseline. Ship first. |
| T2   | ≥ 5,000 completed outcomes AND ≥ 300 near-misses (`near_miss = true`) | Gradient boosting + calibration | Add per-window heads. |
| T3   | ≥ 20,000 completed outcomes AND ≥ 90 days of price history per ticker | Small Transformer / TCN over Yahoo OHLCV windows | Sequence input. |
| T4   | T3 stable AND multimodal signals wired (Exa embeddings) | Multi-tower (numeric + news embedding + peer group) | Only when clearly beats T2. |

### Near-miss training data

The `selection_blocker`, `near_miss`, and `gap_to_selected` columns
(`swing_trade_checked_tickers`, `swing_training_examples`) let downstream models
learn from tickers that just missed selection. These are the highest-signal
negatives because they are closest to the decision boundary.

Recommended sampling for training:
- 100% of `was_selected = true` rows.
- 100% of `near_miss = true` rows.
- Down-sample the rest to at most 3× the near-miss count.

### View to query

`public.swing_ml_training_dataset_v1` now includes `selection_blocker`,
`near_miss`, and `gap_to_selected` alongside features and outcomes — use this
view as the single training source.

### Not building yet

Deep-learning code is deliberately out of scope until T2 data volume is reached.
Data capture is what unlocks it.
