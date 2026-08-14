"""Dataset integrity checks that run BEFORE any model sees the data.

The training set is keyed on (ticker, decision_date, dataset_version). Duplicate
keys are never "just noise": either the exporter emitted the same row twice
(harmless but must be visible) or two rows disagree on features/label for the
same point in time (poisonous — the model learns contradictions and the
chronological split silently spreads the same observation across folds).

Policy: report both kinds, drop nothing silently, and fail the job on any
conflicting duplicate. Exact duplicates are collapsed only when explicitly
allowed, and the collapse is always reported.
"""
from __future__ import annotations

import pandas as pd

from .features import DATE_COL

KEY_COLUMNS = ["ticker", DATE_COL, "dataset_version"]


class DuplicateRowsError(RuntimeError):
    """Raised when the dataset contains duplicate keys we refuse to guess about."""


def _key_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "ticker" not in out.columns:
        out["ticker"] = [f"__row_{i}" for i in range(len(out))]
    if "dataset_version" not in out.columns:
        out["dataset_version"] = "unknown"
    return out


def duplicate_report(df: pd.DataFrame, compare_columns: list[str] | None = None) -> dict:
    """Describe duplicate keys without modifying anything.

    Returns counts plus a small sample of offending keys, suitable for the job
    record and the training log.
    """
    work = _key_frame(df)
    dup_mask = work.duplicated(subset=KEY_COLUMNS, keep=False)
    dup = work[dup_mask]
    if dup.empty:
        return {
            "rows": int(len(work)),
            "unique_keys": int(len(work)),
            "duplicate_rows": 0,
            "duplicate_keys": 0,
            "exact_duplicate_rows": 0,
            "conflicting_keys": 0,
            "conflicting_examples": [],
        }

    cols = compare_columns or [c for c in work.columns if c not in KEY_COLUMNS]
    cols = [c for c in cols if c in work.columns]

    conflicting: list[dict] = []
    exact_dupe_rows = 0
    for key, grp in dup.groupby(KEY_COLUMNS, dropna=False):
        # Stringify so NaN/None and unhashable-ish cells compare deterministically.
        sig = grp[cols].astype(str).agg("|".join, axis=1) if cols else pd.Series(["" ] * len(grp))
        distinct = sig.nunique()
        if distinct > 1:
            conflicting.append({
                "ticker": str(key[0]),
                "decision_date": str(key[1]),
                "dataset_version": str(key[2]),
                "rows": int(len(grp)),
                "distinct_variants": int(distinct),
            })
        else:
            exact_dupe_rows += int(len(grp) - 1)

    conflicting.sort(key=lambda d: (d["decision_date"], d["ticker"]))
    return {
        "rows": int(len(work)),
        "unique_keys": int(work.drop_duplicates(subset=KEY_COLUMNS).shape[0]),
        "duplicate_rows": int(len(dup)),
        "duplicate_keys": int(dup.drop_duplicates(subset=KEY_COLUMNS).shape[0]),
        "exact_duplicate_rows": exact_dupe_rows,
        "conflicting_keys": len(conflicting),
        "conflicting_examples": conflicting[:20],
    }


def enforce_uniqueness(
    df: pd.DataFrame,
    allow_exact_duplicates: bool = True,
    compare_columns: list[str] | None = None,
) -> tuple[pd.DataFrame, dict]:
    """Validate the key uniqueness contract.

    - Conflicting duplicates  -> always raise. We do not pick a winner.
    - Exact duplicates        -> collapsed to one row when allowed (and reported),
                                 otherwise raise.
    """
    report = duplicate_report(df, compare_columns=compare_columns)
    if report["conflicting_keys"]:
        raise DuplicateRowsError(
            f"{report['conflicting_keys']} (ticker, decision_date, dataset_version) key(s) have "
            f"conflicting rows — refusing to guess which one is real. "
            f"First offenders: {report['conflicting_examples'][:5]}"
        )
    if report["exact_duplicate_rows"] and not allow_exact_duplicates:
        raise DuplicateRowsError(
            f"{report['exact_duplicate_rows']} exact duplicate row(s) present and "
            f"allow_exact_duplicates=False")

    out = df
    if report["exact_duplicate_rows"]:
        work = _key_frame(df)
        out = df[~work.duplicated(subset=KEY_COLUMNS, keep="first")].copy()
    report["rows_after_dedup"] = int(len(out))
    return out, report
