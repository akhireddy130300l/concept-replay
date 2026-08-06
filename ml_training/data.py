"""Data access — authenticated edge-function export only (no service-role key)."""
from __future__ import annotations

import io
import json

import pandas as pd
import requests

from .config import Settings

PAGE = 20000


def _fetch_pages(settings: Settings, params: dict) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = dict(params)
        q.update({"format": "json", "dataset": "v3", "limit": PAGE, "offset": offset})
        resp = requests.get(
            f"{settings.functions_url}/export-training-dataset",
            params=q,
            headers={"x-ml-key": settings.ml_training_key},
            timeout=180,
        )
        if not resp.ok:
            raise RuntimeError(f"export failed [{resp.status_code}]: {resp.text[:500]}")
        chunk = [json.loads(line) for line in io.StringIO(resp.text) if line.strip()]
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE
    return rows


def load_matured(settings: Settings) -> pd.DataFrame:
    rows = _fetch_pages(settings, {"only_matured": "true", "dataset_version": settings.dataset_version})
    return pd.DataFrame(rows)


def load_unmatured(settings: Settings, limit_days: int = 15) -> pd.DataFrame:
    """Recent rows whose label has not matured yet — shadow-prediction targets."""
    rows = _fetch_pages(settings, {"unmatured_only": "true", "dataset_version": settings.dataset_version})
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    dates = sorted(df["decision_date"].dropna().unique())[-limit_days:]
    return df[df["decision_date"].isin(dates)].copy()
