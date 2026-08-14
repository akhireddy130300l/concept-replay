"""Evaluation metrics for swing-trade ranking models.

Ranking is deterministic by construction: rows are ordered by descending score
and ties are broken by a stable secondary key (the ticker). Row order in the
input frame can never change precision@k, return statistics or EV. This matters
in practice because isotonic calibration is a step function — it collapses
previously distinct scores onto identical calibrated values, which creates ties
that did not exist in the raw scores.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    precision_recall_fscore_support,
    recall_score,
    roc_auc_score,
)

KS = (1, 3, 5, 10)


def _tie_keys(tie_break, n: int) -> np.ndarray:
    """Secondary sort key as strings; falls back to a stable positional key."""
    if tie_break is None:
        return np.array([f"{i:012d}" for i in range(n)], dtype=object)
    arr = np.asarray(tie_break, dtype=object)
    if arr.shape[0] != n:
        return np.array([f"{i:012d}" for i in range(n)], dtype=object)
    return np.array(["" if v is None else str(v) for v in arr], dtype=object)


def top_k_indices(scores: np.ndarray, k: int, tie_break=None) -> np.ndarray:
    """Indices of the k highest scores, ties broken by ascending `tie_break`.

    Deterministic regardless of input row order. NaN scores rank last.
    """
    s = np.asarray(scores, dtype=float)
    n = len(s)
    if n == 0 or k <= 0:
        return np.array([], dtype=int)
    keys = _tie_keys(tie_break, n)
    primary = np.where(np.isfinite(s), -s, np.inf)
    order = sorted(range(n), key=lambda i: (primary[i], keys[i]))
    return np.asarray(order[: min(k, n)], dtype=int)


def _group_order(groups: np.ndarray) -> list:
    """Deterministic group iteration order (sorted, not first-seen)."""
    return sorted(pd.unique(np.asarray(groups, dtype=object)), key=str)


def _precision_at_k(scores: np.ndarray, y: np.ndarray, groups: np.ndarray, k: int, tie_break=None) -> float:
    """Mean precision@k computed per decision date (how the engine actually picks)."""
    tb = _tie_keys(tie_break, len(scores))
    vals = []
    for g in _group_order(groups):
        m = np.asarray(groups, dtype=object) == g
        s, yy = scores[m], y[m]
        if len(s) == 0:
            continue
        top = top_k_indices(s, k, tb[m])
        vals.append(float(np.mean(yy[top])))
    return float(np.mean(vals)) if vals else float("nan")


def _return_stats(scores: np.ndarray, returns: np.ndarray, drawdowns: np.ndarray,
                  groups: np.ndarray, k: int = 3, tie_break=None):
    tb = _tie_keys(tie_break, len(scores))
    picked_ret, picked_dd = [], []
    for g in _group_order(groups):
        m = np.asarray(groups, dtype=object) == g
        s = scores[m]
        if len(s) == 0:
            continue
        top = top_k_indices(s, k, tb[m])
        picked_ret.extend(np.asarray(returns[m])[top].tolist())
        picked_dd.extend(np.asarray(drawdowns[m])[top].tolist())
    r = pd.Series(picked_ret, dtype="float64").dropna()
    d = pd.Series(picked_dd, dtype="float64").dropna()
    return {
        "expected_return_top3": float(r.mean()) if len(r) else float("nan"),
        "median_return_top3": float(r.median()) if len(r) else float("nan"),
        "max_drawdown_top3": float(d.min()) if len(d) else float("nan"),
    }


def expected_value(scores: np.ndarray, returns: np.ndarray, groups: np.ndarray,
                   k: int = 3, cost_pct: float = 0.15, tie_break=None) -> dict:
    """Cost-sensitive EV per trade for the top-k picks of each decision date.

    `cost_pct` is round-trip friction (spread + slippage) in percent, subtracted
    from every realised return. Accuracy is not the objective — money is.
    """
    scores = np.asarray(scores, dtype=float)
    tb = _tie_keys(tie_break, len(scores))
    per_trade: list[float] = []
    for g in _group_order(groups):
        m = np.asarray(groups, dtype=object) == g
        s = scores[m]
        if len(s) == 0:
            continue
        top = top_k_indices(s, k, tb[m])
        per_trade.extend((np.asarray(returns[m], dtype=float)[top] - cost_pct).tolist())
    r = pd.Series(per_trade, dtype="float64").dropna()
    if not len(r):
        return {"ev_per_trade": float("nan"), "ev_win_rate": float("nan"), "ev_trades": 0}
    downside = r[r < 0]
    return {
        "ev_per_trade": float(r.mean()),
        "ev_median": float(r.median()),
        "ev_win_rate": float((r > 0).mean()),
        "ev_worst": float(r.min()),
        "ev_downside_mean": float(downside.mean()) if len(downside) else 0.0,
        "ev_trades": int(len(r)),
    }


def evaluate(y: np.ndarray, proba: np.ndarray, groups: np.ndarray, returns, drawdowns,
             threshold: float = 0.5, tie_break=None) -> dict:
    y = np.asarray(y).astype(int)
    proba = np.asarray(proba, dtype=float)
    pred = (proba >= threshold).astype(int)
    tie_break = _tie_keys(tie_break, len(proba))

    out: dict[str, float] = {}
    try:
        out["roc_auc"] = float(roc_auc_score(y, proba))
    except ValueError:
        out["roc_auc"] = float("nan")
    try:
        out["pr_auc"] = float(average_precision_score(y, proba))
    except ValueError:
        out["pr_auc"] = float("nan")
    out["balanced_accuracy"] = float(balanced_accuracy_score(y, pred))
    out["brier"] = float(brier_score_loss(y, proba))
    p, r, f, _ = precision_recall_fscore_support(y, pred, labels=[0, 1], zero_division=0)
    out.update({
        "precision_negative": float(p[0]), "recall_negative": float(r[0]), "f1_negative": float(f[0]),
        "precision_positive": float(p[1]), "recall_positive": float(r[1]), "f1_positive": float(f[1]),
    })
    out["negative_recall"] = float(recall_score(y, pred, pos_label=0, zero_division=0))
    out["positive_rate"] = float(np.mean(y))
    for k in KS:
        out[f"precision_at_{k}"] = _precision_at_k(proba, y, groups, k, tie_break)
    out.update(_return_stats(proba, np.asarray(returns, dtype=float),
                             np.asarray(drawdowns, dtype=float), groups, tie_break=tie_break))
    out.update(expected_value(proba, np.asarray(returns, dtype=float), groups, tie_break=tie_break))
    out.update(calibration(y, proba))
    return out



def calibration(y: np.ndarray, proba: np.ndarray, bins: int = 10) -> dict:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(proba, edges[1:-1]), 0, bins - 1)
    gaps, weights = [], []
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        gaps.append(abs(float(np.mean(proba[m])) - float(np.mean(y[m]))))
        weights.append(int(m.sum()))
    if not gaps:
        return {"calibration_error": float("nan")}
    return {"calibration_error": float(np.average(gaps, weights=weights))}
