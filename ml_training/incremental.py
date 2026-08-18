"""Incremental-training gate.

Cost control: a full training run re-exports every matured row and fits several
models. That is wasted Cloud + Actions work when almost no new labels matured
since the last successfully registered candidate.

This module is pure and deterministic: it compares a snapshot of the current
matured dataset against the snapshot stored with the previous registered model
and decides whether the run should proceed or be recorded as SKIPPED.

Nothing here touches model status, promotion, or shadow-only behaviour.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

DEFAULT_MIN_NEW_MATURED_ROWS = 250


@dataclass(frozen=True)
class DataSnapshot:
    """Minimal fingerprint of the matured training dataset."""

    matured_rows: int
    max_decision_date: str | None
    dataset_version: str
    label_horizon: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def snapshot_from_frame(df, dataset_version: str, label_horizon: str, date_col: str = "decision_date") -> DataSnapshot:
    """Build a snapshot from the loaded matured dataframe."""
    max_date: str | None = None
    if date_col in getattr(df, "columns", []) and len(df) > 0:
        series = df[date_col].dropna()
        if len(series) > 0:
            max_date = str(max(str(v)[:10] for v in series.tolist()))
    return DataSnapshot(
        matured_rows=int(len(df)),
        max_decision_date=max_date,
        dataset_version=dataset_version,
        label_horizon=label_horizon,
    )


def _coerce_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_previous_snapshot(previous_model: dict | None) -> DataSnapshot | None:
    """Read the snapshot stored alongside the last registered candidate model.

    Tolerant of older registry rows that predate snapshot storage: those return
    None, which means "no reliable baseline" and training proceeds.
    """
    if not previous_model:
        return None
    candidates = [
        previous_model.get("data_snapshot"),
        (previous_model.get("metrics") or {}).get("data_snapshot"),
        (previous_model.get("preprocessing") or {}).get("data_snapshot"),
    ]
    for raw in candidates:
        if not isinstance(raw, dict):
            continue
        rows = _coerce_int(raw.get("matured_rows"))
        if rows is None:
            continue
        return DataSnapshot(
            matured_rows=rows,
            max_decision_date=(str(raw["max_decision_date"])[:10] if raw.get("max_decision_date") else None),
            dataset_version=str(raw.get("dataset_version") or ""),
            label_horizon=str(raw.get("label_horizon") or ""),
        )
    return None


@dataclass(frozen=True)
class IncrementalDecision:
    should_train: bool
    reason: str
    new_matured_rows: int | None
    threshold: int
    current: dict[str, Any]
    previous: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "should_train": self.should_train,
            "reason": self.reason,
            "new_matured_rows": self.new_matured_rows,
            "min_new_matured_rows": self.threshold,
            "current_snapshot": self.current,
            "previous_snapshot": self.previous,
        }


def decide(
    current: DataSnapshot,
    previous: DataSnapshot | None,
    min_new_matured_rows: int = DEFAULT_MIN_NEW_MATURED_ROWS,
    force: bool = False,
) -> IncrementalDecision:
    """Decide whether a training run is worth its compute."""
    threshold = max(0, int(min_new_matured_rows))
    prev_dict = previous.to_dict() if previous else None

    def result(should: bool, reason: str, new_rows: int | None) -> IncrementalDecision:
        return IncrementalDecision(should, reason, new_rows, threshold, current.to_dict(), prev_dict)

    if force:
        return result(True, "forced by configuration", None if previous is None else current.matured_rows - previous.matured_rows)
    if threshold == 0:
        return result(True, "incremental gate disabled (threshold 0)", None)
    if previous is None:
        return result(True, "no previous registered model snapshot — training baseline", None)
    if previous.dataset_version != current.dataset_version or previous.label_horizon != current.label_horizon:
        return result(True, "dataset_version/label_horizon changed since last model", None)

    new_rows = current.matured_rows - previous.matured_rows
    if new_rows < 0:
        return result(True, f"matured row count decreased ({previous.matured_rows} -> {current.matured_rows}) — retraining", new_rows)
    if new_rows >= threshold:
        return result(True, f"{new_rows} new matured rows >= threshold {threshold}", new_rows)
    return result(
        False,
        f"only {new_rows} new matured rows since last model (threshold {threshold}) — skipping to conserve Cloud/Actions usage",
        new_rows,
    )
