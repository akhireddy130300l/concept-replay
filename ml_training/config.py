"""Runtime configuration for the automated training pipeline."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    functions_url: str
    ml_training_key: str
    dataset_version: str = "dataset_v1"
    label_horizon: str = "10_session"
    # 10-session label horizon -> purge at least the horizon length in calendar
    # days so no training row's outcome window overlaps a validation/test date.
    purge_days: int = 16
    embargo_days: int = 5
    train_frac: float = 0.60
    val_frac: float = 0.20
    min_matured_rows: int = 400
    min_test_rows: int = 50
    trigger_source: str = "github_actions"
    github_run_url: str | None = None
    dry_run: bool = False

    @staticmethod
    def from_env() -> "Settings":
        url = os.environ.get("SUPABASE_FUNCTIONS_URL", "").rstrip("/")
        key = os.environ.get("ML_TRAINING_KEY", "")
        if not url:
            raise SystemExit("SUPABASE_FUNCTIONS_URL is required (e.g. https://<ref>.supabase.co/functions/v1)")
        if not key:
            raise SystemExit("ML_TRAINING_KEY is required")
        run_url = None
        if os.environ.get("GITHUB_SERVER_URL") and os.environ.get("GITHUB_REPOSITORY") and os.environ.get("GITHUB_RUN_ID"):
            run_url = f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        return Settings(
            functions_url=url,
            ml_training_key=key,
            dataset_version=os.environ.get("DATASET_VERSION", "dataset_v1"),
            purge_days=int(os.environ.get("PURGE_DAYS", 16)),
            embargo_days=int(os.environ.get("EMBARGO_DAYS", 5)),
            trigger_source=os.environ.get("TRIGGER_SOURCE", "github_actions"),
            github_run_url=run_url,
            dry_run=os.environ.get("DRY_RUN", "").lower() == "true",
        )
