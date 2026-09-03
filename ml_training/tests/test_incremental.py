"""Incremental-training gate coverage."""
from __future__ import annotations

import pandas as pd

from ml_training.incremental import (
    DataSnapshot,
    decide,
    extract_previous_snapshot,
    snapshot_from_frame,
)


def snap(rows: int, version: str = "dataset_v1", horizon: str = "10_session", date: str | None = "2026-01-10") -> DataSnapshot:
    return DataSnapshot(matured_rows=rows, max_decision_date=date, dataset_version=version, label_horizon=horizon)


def test_snapshot_from_frame():
    df = pd.DataFrame({"decision_date": ["2026-01-02", "2026-01-09", None], "x": [1, 2, 3]})
    s = snapshot_from_frame(df, "dataset_v1", "10_session")
    assert s.matured_rows == 3
    assert s.max_decision_date == "2026-01-09"
    assert s.dataset_version == "dataset_v1"


def test_first_run_without_previous_trains():
    d = decide(snap(1000), None)
    assert d.should_train
    assert "baseline" in d.reason


def test_below_threshold_skips():
    d = decide(snap(1249), snap(1000))
    assert not d.should_train
    assert d.new_matured_rows == 249


def test_exactly_threshold_trains():
    d = decide(snap(1250), snap(1000))
    assert d.should_train
    assert d.new_matured_rows == 250


def test_above_threshold_trains():
    assert decide(snap(1400), snap(1000)).should_train


def test_force_overrides_skip():
    d = decide(snap(1001), snap(1000), force=True)
    assert d.should_train
    assert "forced" in d.reason


def test_threshold_zero_disables_gate():
    assert decide(snap(1000), snap(1000), min_new_matured_rows=0).should_train


def test_dataset_version_change_forces_training():
    d = decide(snap(1010, version="dataset_v2"), snap(1000))
    assert d.should_train
    assert "dataset_version" in d.reason


def test_label_horizon_change_forces_training():
    assert decide(snap(1010, horizon="20_session"), snap(1000)).should_train


def test_row_count_regression_forces_training():
    d = decide(snap(800), snap(1000))
    assert d.should_train
    assert d.new_matured_rows == -200


def test_extract_previous_snapshot_variants():
    assert extract_previous_snapshot(None) is None
    assert extract_previous_snapshot({"algorithm": "lr"}) is None
    top = extract_previous_snapshot({"data_snapshot": {
        "matured_rows": 900, "max_decision_date": "2026-01-01T00:00:00Z",
        "dataset_version": "dataset_v1", "label_horizon": "10_session"}})
    assert top == snap(900, date="2026-01-01")
    nested = extract_previous_snapshot({"metrics": {"data_snapshot": {
        "matured_rows": 10, "dataset_version": "dataset_v1", "label_horizon": "10_session"}}})
    assert nested.matured_rows == 10 and nested.max_decision_date is None


def test_decision_dict_shape_for_skipped_status():
    d = decide(snap(1100), snap(1000))
    out = d.to_dict()
    assert out["should_train"] is False
    assert out["min_new_matured_rows"] == 250
    assert out["current_snapshot"]["matured_rows"] == 1100
    assert out["previous_snapshot"]["matured_rows"] == 1000
