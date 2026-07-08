# Swing Trader Watch — ML/AI Roadmap

Swing Trader Watch today is a **rule + heuristic** system built on:

- **Yahoo Finance** — price, chart, volume, technicals
- **Exa Search** — fresh news, catalysts, risks
- **Finnhub** — company profile, peers, analyst recommendation trend, price target

The goal of this roadmap is to evolve it into a **real ML/AI model** that scores
each ticker's probability of a positive 3 / 10 / 20 / 40-session outcome, while
keeping the current provider setup unchanged.

> **Safety.** Nothing in this system is financial advice. Model output is an
> **AI probability estimate**, never a guaranteed prediction.

---

## Phase 1 — Data collection (current phase ✅)

- Save a **feature snapshot for every checked ticker** in `swing_training_examples`
  (one row per ticker per run, ~40–50 rows per stock email).
- Store technicals (Yahoo), news signals (Exa), structured context (Finnhub),
  the rule-based final score, confidence, and rejection reason.
- Save future **outcome rows** in `swing_training_outcomes`, updated on every
  subsequent stock-email run for the past 40 trading sessions.

Labeling rule per window (3 / 10 / 20 / 40 sessions):

- `positive` — return > +2%, or target hit before stop, or max gain ≥ +3% without hitting stop
- `negative` — return < −2%, or stop hit before target, or max drawdown ≤ −3% before meaningful upside
- `flat` — return between −2% and +2% and neither target nor stop hit
- `pending` — not enough sessions have passed yet

Outcome updates must **never block email delivery** — failures are logged and
skipped.

## Phase 2 — Baseline model

Train an offline classifier in Python (logistic regression, random forest,
XGBoost) that predicts probability of a `positive` label per window from the
features saved in Phase 1. Start with ~1,000+ completed examples.

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
