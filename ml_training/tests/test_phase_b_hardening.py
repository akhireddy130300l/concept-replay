"""Phase B hardening: duplicates, deterministic ranking, calibration isolation."""
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from ml_training.calibration import ProbabilityCalibrator
from ml_training.integrity import (
    DuplicateRowsError,
    duplicate_report,
    enforce_uniqueness,
)
from ml_training.metrics import expected_value, top_k_indices, _precision_at_k
from ml_training.splits import carve_calibration, chronological_split
from ml_training.walkforward import summarize


def _rows(records):
    return pd.DataFrame(records)


BASE = [
    {"ticker": "AAA", "decision_date": date(2026, 1, 1), "dataset_version": "v1", "technical_score": 5.0},
    {"ticker": "BBB", "decision_date": date(2026, 1, 1), "dataset_version": "v1", "technical_score": 6.0},
]


# ---------------------------------------------------------------- duplicates
def test_clean_dataset_reports_no_duplicates():
    rep = duplicate_report(_rows(BASE))
    assert rep["duplicate_rows"] == 0 and rep["conflicting_keys"] == 0


def test_exact_duplicates_are_reported_and_collapsed():
    df = _rows(BASE + [BASE[0]])
    rep = duplicate_report(df)
    assert rep["duplicate_keys"] == 1
    assert rep["exact_duplicate_rows"] == 1
    assert rep["conflicting_keys"] == 0
    out, rep2 = enforce_uniqueness(df)
    assert len(out) == 2 and rep2["rows_after_dedup"] == 2


def test_exact_duplicates_can_be_made_fatal():
    with pytest.raises(DuplicateRowsError):
        enforce_uniqueness(_rows(BASE + [BASE[0]]), allow_exact_duplicates=False)


def test_conflicting_duplicates_fail_the_job():
    conflict = dict(BASE[0], technical_score=9.9)
    with pytest.raises(DuplicateRowsError) as exc:
        enforce_uniqueness(_rows(BASE + [conflict]))
    assert "conflicting" in str(exc.value)


def test_conflicting_duplicates_are_never_silently_dropped():
    conflict = dict(BASE[0], technical_score=9.9)
    rep = duplicate_report(_rows(BASE + [conflict]))
    assert rep["conflicting_keys"] == 1
    assert rep["conflicting_examples"][0]["ticker"] == "AAA"


def test_same_ticker_different_dates_is_not_a_duplicate():
    later = dict(BASE[0], decision_date=date(2026, 1, 2))
    assert duplicate_report(_rows(BASE + [later]))["duplicate_rows"] == 0


def test_same_key_different_dataset_version_is_not_a_duplicate():
    other = dict(BASE[0], dataset_version="v2")
    assert duplicate_report(_rows(BASE + [other]))["duplicate_rows"] == 0


# ------------------------------------------------------- deterministic top-k
def test_top_k_breaks_ties_by_secondary_key():
    scores = np.array([0.5, 0.5, 0.5])
    idx = top_k_indices(scores, 2, np.array(["ZZZ", "AAA", "MMM"], dtype=object))
    assert list(idx) == [1, 2]


def test_top_k_is_invariant_to_row_shuffling():
    tickers = np.array([f"T{i:02d}" for i in range(20)], dtype=object)
    scores = np.array([0.5] * 10 + [0.9] * 10)
    base = set(tickers[top_k_indices(scores, 3, tickers)])
    rng = np.random.default_rng(0)
    for _ in range(15):
        p = rng.permutation(20)
        got = set(tickers[p][top_k_indices(scores[p], 3, tickers[p])])
        assert got == base


def test_precision_at_k_is_invariant_to_row_order():
    n = 12
    tickers = np.array([f"T{i:02d}" for i in range(n)], dtype=object)
    scores = np.full(n, 0.4)
    y = np.array([1, 0] * (n // 2))
    groups = np.array(["2026-01-01"] * n, dtype=object)
    a = _precision_at_k(scores, y, groups, 3, tickers)
    p = np.random.default_rng(7).permutation(n)
    b = _precision_at_k(scores[p], y[p], groups[p], 3, tickers[p])
    assert a == b


def test_expected_value_is_invariant_to_row_order():
    n = 10
    tickers = np.array([f"T{i}" for i in range(n)], dtype=object)
    scores = np.full(n, 0.6)
    rets = np.arange(n, dtype=float)
    groups = np.array(["d1"] * n, dtype=object)
    a = expected_value(scores, rets, groups, tie_break=tickers)["ev_per_trade"]
    p = np.random.default_rng(3).permutation(n)
    b = expected_value(scores[p], rets[p], groups[p], tie_break=tickers[p])["ev_per_trade"]
    assert a == b


def test_always_positive_baseline_is_deterministic_under_shuffle():
    n = 8
    tickers = np.array(list("ABCDEFGH"), dtype=object)
    scores = np.ones(n)
    y = np.array([0, 1, 0, 1, 1, 0, 0, 1])
    groups = np.array(["d"] * n, dtype=object)
    a = _precision_at_k(scores, y, groups, 3, tickers)
    p = np.random.default_rng(11).permutation(n)
    assert a == _precision_at_k(scores[p], y[p], groups[p], 3, tickers[p])


# ------------------------------------------- calibration ties + isolation
def test_isotonic_collapsed_ties_still_rank_deterministically():
    rng = np.random.default_rng(5)
    raw = np.linspace(0.2, 0.8, 200)
    y = (rng.random(200) < 0.3).astype(int)  # no signal -> isotonic flattens
    cal = ProbabilityCalibrator(min_rows=50).fit(raw, y)
    scores = cal.transform(np.linspace(0.2, 0.8, 12))
    assert len(np.unique(scores)) < 12, "expected isotonic to create ties"
    tickers = np.array([f"T{i:02d}" for i in range(12)], dtype=object)
    base = set(tickers[top_k_indices(scores, 3, tickers)])
    p = np.random.default_rng(2).permutation(12)
    assert set(tickers[p][top_k_indices(scores[p], 3, tickers[p])]) == base


def test_calibration_slice_is_disjoint_from_selection_validation():
    val = [date(2026, 1, 1) + timedelta(days=3 * i) for i in range(20)]
    sel, cal = carve_calibration(val, 0.35, purge_days=16, embargo_days=5)
    assert sel and cal
    assert not set(sel) & set(cal)
    assert (min(cal) - max(sel)).days >= 21


def test_calibration_slice_falls_back_to_empty_when_too_small():
    val = [date(2026, 1, 1) + timedelta(days=i) for i in range(3)]
    sel, cal = carve_calibration(val, 0.35, purge_days=16, embargo_days=5)
    assert cal == [] and sel == sorted(val)


def test_chronological_split_exposes_a_calib_mask_ordered_in_time():
    dates = [date(2026, 1, 1) + timedelta(days=3 * i) for i in range(60)]
    df = pd.DataFrame({"decision_date": dates})
    masks, windows = chronological_split(df, 0.6, 0.25, 16, 5, calib_frac=0.35)
    assert set(masks) == {"train", "val", "calib", "test"}
    if windows["calib"]:
        assert max(windows["val"]) < min(windows["calib"]) < min(windows["test"])
    assert max(windows["train"]) < min(windows["val"])


def test_uncalibrated_fallback_leaves_scores_untouched():
    cal = ProbabilityCalibrator(min_rows=100).fit(np.array([0.1, 0.9]), np.array([0, 1]))
    assert not cal.is_fitted
    raw = np.array([0.2, 0.7])
    assert np.allclose(cal.transform(raw), raw)


# ------------------------------------------------------- uncertainty framing
def test_summarize_flags_overlapping_labels():
    out = summarize([{"pr_auc": 0.4}, {"pr_auc": 0.6}], keys=("pr_auc",))
    assert out["overlapping_labels"] is True
    assert "confidence interval" in out["std_interpretation"]
