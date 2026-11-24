from __future__ import annotations

import types
import numpy as np
import pandas as pd

from ml_training import registry
from ml_training.config import Settings


class _GoodPipeline:
    def __init__(self, prob: float):
        self._prob = prob

    def predict_proba(self, X):
        n = len(X)
        return np.column_stack([np.full(n, 1.0 - self._prob), np.full(n, self._prob)])


class _FailingPipeline:
    def predict_proba(self, X):
        raise RuntimeError("simulated model failure")


def _shadow_frame(rows: int = 5) -> pd.DataFrame:
    return pd.DataFrame([
        {
            "example_id": f"ex-{i}",
            "ticker": f"TICK{i}",
            "decision_date": "2026-11-24",
            "current_price": 50.0 + i,
        }
        for i in range(rows)
    ])


def test_shadow_predictions_isolate_failing_model_and_cap_rows():
    calls: list[tuple[str, int]] = []

    def _fake_log_predictions(settings, mv_id, version, preds, max_predictions=2000):
        calls.append((mv_id, len(preds)))
        return {"inserted": len(preds)}

    logs: list[str] = []
    registered = [
        {"name": "brf", "pipeline": _GoodPipeline(0.7), "model_version_id": "mv-1", "version": "brf-1"},
        {"name": "lgbm", "pipeline": _FailingPipeline(), "model_version_id": "mv-2", "version": "lgbm-1"},
        {"name": "lr", "pipeline": _GoodPipeline(0.6), "model_version_id": "mv-3", "version": "lr-1"},
    ]
    out = registry.log_shadow_predictions_for_models(
        settings=Settings(functions_url="http://x", ml_training_key="k"),
        registered_models=registered,
        shadow_df=_shadow_frame(6),
        cols=["current_price"],
        best_name="brf",
        calibrator=None,
        prepare_frame_fn=lambda df: df,
        log_fn=logs.append,
        log_predictions_fn=_fake_log_predictions,
        max_predictions=3,
    )

    assert [r["ok"] for r in out] == [True, False, True]
    assert calls == [("mv-1", 3), ("mv-3", 3)]
    assert any("isolated" in line for line in logs)


def test_registry_log_predictions_batches_and_caps(monkeypatch):
    sent_sizes: list[int] = []

    def _fake_post(settings, action, payload):
        assert action == "log_predictions"
        sent_sizes.append(len(payload["predictions"]))
        return {"inserted": len(payload["predictions"])}

    monkeypatch.setattr(registry, "_post", _fake_post)
    preds = [{"ticker": f"T{i}", "prediction_date": "2026-11-24"} for i in range(12)]
    res = registry.log_predictions(
        Settings(functions_url="http://x", ml_training_key="k"),
        "mv-1",
        "v1",
        preds,
        batch_size=4,
        max_predictions=10,
    )
    assert sent_sizes == [4, 4, 2]
    assert res == {"inserted": 10, "batches": 3}