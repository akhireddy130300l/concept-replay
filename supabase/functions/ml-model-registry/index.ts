// Immutable model registry write API used by the automated training workflow.
// Authenticated with ML_TRAINING_KEY (x-ml-key) — the service-role key never
// leaves the backend. Every model lands as `candidate`; promotion happens only
// through ml-training-control with an explicit human action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ml-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ML_TRAINING_KEY = Deno.env.get("ML_TRAINING_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!ML_TRAINING_KEY) return json({ error: "ML_TRAINING_KEY not configured" }, 500);
  if (req.headers.get("x-ml-key") !== ML_TRAINING_KEY) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const body = req.method === "POST" ? await req.json().catch(() => ({} as any)) : {};

  try {
    if (action === "start_job") {
      const { data, error } = await admin
        .from("ml_training_jobs")
        .insert({
          status: "running",
          trigger_source: body.trigger_source ?? "github_actions",
          dataset_version: body.dataset_version ?? "dataset_v1",
          label_horizon: body.label_horizon ?? "10_session",
          github_run_url: body.github_run_url ?? null,
          purge_days: body.purge_days ?? null,
          embargo_days: body.embargo_days ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      console.log(`[ml-registry] job started ${data.id}`);
      return json({ job_id: data.id });
    }

    if (action === "complete_job") {
      if (!body.job_id) return json({ error: "job_id required" }, 400);
      const patch: Record<string, unknown> = {
        status: body.status ?? "completed",
        finished_at: new Date().toISOString(),
      };
      for (const k of [
        "train_start", "train_end", "val_start", "val_end", "test_start", "test_end",
        "purge_days", "embargo_days", "total_rows", "matured_rows", "train_rows",
        "val_rows", "test_rows", "positive_rate", "best_model", "logs",
        "error_message", "github_run_url",
      ]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      const { error } = await admin.from("ml_training_jobs").update(patch).eq("id", body.job_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "register_model") {
      const name: string = body.name ?? "swing_10session";
      const algorithm: string = body.algorithm ?? "unknown";
      // one logical model per (name, algorithm); versions are immutable rows below
      let modelId: string | null = null;
      const { data: existing } = await admin
        .from("trained_models").select("id").eq("name", name).eq("algorithm", algorithm).maybeSingle();
      if (existing) modelId = existing.id;
      else {
        const { data: created, error: cErr } = await admin.from("trained_models").insert({
          name, algorithm,
          dataset_version: body.dataset_version ?? null,
          feature_version: body.feature_version ?? null,
          trained_at: new Date().toISOString(),
        }).select("id").single();
        if (cErr) throw cErr;
        modelId = created.id;
      }

      const { data: version, error: vErr } = await admin.from("model_versions").insert({
        model_id: modelId,
        version: body.version ?? new Date().toISOString(),
        algorithm,
        status: "candidate",
        training_job_id: body.job_id ?? null,
        label_horizon: body.label_horizon ?? "10_session",
        dataset_version: body.dataset_version ?? null,
        feature_version: body.feature_version ?? null,
        hyperparameters: body.hyperparameters ?? null,
        feature_order: body.feature_order ?? null,
        preprocessing: body.preprocessing ?? null,
        artifact: body.artifact ?? null,
        metrics: body.metrics ?? null,
        baseline_comparison: body.baseline_comparison ?? null,
        feature_importance: body.feature_importance ?? null,
        train_window: body.train_window ?? null,
        test_window: body.test_window ?? null,
        notes: body.notes ?? null,
      }).select("id").single();
      if (vErr) throw vErr;

      const metricRows: any[] = [];
      for (const split of ["train", "val", "test"]) {
        const m = body.metrics?.[split];
        if (!m) continue;
        for (const [k, v] of Object.entries(m)) {
          if (typeof v === "number" && Number.isFinite(v)) {
            metricRows.push({ model_version_id: version.id, split, metric_name: k, metric_value: v });
          }
        }
      }
      if (metricRows.length) await admin.from("model_metrics").insert(metricRows);

      await admin.from("ml_model_promotions").insert({
        model_version_id: version.id, from_status: null, to_status: "candidate",
        reason: "registered by automated training run",
      });

      console.log(`[ml-registry] candidate model ${algorithm} registered as ${version.id}`);
      return json({ model_version_id: version.id, model_id: modelId, status: "candidate" });
    }

    if (action === "log_predictions") {
      const preds: any[] = Array.isArray(body.predictions) ? body.predictions : [];
      if (!body.model_version_id) return json({ error: "model_version_id required" }, 400);
      if (!preds.length) return json({ inserted: 0 });
      const rows = preds.slice(0, 5000).map((p) => ({
        model_version_id: body.model_version_id,
        model_version: body.model_version ?? null,
        mode: "shadow",
        ticker: p.ticker,
        prediction_date: p.prediction_date,
        predicted_at: new Date().toISOString(),
        probability: p.probability,
        predicted_probability: p.probability,
        predicted_label: p.predicted_label,
        confidence_score: p.confidence_score ?? null,
        training_example_id: p.training_example_id ?? null,
        features_snapshot: p.features_snapshot ?? null,
        created_by_pipeline: "github_actions_shadow_v1",
      }));
      const { error } = await admin.from("prediction_history").insert(rows);
      if (error) throw error;
      console.log(`[ml-registry] shadow predictions logged: ${rows.length}`);
      return json({ inserted: rows.length });
    }

    if (action === "previous_model") {
      const { data } = await admin
        .from("model_versions")
        .select("id, version, algorithm, status, metrics, created_at")
        .in("status", ["shadow", "production"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ previous_model: data ?? null });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ml-registry] ${action} failed: ${msg}`);
    return json({ error: msg }, 500);
  }
});
