"""Registry client — all writes go through the ml-model-registry edge function."""
from __future__ import annotations

import math
from typing import Any

import requests

from .config import Settings


def _json_safe(value: Any) -> Any:
    """Convert non-finite numbers to null so every estimator payload is strict JSON."""
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    # NumPy scalar parameters are common in estimator settings and metrics.
    item = getattr(value, "item", None)
    if callable(item):
        scalar = item()
        if scalar is not value:
            return _json_safe(scalar)
    return value


def _post(settings: Settings, action: str, payload: dict) -> dict:
    resp = requests.post(
        f"{settings.functions_url}/ml-model-registry",
        params={"action": action},
        headers={"x-ml-key": settings.ml_training_key, "content-type": "application/json"},
        json=_json_safe(payload),
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"registry {action} failed [{resp.status_code}]: {resp.text[:500]}")
    return resp.json()


def start_job(settings: Settings) -> str:
    data = _post(settings, "start_job", {
        "trigger_source": settings.trigger_source,
        "dataset_version": settings.dataset_version,
        "label_horizon": settings.label_horizon,
        "purge_days": settings.purge_days,
        "embargo_days": settings.embargo_days,
        "github_run_url": settings.github_run_url,
    })
    return data["job_id"]


def complete_job(settings: Settings, job_id: str, **fields: Any) -> None:
    _post(settings, "complete_job", {"job_id": job_id, **fields})


def register_model(settings: Settings, payload: dict) -> dict:
    return _post(settings, "register_model", payload)


def register_models_isolated(
    settings: Settings,
    candidates: list[dict[str, Any]],
    log_fn: Any,
) -> list[dict[str, Any]]:
    """Register every candidate independently so one failure cannot abort the run."""
    registered: list[dict[str, Any]] = []
    for candidate in candidates:
        name = candidate["name"]
        try:
            res = register_model(settings, candidate["payload"])
            model_version_id = res["model_version_id"]
            registered.append({**candidate, "model_version_id": model_version_id})
            log_fn(f"[train] registered candidate {name} -> {model_version_id}")
        except Exception as exc:
            log_fn(f"[train] registration failed for {name} (isolated): {type(exc).__name__}: {exc}")
    return registered


def previous_model(settings: Settings) -> dict | None:
    return _post(settings, "previous_model", {}).get("previous_model")


def log_predictions(
    settings: Settings,
    model_version_id: str,
    version: str,
    predictions: list[dict],
    batch_size: int = 500,
    max_predictions: int = 2000,
) -> dict:
    capped = predictions[:max_predictions]
    if not capped:
        return {"inserted": 0, "batches": 0}
    total_inserted = 0
    batches = 0
    for i in range(0, len(capped), batch_size):
        chunk = capped[i : i + batch_size]
        res = _post(settings, "log_predictions", {
            "model_version_id": model_version_id,
            "model_version": version,
            "predictions": chunk,
        })
        total_inserted += int(res.get("inserted", 0))
        batches += 1
    return {"inserted": total_inserted, "batches": batches}


def log_shadow_predictions_for_models(
    settings: Settings,
    registered_models: list[dict[str, Any]],
    shadow_df: Any,
    cols: list[str],
    best_name: str,
    calibrator: Any,
    prepare_frame_fn: Any,
    log_fn: Any,
    log_predictions_fn: Any = log_predictions,
    max_predictions: int = 2000,
) -> list[dict[str, Any]]:
    """Log shadow predictions for every candidate model with per-model failure isolation."""
    results: list[dict[str, Any]] = []
    if shadow_df.empty:
        return results
    sdf = prepare_frame_fn(shadow_df).head(max_predictions)
    for entry in registered_models:
        name = entry["name"]
        try:
            raw = entry["pipeline"].predict_proba(sdf[cols])[:, 1]
            use_calibrator = name == best_name and calibrator is not None and calibrator.is_fitted
            proba = calibrator.transform(raw) if use_calibrator else raw
            preds = [{
                "ticker": row.ticker,
                "prediction_date": str(row.decision_date),
                "probability": float(p),
                "predicted_label": "positive" if p >= 0.5 else "negative",
                "confidence_score": float(abs(p - 0.5) * 2),
                "training_example_id": row.example_id,
            } for row, p in zip(sdf.itertuples(), proba)]
            out = log_predictions_fn(
                settings,
                entry["model_version_id"],
                entry["version"],
                preds,
                max_predictions=max_predictions,
            )
            inserted = int(out.get("inserted", 0))
            log_fn(
                f"[train] shadow predictions logged for {name}: {inserted} "
                f"({'calibrated' if use_calibrator else 'raw'} probabilities)"
            )
            results.append({"algorithm": name, "ok": True, "inserted": inserted})
        except Exception as exc:
            log_fn(f"[train] shadow predictions failed for {name} (isolated): {exc}")
            results.append({"algorithm": name, "ok": False, "error": str(exc)})
    return results
