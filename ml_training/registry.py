"""Registry client — all writes go through the ml-model-registry edge function."""
from __future__ import annotations

from typing import Any

import requests

from .config import Settings


def _post(settings: Settings, action: str, payload: dict) -> dict:
    resp = requests.post(
        f"{settings.functions_url}/ml-model-registry",
        params={"action": action},
        headers={"x-ml-key": settings.ml_training_key, "content-type": "application/json"},
        json=payload,
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


def previous_model(settings: Settings) -> dict | None:
    return _post(settings, "previous_model", {}).get("previous_model")


def log_predictions(settings: Settings, model_version_id: str, version: str, predictions: list[dict]) -> dict:
    return _post(settings, "log_predictions", {
        "model_version_id": model_version_id,
        "model_version": version,
        "predictions": predictions,
    })
