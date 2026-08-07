"""Feature contract for ml_training_dataset_v3.

Only columns known at decision time may become model features. Anything derived
from the future lives in LEAKY_COLUMNS and is asserted out of the matrix.
"""
from __future__ import annotations

import pandas as pd

NUMERIC_FEATURES = [
    "current_price",
    "market_cap",
    "one_session_return_pct",
    "seven_session_return_pct",
    "twenty_session_return_pct",
    "volume_strength",
    "technical_score",
    "risk_reward",
    "volatility_score",
    "distance_from_support_pct",
    "distance_to_resistance_pct",
    "upside_vs_risk",
    "peer_count",
    "peer_confirmation_score",
    "analyst_buy_count",
    "analyst_hold_count",
    "analyst_sell_count",
    "analyst_score",
    "target_upside_pct",
    "exa_result_count",
    "exa_positive_signal_count",
    "exa_negative_signal_count",
    "exa_neutral_signal_count",
    "exa_source_quality_score",
    "confidence_score",
]

BOOLEAN_FEATURES = [
    "overbought_flag",
    "weak_volume_flag",
    "high_volatility_flag",
    "near_resistance_flag",
    "extended_flag",
    "target_supports_trade",
    "finnhub_available",
    "has_revenue_growth_signal",
    "has_raised_outlook_signal",
    "has_earnings_beat_signal",
    "has_analyst_upgrade_signal",
    "has_price_target_raise_signal",
    "has_fda_approval_signal",
    "has_contract_win_signal",
    "has_partnership_signal",
    "has_lawsuit_signal",
    "has_material_lawsuit_signal",
    "has_investigation_signal",
    "has_downgrade_signal",
    "has_earnings_miss_signal",
    "has_guidance_cut_signal",
    "has_high_valuation_signal",
    "has_insider_selling_signal",
    "has_cash_burn_signal",
    "has_margin_pressure_signal",
]

CATEGORICAL_FEATURES = [
    "entry_status",
    "momentum_status",
    "volume_confirmation",
    "analyst_signal",
    "confidence",
    "sector",
    "market_regime_label",
]

# Future information — must never enter the feature matrix.
LEAKY_COLUMNS = [
    "label_10_session",
    "outcome_10_session",
    "return_pct_current",
    "max_gain_pct",
    "max_drawdown_pct",
    "sessions_elapsed",
    "target_10_session",
    "label_matured",
    "exit_price",
    "exit_date",
]

# Rule-engine outputs: kept for baseline comparison, excluded from features so a
# candidate model cannot simply relearn the existing rules.
BASELINE_COLUMNS = ["baseline_rule_score", "baseline_final_score", "baseline_was_selected"]

# Rule-decision-derived fields. Kept in the dataset as metadata/analysis columns
# but NEVER used as model inputs — they teach the model to imitate the rule
# engine instead of predicting market outcomes.
RULE_DECISION_COLUMNS = ["gap_to_selected", "near_miss", "status_at_check", "selection_blocker"]

TARGET = "target_10_session"
DATE_COL = "decision_date"


def feature_columns() -> list[str]:
    return NUMERIC_FEATURES + BOOLEAN_FEATURES + CATEGORICAL_FEATURES


def assert_no_leakage(columns: list[str]) -> None:
    bad = sorted(set(columns) & set(LEAKY_COLUMNS + BASELINE_COLUMNS + RULE_DECISION_COLUMNS))
    if bad:
        raise ValueError(
            f"leakage guard tripped — future/baseline/rule-decision columns in feature matrix: {bad}")


def prepare_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce dtypes and ensure every contract column exists."""
    out = df.copy()
    out[DATE_COL] = pd.to_datetime(out[DATE_COL]).dt.date
    for col in NUMERIC_FEATURES + BASELINE_COLUMNS:
        if col not in out.columns:
            out[col] = pd.NA
        out[col] = pd.to_numeric(out[col], errors="coerce")
    for col in BOOLEAN_FEATURES:
        if col not in out.columns:
            out[col] = pd.NA
        out[col] = out[col].map({True: 1.0, False: 0.0, "true": 1.0, "false": 0.0}).astype("float64")
    for col in CATEGORICAL_FEATURES:
        if col not in out.columns:
            out[col] = None
        out[col] = out[col].astype("object").where(out[col].notna(), None)
    return out
