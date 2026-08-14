"""Purged, embargoed walk-forward cross-validation over decision dates.

A single chronological split gives one number with no error bar. Walk-forward
CV rolls the train/validation boundary forward through time so we can report
mean +/- std of the validation metrics, which is what actually tells us whether
a model is stable or just lucky on one window.

The test split is never touched here — folds are cut out of the train+val
region only, so the final unbiased test read stays a one-shot read.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .features import DATE_COL


def walk_forward_windows(
    dates: list[date],
    n_folds: int = 4,
    purge_days: int = 16,
    embargo_days: int = 5,
    min_train_frac: float = 0.35,
) -> list[tuple[list[date], list[date]]]:
    """Return [(train_dates, val_dates), ...] ordered oldest -> newest.

    Each fold trains on everything up to a cutoff (minus purge+embargo) and
    validates on the next contiguous block of dates.
    """
    ordered = sorted(set(dates))
    n = len(ordered)
    if n < 4 or n_folds < 1:
        return []

    start = max(1, int(round(n * min_train_frac)))
    remaining = n - start
    if remaining < n_folds:
        n_folds = max(1, remaining)
    if remaining <= 0:
        return []

    block = max(1, remaining // n_folds)
    gap = timedelta(days=purge_days + embargo_days)

    folds: list[tuple[list[date], list[date]]] = []
    for i in range(n_folds):
        v0 = start + i * block
        v1 = n if i == n_folds - 1 else min(n, v0 + block)
        val = ordered[v0:v1]
        if not val:
            continue
        cutoff = min(val) - gap
        train = [d for d in ordered[:v0] if d <= cutoff]
        if not train:
            continue
        folds.append((train, val))
    return folds


def summarize(fold_metrics: list[dict], keys: tuple[str, ...] = ("pr_auc", "roc_auc", "precision_at_3")) -> dict:
    """Mean/std per metric across folds, ignoring non-finite values.

    IMPORTANT: the standard deviation here is descriptive spread across folds,
    NOT an independent-sample confidence interval. Labels are forward-looking
    over a 10-session horizon, so observations issued within the horizon of each
    other overlap and are positively correlated; the same market move appears in
    many rows. Naive std therefore understates true uncertainty. The output
    carries `overlapping_labels` so downstream reports cannot quietly present it
    as a statistical error bar. A time-block bootstrap over non-overlapping
    date blocks is the defensible upgrade — proposed, deliberately not
    implemented until it can be validated against the real dataset.
    """
    out: dict[str, float | int | bool | str] = {
        "folds": len(fold_metrics),
        "overlapping_labels": True,
        "std_interpretation": "descriptive spread across folds; labels overlap, "
                              "not an independent-sample confidence interval",
    }
    for k in keys:
        vals = [float(m[k]) for m in fold_metrics if k in m and np.isfinite(m.get(k, np.nan))]
        out[f"{k}_mean"] = float(np.mean(vals)) if vals else float("nan")
        out[f"{k}_std"] = float(np.std(vals)) if len(vals) > 1 else 0.0 if vals else float("nan")
    return out


def fold_masks(df: pd.DataFrame, folds: list[tuple[list[date], list[date]]]):
    for train, val in folds:
        yield df[DATE_COL].isin(train), df[DATE_COL].isin(val)
