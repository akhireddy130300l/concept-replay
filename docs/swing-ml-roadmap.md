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

The email footer shows honest wording:

> ML model not trained yet. Collecting training data. Useful model training
> typically starts after about 1,000+ completed outcome examples.

Do **not** say "AI model is trained" until a model has actually been trained,
evaluated, and deployed.
