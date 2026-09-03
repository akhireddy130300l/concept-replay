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

from . import data, features, incremental, integrity, registry
from .calibration import ProbabilityCalibrator
from .config import Settings
from .metrics import evaluate
from .splits import chronological_split
from .walkforward import fold_masks, summarize, walk_forward_windows



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
        df, dup_report = integrity.enforce_uniqueness(df)
        log(f"[train] duplicate audit: rows={dup_report['rows']} "
            f"duplicate_keys={dup_report['duplicate_keys']} "
            f"exact_duplicate_rows={dup_report['exact_duplicate_rows']} "
            f"conflicting_keys={dup_report['conflicting_keys']} "
            f"rows_after_dedup={dup_report.get('rows_after_dedup', dup_report['rows'])}")
        # ---- incremental gate: skip runs with too few new matured labels ---
        prev = None if settings.dry_run else registry.previous_model(settings)
        snapshot = incremental.snapshot_from_frame(df, settings.dataset_version, settings.label_horizon)
        decision = incremental.decide(
            snapshot,
            incremental.extract_previous_snapshot(prev),
            min_new_matured_rows=settings.min_new_matured_rows,
            force=settings.force_train,
        )
        log(f"[train] incremental gate: {decision.reason}")
        if not decision.should_train:
            if job_id and not settings.dry_run:
                registry.complete_job(
                    settings, job_id, status="skipped",
                    total_rows=int(len(df)), matured_rows=int(len(df)),
                    notes=decision.reason, logs="\n".join(logs)[-20000:],
                    github_run_url=settings.github_run_url,
                )
            print(json.dumps({"status": "skipped", "incremental": decision.to_dict()}, indent=2))
            return 0

        df = features.prepare_frame(df)
        df = df[df[features.TARGET].notna()].copy()
        df[features.TARGET] = df[features.TARGET].astype(int)
        df = df.sort_values(features.DATE_COL)

        if len(df) < settings.min_matured_rows:
            raise RuntimeError(f"not enough matured rows ({len(df)} < {settings.min_matured_rows})")

        masks, windows = chronological_split(
            df, settings.train_frac, settings.val_frac, settings.purge_days, settings.embargo_days,
            calib_frac=settings.calib_frac)
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
        # Deterministic tie-break key for every top-k computation.
        ties = {s: (p["ticker"].astype(str).to_numpy() if "ticker" in p.columns else None)
                for s, p in parts.items()}

        # ---- baselines -------------------------------------------------
        baselines = {
            "always_positive": evaluate(y["test"], np.ones(len(y["test"])), groups["test"], rets["test"],
                                        dds["test"], tie_break=ties["test"]),
            "rule_engine": evaluate(
                y["test"],
                pd.to_numeric(parts["test"]["baseline_rule_score"], errors="coerce").fillna(0).clip(0, 10).to_numpy() / 10.0,
                groups["test"], rets["test"], dds["test"], tie_break=ties["test"]),
        }
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
                metrics[split] = evaluate(y[split], proba, groups[split], rets[split], dds[split],
                                          tie_break=ties[split])
            log(f"[train] {name}: val pr_auc={metrics.get('val', {}).get('pr_auc', float('nan')):.3f} "
                f"val p@3={metrics.get('val', {}).get('precision_at_3', float('nan')):.3f} | "
                f"test pr_auc={metrics['test']['pr_auc']:.3f} (report only)")
            results.append({"name": name, "pipeline": pipe, "metrics": metrics})

        if not results:
            raise RuntimeError("no estimators could be trained")

        # Model selection uses VALIDATION metrics only. The test split is read
        # exactly once, for the final unbiased report — never for selection.
        def _val_key(r):
            m = r["metrics"].get("val") or {}
            pr = m.get("pr_auc", float("nan"))
            p3 = m.get("precision_at_3", float("nan"))
            return (pr if np.isfinite(pr) else -1, p3 if np.isfinite(p3) else -1)

        if not any(r["metrics"].get("val") for r in results):
            raise RuntimeError("validation split empty — cannot select a model without validation metrics")
        best = max(results, key=_val_key)
        log(f"[train] best candidate by VALIDATION PR-AUC: {best['name']} "
            f"(val pr_auc={best['metrics']['val']['pr_auc']:.3f}); "
            f"test metrics reported once, not used for selection")

        # ---- purged walk-forward CV for the selected algorithm -----------
        # One split is one lucky number; folds give a mean +/- std. Folds are
        # cut from train+val only so the test split stays a one-shot read.
        wf_summary: dict = {"folds": 0}
        try:
            cv_df = df[masks["train"] | masks["val"]]
            folds = walk_forward_windows(
                list(cv_df[features.DATE_COL].unique()),
                n_folds=4, purge_days=settings.purge_days, embargo_days=settings.embargo_days)
            fold_metrics = []
            for i, (tr_m, va_m) in enumerate(fold_masks(cv_df, folds), start=1):
                tr_part, va_part = cv_df[tr_m], cv_df[va_m]
                if len(tr_part) < 50 or len(va_part) < 10:
                    continue
                ytr = tr_part[features.TARGET].to_numpy()
                yva = va_part[features.TARGET].to_numpy()
                if len(np.unique(ytr)) < 2 or len(np.unique(yva)) < 2:
                    continue
                est = dict(candidate_estimators())[best["name"]]
                fold_pipe = Pipeline([("pre", build_preprocessor()), ("model", est)])
                fold_pipe.fit(tr_part[cols], ytr)
                p = fold_pipe.predict_proba(va_part[cols])[:, 1]
                fold_metrics.append(evaluate(
                    yva, p, va_part[features.DATE_COL].to_numpy(),
                    va_part["outcome_10_session"].to_numpy(), va_part["max_drawdown_pct"].to_numpy(),
                    tie_break=(va_part["ticker"].astype(str).to_numpy()
                               if "ticker" in va_part.columns else None)))
            if fold_metrics:
                wf_summary = summarize(fold_metrics, keys=("pr_auc", "roc_auc", "precision_at_3", "ev_per_trade"))
                log(f"[train] walk-forward ({wf_summary['folds']} folds): "
                    f"pr_auc={wf_summary['pr_auc_mean']:.3f}+/-{wf_summary['pr_auc_std']:.3f} "
                    f"ev/trade={wf_summary.get('ev_per_trade_mean', float('nan')):.2f}%")
            else:
                log("[train] walk-forward skipped: not enough usable folds")
        except Exception as exc:  # pragma: no cover - never block a run on CV
            log(f"[train] walk-forward failed (non-fatal): {type(exc).__name__}: {exc}")
            wf_summary = {"folds": 0, "error": f"{type(exc).__name__}: {exc}"}

        # ---- isotonic calibration, fit on the DEDICATED CALIBRATION slice -
        # Never the selection-validation fold (that fold chose the model) and
        # never the test fold. If the slice is too small we stay uncalibrated.
        calibrator = ProbabilityCalibrator()
        if len(parts["calib"]):
            cal_raw = best["pipeline"].predict_proba(parts["calib"][cols])[:, 1]
            calibrator.fit(cal_raw, y["calib"])
        if calibrator.is_fitted:
            cal_test = calibrator.transform(best["pipeline"].predict_proba(parts["test"][cols])[:, 1])
            best["metrics"]["test_calibrated"] = evaluate(
                y["test"], cal_test, groups["test"], rets["test"], dds["test"], tie_break=ties["test"])
            log(f"[train] calibrated on {calibrator.fitted_on} dedicated calibration rows: "
                f"ECE {best['metrics']['test']['calibration_error']:.3f} -> "
                f"{best['metrics']['test_calibrated']['calibration_error']:.3f}, "
                f"Brier {best['metrics']['test']['brier']:.3f} -> "
                f"{best['metrics']['test_calibrated']['brier']:.3f}")
        else:
            log("[train] calibration skipped: dedicated calibration slice too small or "
                "single-class — reporting uncalibrated probabilities (selection fold is NOT reused)")
        best["metrics"]["walk_forward"] = wf_summary
        best["metrics"]["data_integrity"] = dup_report
        # Universe membership is current-day, not point-in-time: delisted and
        # removed names are absent. Every historical evaluation carries this.
        best["metrics"]["survivorship_bias_warning"] = True
        for r in results:
            r["metrics"].setdefault("data_integrity", dup_report)
            r["metrics"].setdefault("survivorship_bias_warning", True)


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
                "data_snapshot": snapshot.to_dict(),
                "baseline_comparison": baselines,
                "feature_importance": feature_importance(r["name"], r["pipeline"]),
                "train_window": f"[{min(windows['train'])},{max(windows['train'])}]" if windows["train"] else None,
                "test_window": f"[{min(windows['test'])},{max(windows['test'])}]" if windows["test"] else None,
                "notes": f"automated run; purge={settings.purge_days}d embargo={settings.embargo_days}d; "
                         f"chronological split by decision_date; model selected on VALIDATION only; "
                         f"calibration fit on a separate chronological slice; deterministic top-k "
                         f"(ties broken by ticker); survivorship bias present (current universe); "
                         f"candidate only",
            }
            res = registry.register_model(settings, payload)
            registered.append({"algorithm": r["name"], "model_version_id": res["model_version_id"]})
            log(f"[train] registered candidate {r['name']} -> {res['model_version_id']}")

            if r["name"] == best["name"]:
                shadow = data.load_unmatured(settings)
                if not shadow.empty:
                    sdf = features.prepare_frame(shadow)
                    raw = r["pipeline"].predict_proba(sdf[cols])[:, 1]
                    proba = calibrator.transform(raw)
                    preds = [{
                        "ticker": row.ticker,
                        "prediction_date": str(row.decision_date),
                        "probability": float(p),
                        "predicted_label": "positive" if p >= 0.5 else "negative",
                        "confidence_score": float(abs(p - 0.5) * 2),
                        "training_example_id": row.example_id,
                    } for row, p in zip(sdf.itertuples(), proba)]
                    out = registry.log_predictions(settings, res["model_version_id"], payload["version"], preds)
                    log(f"[train] shadow predictions logged: {out.get('inserted', 0)} "
                        f"({'calibrated' if calibrator.is_fitted else 'raw'} probabilities)")


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
