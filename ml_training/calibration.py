"""Probability calibration.

The email wants an honest probability, not just a ranking. Isotonic regression
is fit on the VALIDATION fold only (never on train, never on test) and then
applied to test/shadow scores. Ranking is preserved (isotonic is monotone), so
precision@k is unchanged while Brier score and calibration error improve.
"""
from __future__ import annotations

import numpy as np
from sklearn.isotonic import IsotonicRegression


class ProbabilityCalibrator:
    """Monotone map raw_score -> calibrated probability."""

    def __init__(self, min_rows: int = 100):
        self.min_rows = min_rows
        self._iso: IsotonicRegression | None = None
        self.fitted_on = 0

    def fit(self, proba: np.ndarray, y: np.ndarray) -> "ProbabilityCalibrator":
        p = np.asarray(proba, dtype=float)
        t = np.asarray(y).astype(int)
        ok = np.isfinite(p)
        p, t = p[ok], t[ok]
        # Need both classes and enough rows, else calibration overfits noise.
        if len(p) < self.min_rows or len(np.unique(t)) < 2:
            self._iso = None
            self.fitted_on = 0
            return self
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        iso.fit(p, t)
        self._iso = iso
        self.fitted_on = int(len(p))
        return self

    @property
    def is_fitted(self) -> bool:
        return self._iso is not None

    def transform(self, proba: np.ndarray) -> np.ndarray:
        p = np.asarray(proba, dtype=float)
        if self._iso is None:
            return p
        return np.clip(self._iso.predict(np.nan_to_num(p, nan=0.5)), 0.0, 1.0)
