from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from ml_training.features import assert_no_leakage, feature_columns
from ml_training.metrics import evaluate
from ml_training.splits import apply_purge_embargo, chronological_split, split_dates


def test_split_dates_are_chronological_and_disjoint():
    dates = [date(2026, 1, d) for d in range(1, 21)]
    tr, va, te = split_dates(dates, 0.6, 0.2)
    assert max(tr) < min(va) < min(te)
    assert not (set(tr) & set(va) & set(te))
    assert len(tr) + len(va) + len(te) == len(dates)


def test_purge_and_embargo_removes_overlapping_train_dates():
    # Realistic spacing: ~2 decision days per week over several months, so the
    # 21-day purge+embargo gap still leaves usable train/val dates.
    dates = [date(2026, 1, 1) + timedelta(days=3 * i) for i in range(40)]
    tr, va, te = split_dates(dates, 0.6, 0.2)
    kept_tr, kept_va = apply_purge_embargo(tr, va, te, purge_days=16, embargo_days=5)
    assert kept_tr, "purge must not wipe out the entire train split for realistic spacing"
    assert max(kept_tr) <= min(va + te)
    assert (min(va + te) - max(kept_tr)).days >= 21
    if kept_va:
        assert (min(te) - max(kept_va)).days >= 21


def test_purge_never_leaks_when_dates_are_dense():
    dates = [date(2026, 1, d) for d in range(1, 31)]
    tr, va, te = split_dates(dates, 0.6, 0.2)
    kept_tr, kept_va = apply_purge_embargo(tr, va, te, purge_days=16, embargo_days=5)
    # Dense daily dates: correct behaviour is to drop everything inside the gap.
    assert all((min(va + te) - d).days >= 21 for d in kept_tr)


def test_rule_decision_fields_are_not_model_features():
    from ml_training.features import RULE_DECISION_COLUMNS

    cols = feature_columns()
    for banned in RULE_DECISION_COLUMNS:
        assert banned not in cols
    with pytest.raises(ValueError):
        assert_no_leakage(cols + ["gap_to_selected"])



def test_whole_decision_dates_stay_together():
    rows = []
    for d in range(1, 31):
        for t in ("AAA", "BBB", "CCC"):
            rows.append({"decision_date": date(2026, 1, d), "ticker": t})
    df = pd.DataFrame(rows)
    masks, windows = chronological_split(df, 0.6, 0.2, 16, 5)
    for split, m in masks.items():
        assert set(df[m]["decision_date"].unique()) == set(windows[split])


def test_leakage_guard_rejects_future_columns():
    with pytest.raises(ValueError):
        assert_no_leakage(feature_columns() + ["outcome_10_session"])
    assert_no_leakage(feature_columns())


def test_metrics_are_sane_on_perfect_scores():
    y = np.array([1, 0, 1, 0])
    proba = np.array([0.9, 0.1, 0.8, 0.2])
    groups = np.array(["d1", "d1", "d2", "d2"])
    m = evaluate(y, proba, groups, [5.0, -2.0, 3.0, -1.0], [-1.0, -6.0, -2.0, -4.0])
    assert m["roc_auc"] == 1.0
    assert m["precision_at_1"] == 1.0
    assert m["negative_recall"] == 1.0
    assert 0 <= m["brier"] <= 1
