// Owner-only wrapper that lets the /ml-training UI start/monitor/cancel
// historical-swing-trainer runs without exposing DIAG_KEY to the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DIAG_KEY = Deno.env.get("DIAG_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const STALE_RUNNING_MINUTES = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

async function requireOwner(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, res: json({ error: "unauthorized" }, 401) };
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return { ok: false, res: json({ error: "unauthorized" }, 401) };
  const { data: access } = await admin.from("portfolio_feature_access").select("enabled").eq("user_id", u.user.id).maybeSingle();
  if (!access?.enabled) return { ok: false, res: json({ error: "forbidden" }, 403) };
  return { ok: true, userId: u.user.id };
}

async function markStaleRunsFailed() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000).toISOString();
  await admin
    .from("historical_training_runs")
    .update({
      status: "failed",
      last_error: `stale_worker_no_heartbeat_over_${STALE_RUNNING_MINUTES}_minutes`,
      completed_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  const auth = await requireOwner(req);
  if (!auth.ok) return auth.res;
  await markStaleRunsFailed();

  if (action === "status") {
    const { data: runs } = await admin
      .from("historical_replay_run_summary_v1")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    const { data: committed } = await admin.from("ml_training_committed_summary_v1").select("*").maybeSingle();
    const { data: recentDayLogs } = await admin
      .from("historical_replay_day_logs")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(20);
    return json({ runs: runs ?? [], committed_summary: committed ?? null, recent_day_logs: recentDayLogs ?? [] });
  }

  if (action === "start" && req.method === "POST") {
    if (!DIAG_KEY) return json({ error: "DIAG_KEY not configured" }, 500);
    const body = await req.json().catch(() => ({}));
    const start_date = body.start_date;
    const end_date = body.end_date ?? new Date().toISOString().slice(0, 10);
    const batch_size = Number(body.batch_size ?? 1);
    const resume = body.resume ?? true;
    const top_n = Number(body.top_n ?? 60);
    if (!start_date) return json({ error: "start_date required" }, 400);

    // Prevent duplicate concurrent runs.
    const { data: active } = await admin
      .from("historical_training_runs")
      .select("id")
      .eq("status", "running")
      .limit(1);
    if (active && active.length > 0 && !body.force) {
      return json({ error: "a run is already in progress", run_id: active[0].id }, 409);
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/historical-swing-trainer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-diag-key": DIAG_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ start_date, end_date, batch_size, resume, top_n }),
    });
    const text = await resp.text();
    let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return json({ ok: resp.ok, status: resp.status, ...data }, resp.ok ? 200 : 500);
  }

  if (action === "cancel" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (!body.run_id) return json({ error: "run_id required" }, 400);
    await admin
      .from("historical_training_runs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", body.run_id)
      .eq("status", "running");
    return json({ ok: true });
  }

  // ---------------- ML model registry (read + lifecycle) ----------------

  if (action === "models") {
    const { data: versions } = await admin
      .from("model_versions")
      .select("id, version, algorithm, status, label_horizon, dataset_version, feature_version, metrics, baseline_comparison, feature_importance, hyperparameters, feature_order, preprocessing, notes, training_job_id, promoted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    const { data: jobs } = await admin
      .from("ml_training_jobs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    const { data: promotions } = await admin
      .from("ml_model_promotions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    const { count: shadowPredictions } = await admin
      .from("prediction_history")
      .select("id", { count: "exact", head: true });
    return json({
      versions: versions ?? [],
      jobs: jobs ?? [],
      promotions: promotions ?? [],
      shadow_prediction_count: shadowPredictions ?? 0,
    });
  }

  // Lifecycle: candidate -> shadow -> production (production requires explicit confirm).
  if (action === "promote" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = body.model_version_id;
    const to = body.to_status;
    const ALLOWED = ["candidate", "shadow", "production", "archived", "rejected"];
    if (!id || !ALLOWED.includes(to)) return json({ error: "model_version_id and valid to_status required" }, 400);

    const { data: current } = await admin.from("model_versions").select("id, status").eq("id", id).maybeSingle();
    if (!current) return json({ error: "model version not found" }, 404);

    if (to === "shadow" && current.status !== "candidate") {
      return json({ error: "only a candidate model can move to shadow" }, 400);
    }
    if (to === "production") {
      if (current.status !== "shadow") return json({ error: "only a shadow model can move to production" }, 400);
      if (body.confirm_production !== true) return json({ error: "production promotion requires confirm_production: true" }, 400);
      // demote any existing production model
      await admin.from("model_versions").update({ status: "archived" }).eq("status", "production");
    }

    const { error } = await admin
      .from("model_versions")
      .update({ status: to, promoted_at: new Date().toISOString(), promoted_by: auth.userId })
      .eq("id", id);
    if (error) return json({ error: error.message }, 500);

    await admin.from("ml_model_promotions").insert({
      model_version_id: id,
      from_status: current.status,
      to_status: to,
      actor_user_id: auth.userId,
      reason: body.reason ?? "manual action from /ml-training",
    });
    console.log(`[ml-control] model ${id} ${current.status} -> ${to} by ${auth.userId}`);
    return json({ ok: true, status: to });
  }

  // Rollback: archive the target and restore the most recent previously-promoted model.
  if (action === "rollback" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = body.model_version_id;
    if (!id) return json({ error: "model_version_id required" }, 400);
    const { data: current } = await admin.from("model_versions").select("id, status").eq("id", id).maybeSingle();
    if (!current) return json({ error: "model version not found" }, 404);
    await admin.from("model_versions").update({ status: "archived" }).eq("id", id);
    await admin.from("ml_model_promotions").insert({
      model_version_id: id,
      from_status: current.status,
      to_status: "archived",
      actor_user_id: auth.userId,
      reason: body.reason ?? "rollback from /ml-training",
    });
    console.log(`[ml-control] rollback ${id} from ${current.status}`);
    return json({ ok: true, status: "archived" });
  }

  // Optional: kick the GitHub Actions training workflow (needs GITHUB_DISPATCH_TOKEN).
  if (action === "trigger_training" && req.method === "POST") {
    const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
    const repo = Deno.env.get("GITHUB_REPOSITORY") ?? "akhireddy130300/concept-replay";
    if (!token) {
      return json({
        error: "GITHUB_DISPATCH_TOKEN not configured",
        hint: "Add a GitHub fine-grained PAT with Actions: write as the GITHUB_DISPATCH_TOKEN backend secret, or run the workflow from the GitHub Actions tab.",
      }, 400);
    }
    const resp = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ml-train.yml/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { trigger_source: "ml_training_dashboard" } }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[ml-control] workflow dispatch failed [${resp.status}]: ${text}`);
      return json({ error: "workflow dispatch failed", status: resp.status, details: text }, resp.status);
    }
    return json({ ok: true, dispatched: true });
  }

  return json({ error: "unknown action" }, 400);
});
