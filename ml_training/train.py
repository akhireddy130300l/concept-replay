"""End-to-end automated training entrypoint.

Trains Logistic Regression, Balanced Random Forest and LightGBM (XGBoost
fallback), evaluates them chronologically against the always-positive baseline,
the rule engine and the previous ML model, then registers every valid model as
a CANDIDATE. Nothing is ever auto-promoted.
"""
from __future__ import annotations

import base64
import gzip
import io
import json
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import data, features, registry
from .config import Settings
from .metrics import evaluate
from .splits import chronological_split


def build_preprocessor() -> ColumnTransformer:
    num = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    boo = Pipeline([("impute", SimpleImputer(strategy="most_frequent"))])
    cat = Pipeline([
        ("impute", SimpleImputer(strategy="constant", fill_value="unknown")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=10)),
    ])
    return ColumnTransformer([
        ("num", num, features.NUMERIC_FEATURES),
        ("bool", boo, features.BOOLEAN_FEATURES),
        ("cat", cat, features.CATEGORICAL_FEATURES),
    ])


def candidate_estimators():
    est = [
        ("logistic_regression", LogisticRegression(max_iter=2000, class_weight="balanced", C=0.5)),
    ]
    try:
        from imblearn.ensemble import BalancedRandomForestClassifier

        est.append(("balanced_random_forest", BalancedRandomForestClassifier(
            n_estimators=400, max_depth=6, min_samples_leaf=20,
            sampling_strategy="auto", replacement=True, bootstrap=False, random_state=42, n_jobs=-1)))
    except Exception as exc:  # pragma: no cover
        print(f"[train] BalancedRandomForest unavailable: {exc}")
    try:
        from lightgbm import LGBMClassifier

        est.append(("lightgbm", LGBMClassifier(
            n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=30,
            subsample=0.8, colsample_bytree=0.8, class_weight="balanced", random_state=42, verbose=-1)))
    except Exception:
        try:
            from xgboost import XGBClassifier

            est.append(("xgboost", XGBClassifier(
                n_estimators=400, learning_rate=0.03, max_depth=4, subsample=0.8,
                colsample_bytree=0.8, eval_metric="logloss", random_state=42)))
        except Exception as exc:  # pragma: no cover
            print(f"[train] neither LightGBM nor XGBoost available: {exc}")
    return est


def encode_artifact(pipeline: Pipeline) -> dict:
    buf = io.BytesIO()
    joblib.dump(pipeline, buf)
    raw = gzip.compress(buf.getvalue())
    if len(raw) > 6_000_000:
        return {"format": "joblib+gzip+base64", "stored": False, "reason": "artifact too large", "bytes": len(raw)}
    return {
        "format": "joblib+gzip+base64",
        "stored": True,
        "bytes": len(raw),
        "sklearn_pickle_b64": base64.b64encode(raw).decode("ascii"),
    }


def feature_importance(name: str, pipeline: Pipeline) -> dict:
    try:
        names = list(pipeline.named_steps["pre"].get_feature_names_out())
        model = pipeline.named_steps["model"]
        if hasattr(model, "feature_importances_"):
            vals = np.asarray(model.feature_importances_, dtype=float)
        elif hasattr(model, "coef_"):
            vals = np.asarray(model.coef_, dtype=float).ravel()
        else:
            return {}
        pairs = sorted(zip(names, vals.tolist()), key=lambda p: abs(p[1]), reverse=True)[:40]
        return {"kind": "importances" if hasattr(model, "feature_importances_") else "coefficients",
                "top": [{"feature": n, "value": float(v)} for n, v in pairs]}
    except Exception as exc:  # pragma: no cover
        print(f"[train] importance extraction failed for {name}: {exc}")
        return {}


def main() -> int:
    settings = Settings.from_env()
    logs: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        logs.append(msg)

    job_id = None if settings.dry_run else registry.start_job(settings)
    try:
        df = data.load_matured(settings)
        log(f"[train] matured rows fetched: {len(df)}")
        if df.empty:
            raise RuntimeError("no matured training rows returned by export")
        df = features.prepare_frame(df)
        df = df[df[features.TARGET].notna()].copy()
        df[features.TARGET] = df[features.TARGET].astype(int)
        df = df.sort_values(features.DATE_COL)

        if len(df) < settings.min_matured_rows:
            raise RuntimeError(f"not enough matured rows ({len(df)} < {settings.min_matured_rows})")

        masks, windows = chronological_split(
            df, settings.train_frac, settings.val_frac, settings.purge_days, settings.embargo_days)
        for split, m in masks.items():
            log(f"[train] {split}: rows={int(m.sum())} dates={len(windows[split])}")
        if int(masks["test"].sum()) < settings.min_test_rows:
            raise RuntimeError("test split too small after purge/embargo")

        cols = features.feature_columns()
        features.assert_no_leakage(cols)

        parts = {s: df[m] for s, m in masks.items()}
        y = {s: p[features.TARGET].to_numpy() for s, p in parts.items()}
        groups = {s: p[features.DATE_COL].to_numpy() for s, p in parts.items()}
        rets = {s: p["outcome_10_session"].to_numpy() for s, p in parts.items()}
        dds = {s: p["max_drawdown_pct"].to_numpy() for s, p in parts.items()}

        # ---- baselines -------------------------------------------------
        baselines = {
            "always_positive": evaluate(y["test"], np.ones(len(y["test"])), groups["test"], rets["test"], dds["test"]),
            "rule_engine": evaluate(
                y["test"],
                pd.to_numeric(parts["test"]["baseline_rule_score"], errors="coerce").fillna(0).clip(0, 10).to_numpy() / 10.0,
                groups["test"], rets["test"], dds["test"]),
        }
        prev = None if settings.dry_run else registry.previous_model(settings)
        if prev:
            baselines["previous_model"] = (prev.get("metrics") or {}).get("test", {})
        log(f"[train] baseline rule_engine precision@3={baselines['rule_engine']['precision_at_3']:.3f}")

        results = []
        version_stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for name, est in candidate_estimators():
            pipe = Pipeline([("pre", build_preprocessor()), ("model", est)])
            pipe.fit(parts["train"][cols], y["train"])  # preprocessing fit on TRAIN only
            metrics = {}
            for split in ("train", "val", "test"):
                if len(parts[split]) == 0:
                    continue
                proba = pipe.predict_proba(parts[split][cols])[:, 1]
                metrics[split] = evaluate(y[split], proba, groups[split], rets[split], dds[split])
            log(f"[train] {name}: test pr_auc={metrics['test']['pr_auc']:.3f} "
                f"p@3={metrics['test']['precision_at_3']:.3f} roc={metrics['test']['roc_auc']:.3f}")
            results.append({"name": name, "pipeline": pipe, "metrics": metrics})

        if not results:
            raise RuntimeError("no estimators could be trained")

        best = max(results, key=lambda r: (r["metrics"]["test"]["pr_auc"] if np.isfinite(r["metrics"]["test"]["pr_auc"]) else -1))
        log(f"[train] best candidate by test PR-AUC: {best['name']}")

        registered = []
        for r in results:
            if settings.dry_run:
                continue
            payload = {
                "job_id": job_id,
                "name": f"swing_{settings.label_horizon}",
                "algorithm": r["name"],
                "version": f"{r['name']}-{version_stamp}",
                "label_horizon": settings.label_horizon,
                "dataset_version": settings.dataset_version,
                "feature_version": "v1",
                "hyperparameters": {k: (v if isinstance(v, (int, float, str, bool, type(None))) else str(v))
                                    for k, v in r["pipeline"].named_steps["model"].get_params().items()},
                "feature_order": cols,
                "preprocessing": {
                    "numeric": {"impute": "median", "scale": "standard", "columns": features.NUMERIC_FEATURES},
                    "boolean": {"impute": "most_frequent", "columns": features.BOOLEAN_FEATURES},
                    "categorical": {"impute": "constant:unknown", "encode": "onehot(min_frequency=10)", "columns": features.CATEGORICAL_FEATURES},
                    "fit_on": "train_split_only",
                },
                "artifact": encode_artifact(r["pipeline"]),
                "metrics": r["metrics"],
                "baseline_comparison": baselines,
                "feature_importance": feature_importance(r["name"], r["pipeline"]),
                "train_window": f"[{min(windows['train'])},{max(windows['train'])}]" if windows["train"] else None,
                "test_window": f"[{min(windows['test'])},{max(windows['test'])}]" if windows["test"] else None,
                "notes": f"automated run; purge={settings.purge_days}d embargo={settings.embargo_days}d; "
                         f"chronological split by decision_date; candidate only",
            }
            res = registry.register_model(settings, payload)
            registered.append({"algorithm": r["name"], "model_version_id": res["model_version_id"]})
            log(f"[train] registered candidate {r['name']} -> {res['model_version_id']}")

            if r["name"] == best["name"]:
                shadow = data.load_unmatured(settings)
                if not shadow.empty:
                    sdf = features.prepare_frame(shadow)
                    proba = r["pipeline"].predict_proba(sdf[cols])[:, 1]
                    preds = [{
                        "ticker": row.ticker,
                        "prediction_date": str(row.decision_date),
                        "probability": float(p),
                        "predicted_label": "positive" if p >= 0.5 else "negative",
                        "confidence_score": float(abs(p - 0.5) * 2),
                        "training_example_id": row.example_id,
                    } for row, p in zip(sdf.itertuples(), proba)]
                    out = registry.log_predictions(settings, res["model_version_id"], payload["version"], preds)
                    log(f"[train] shadow predictions logged: {out.get('inserted', 0)}")

        if not settings.dry_run:
            registry.complete_job(
                settings, job_id, status="completed",
                train_start=str(min(windows["train"])) if windows["train"] else None,
                train_end=str(max(windows["train"])) if windows["train"] else None,
                val_start=str(min(windows["val"])) if windows["val"] else None,
                val_end=str(max(windows["val"])) if windows["val"] else None,
                test_start=str(min(windows["test"])) if windows["test"] else None,
                test_end=str(max(windows["test"])) if windows["test"] else None,
                total_rows=int(len(df)), matured_rows=int(len(df)),
                train_rows=int(masks["train"].sum()), val_rows=int(masks["val"].sum()),
                test_rows=int(masks["test"].sum()),
                positive_rate=float(df[features.TARGET].mean()),
                best_model=best["name"], logs="\n".join(logs)[-20000:],
                github_run_url=settings.github_run_url,
            )
        print(json.dumps({"best_model": best["name"], "registered": registered}, indent=2))
        return 0
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        print(f"[train] FAILED {msg}", file=sys.stderr)
        if job_id and not settings.dry_run:
            try:
                registry.complete_job(settings, job_id, status="failed", error_message=msg, logs="\n".join(logs)[-20000:])
            except Exception:
                pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
