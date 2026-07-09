"""
Swing Trader Watch — first baseline model (starter script).

This is a *learning-only* starter. It is NOT part of production and is not run
by the edge functions. Use it once ~1,000+ completed outcome rows exist.

Steps:
  1. Load exported CSV: swing_ml_training_dataset_v1.csv
  2. Filter to completed outcomes (label_10_session != 'pending').
  3. Build binary label: label_10_session == 'positive'.
  4. Select numeric / boolean features.
  5. Train Logistic Regression and Random Forest.
  6. Print accuracy, precision, recall, F1, ROC-AUC.
  7. Print top feature importances.
  8. Save a placeholder model artifact to disk.

Run:
    pip install pandas scikit-learn joblib
    python swing_model_v1_starter.py --csv swing_ml_training_dataset_v1.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

NUMERIC_FEATURES = [
    "one_session_return_pct", "seven_session_return_pct", "twenty_session_return_pct",
    "volume_strength", "risk_reward", "technical_score",
    "peer_confirmation_score", "analyst_score", "target_upside_pct",
    "rule_based_final_score", "final_swing_score",
]

BOOL_FEATURES = [
    "overbought_flag", "weak_volume_flag", "high_volatility_flag", "extended_flag",
    "has_revenue_growth_signal", "has_raised_outlook_signal", "has_earnings_beat_signal",
    "has_analyst_upgrade_signal", "has_price_target_raise_signal",
    "has_fda_approval_signal", "has_contract_win_signal", "has_partnership_signal",
    "has_material_lawsuit_signal", "has_generic_lawsuit_noise",
    "has_investigation_signal", "has_downgrade_signal",
    "has_earnings_miss_signal", "has_guidance_cut_signal",
    "has_insider_selling_signal", "has_cash_burn_signal", "has_margin_pressure_signal",
    "finnhub_available", "target_supports_trade",
]


def load(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    print(f"loaded {len(df):,} rows from {csv_path}")
    return df


def prepare(df: pd.DataFrame, label_col: str = "label_10_session"):
    completed = df[df[label_col].notna() & (df[label_col] != "pending")].copy()
    print(f"completed rows for {label_col}: {len(completed):,}")
    y = (completed[label_col] == "positive").astype(int)
    feats = [c for c in NUMERIC_FEATURES + BOOL_FEATURES if c in completed.columns]
    X = completed[feats].copy()
    for c in BOOL_FEATURES:
        if c in X.columns:
            X[c] = X[c].fillna(False).astype(int)
    X = X.apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return X, y, feats


def evaluate(name, model, X_test, y_test):
    pred = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1] if hasattr(model, "predict_proba") else pred
    print(f"\n=== {name} ===")
    print(f"  accuracy : {accuracy_score(y_test, pred):.3f}")
    print(f"  precision: {precision_score(y_test, pred, zero_division=0):.3f}")
    print(f"  recall   : {recall_score(y_test, pred, zero_division=0):.3f}")
    print(f"  f1       : {f1_score(y_test, pred, zero_division=0):.3f}")
    try:
        print(f"  roc_auc  : {roc_auc_score(y_test, proba):.3f}")
    except ValueError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="swing_ml_training_dataset_v1.csv")
    ap.add_argument("--label", default="label_10_session")
    ap.add_argument("--out", default="swing_model_v1.joblib")
    args = ap.parse_args()

    df = load(Path(args.csv))
    X, y, feats = prepare(df, args.label)
    if len(y) < 50 or y.nunique() < 2:
        print("Not enough completed outcomes to train yet. Need >= 1,000 ideally.")
        return

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    lr = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))])
    lr.fit(X_train, y_train)
    evaluate("Logistic Regression", lr, X_test, y_test)

    rf = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    evaluate("Random Forest", rf, X_test, y_test)

    importances = sorted(zip(feats, rf.feature_importances_), key=lambda x: -x[1])
    print("\nTop 15 features (Random Forest):")
    for name, imp in importances[:15]:
        print(f"  {name:35s} {imp:.4f}")

    joblib.dump({"model": rf, "features": feats, "label": args.label}, args.out)
    print(f"\nSaved placeholder artifact: {args.out}")
    print("This is a baseline for future work — NOT production ready.")


if __name__ == "__main__":
    main()
