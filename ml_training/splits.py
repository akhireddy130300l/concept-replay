"""Chronological splits with whole decision dates kept together, plus purge and embargo."""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from .features import DATE_COL


def split_dates(dates: list[date], train_frac: float, val_frac: float) -> tuple[list[date], list[date], list[date]]:
    ordered = sorted(set(dates))
    n = len(ordered)
    n_train = max(1, int(round(n * train_frac)))
    n_val = max(1, int(round(n * val_frac)))
    if n_train + n_val >= n:
        n_val = max(1, n - n_train - 1)
    return ordered[:n_train], ordered[n_train:n_train + n_val], ordered[n_train + n_val:]


def apply_purge_embargo(
    train: list[date], val: list[date], test: list[date], purge_days: int, embargo_days: int
) -> tuple[list[date], list[date]]:
    """Drop train dates whose label window overlaps val/test, plus an embargo gap."""
    if not val and not test:
        return train, val
    boundary = min([d for d in (val + test)])
    cutoff = boundary - timedelta(days=purge_days + embargo_days)
    kept_train = [d for d in train if d <= cutoff]
    if test:
        test_start = min(test)
        val_cutoff = test_start - timedelta(days=purge_days + embargo_days)
        kept_val = [d for d in val if d <= val_cutoff]
    else:
        kept_val = val
    return kept_train, kept_val


def chronological_split(df: pd.DataFrame, train_frac: float, val_frac: float, purge_days: int, embargo_days: int):
    dates = list(df[DATE_COL].unique())
    tr, va, te = split_dates(dates, train_frac, val_frac)
    tr, va = apply_purge_embargo(tr, va, te, purge_days, embargo_days)
    masks = {
        "train": df[DATE_COL].isin(tr),
        "val": df[DATE_COL].isin(va),
        "test": df[DATE_COL].isin(te),
    }
    windows = {"train": tr, "val": va, "test": te}
    return masks, windows
