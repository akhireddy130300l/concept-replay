from __future__ import annotations

import json
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


def test_registry_converts_non_finite_numbers_to_strict_json_null(monkeypatch):
    captured = {}

    class _Response:
        ok = True

        def json(self):
            return {"ok": True}

    def _fake_post(url, **kwargs):
        captured.update(kwargs)
        return _Response()

    monkeypatch.setattr(registry.requests, "post", _fake_post)
    registry._post(
        Settings(functions_url="http://x", ml_training_key="k"),
        "register_model",
        {
            "hyperparameters": {
                "missing": float("nan"),
                "nested": [float("inf"), float("-inf"), 1.25],
                "numpy_value": np.float64(float("nan")),
            }
        },
    )

    payload = captured["json"]
    assert payload["hyperparameters"]["missing"] is None
    assert payload["hyperparameters"]["nested"] == [None, None, 1.25]
    assert payload["hyperparameters"]["numpy_value"] is None
    json.dumps(payload, allow_nan=False)


def test_xgboost_missing_parameter_is_strict_json_after_sanitizing():
    from xgboost import XGBClassifier

    params = XGBClassifier(eval_metric="logloss").get_params()
    assert np.isnan(params["missing"])
    safe = registry._json_safe(params)
    assert safe["missing"] is None
    json.dumps(safe, allow_nan=False)


def test_model_registration_failure_does_not_abort_other_models(monkeypatch):
    def _fake_register(settings, payload):
        if payload["algorithm"] == "broken":
            raise RuntimeError("simulated registration failure")
        return {"model_version_id": f"mv-{payload['algorithm']}"}

    monkeypatch.setattr(registry, "register_model", _fake_register)
    candidates = [
        {"name": name, "payload": {"algorithm": name}}
        for name in ("first", "broken", "last")
    ]
    logs: list[str] = []
    out = registry.register_models_isolated(
        Settings(functions_url="http://x", ml_training_key="k"), candidates, logs.append
    )

    assert [item["model_version_id"] for item in out] == ["mv-first", "mv-last"]
    assert sum("isolated" in line for line in logs) == 1


def test_candidate_estimators_include_expanded_tournament_and_fit():
    from sklearn.pipeline import Pipeline
    from ml_training import features, train

    est_list = train.candidate_estimators()
    names = [name for name, _ in est_list]
    for required in (
        "logistic_regression",
        "elastic_net",
        "extra_trees",
        "hist_gradient_boosting",
        "mlp_neural_net",
        "consensus_ensemble",
    ):
        assert required in names, f"missing required model {required}"

    rng = np.random.default_rng(7)
    n = 80
    row_data: dict[str, object] = {}
    for col in features.NUMERIC_FEATURES:
        row_data[col] = rng.normal(size=n)
    for col in features.BOOLEAN_FEATURES:
        row_data[col] = rng.integers(0, 2, size=n).astype(float)
    for col in features.CATEGORICAL_FEATURES:
        row_data[col] = rng.choice(["a", "b", "c"], size=n)
    X = pd.DataFrame(row_data)
    y = (rng.random(n) > 0.5).astype(int)
    y[0], y[1] = 0, 1

    for name, est in est_list:
        pipe = Pipeline([("pre", train.build_preprocessor()), ("model", est)])
        pipe.fit(X, y)
        probs = pipe.predict_proba(X[:10])[:, 1]
        assert probs.shape == (10,), f"{name} bad shape"
        assert np.all(np.isfinite(probs)) and np.all((probs >= 0.0) & (probs <= 1.0)), f"{name} invalid probs"