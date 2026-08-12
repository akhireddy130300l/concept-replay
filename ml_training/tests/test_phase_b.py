from datetime import date, timedelta

import numpy as np

from ml_training.calibration import ProbabilityCalibrator
from ml_training.metrics import expected_value
from ml_training.walkforward import summarize, walk_forward_windows


def _dates(n: int, step: int = 3) -> list[date]:
    return [date(2026, 1, 1) + timedelta(days=step * i) for i in range(n)]


def test_walk_forward_folds_never_leak_forward():
    folds = walk_forward_windows(_dates(60), n_folds=4, purge_days=16, embargo_days=5)
    assert folds, "expected usable folds for realistic spacing"
    for train, val in folds:
        assert max(train) < min(val)
        assert (min(val) - max(train)).days >= 21
        assert not set(train) & set(val)


def test_walk_forward_validation_blocks_move_forward_in_time():
    folds = walk_forward_windows(_dates(80), n_folds=4)
    starts = [min(v) for _, v in folds]
    assert starts == sorted(starts)
    assert len(set(starts)) == len(starts)


def test_walk_forward_returns_nothing_when_history_is_too_short():
    assert walk_forward_windows(_dates(3)) == []


def test_summarize_reports_mean_and_std():
    out = summarize([{"pr_auc": 0.4}, {"pr_auc": 0.6}], keys=("pr_auc",))
    assert out["folds"] == 2
    assert abs(out["pr_auc_mean"] - 0.5) < 1e-9
    assert out["pr_auc_std"] > 0


def test_calibrator_preserves_ranking_and_improves_calibration():
    rng = np.random.default_rng(0)
    y = rng.binomial(1, 0.2, 600)
    # Badly scaled scores: informative but far too high in absolute terms.
    proba = np.clip(0.55 + 0.35 * y + rng.normal(0, 0.1, 600), 0.01, 0.99)
    cal = ProbabilityCalibrator().fit(proba, y)
    assert cal.is_fitted
    out = cal.transform(proba)
    # Isotonic is weakly monotone: it may flatten ties but never inverts order.
    order = np.argsort(proba)
    assert np.all(np.diff(out[order]) >= -1e-12)
    assert abs(out.mean() - y.mean()) < abs(proba.mean() - y.mean())

    assert out.min() >= 0.0 and out.max() <= 1.0


def test_calibrator_is_a_noop_without_enough_data():
    cal = ProbabilityCalibrator().fit(np.array([0.2, 0.8]), np.array([0, 1]))
    assert not cal.is_fitted
    assert np.allclose(cal.transform(np.array([0.3])), np.array([0.3]))


def test_expected_value_subtracts_costs_and_counts_trades():
    scores = np.array([0.9, 0.1, 0.8, 0.2])
    returns = np.array([4.0, -3.0, 2.0, -1.0])
    groups = np.array(["d1", "d1", "d2", "d2"])
    ev = expected_value(scores, returns, groups, k=1, cost_pct=0.15)
    assert ev["ev_trades"] == 2
    assert abs(ev["ev_per_trade"] - (3.85 + 1.85) / 2) < 1e-9
    assert ev["ev_win_rate"] == 1.0
