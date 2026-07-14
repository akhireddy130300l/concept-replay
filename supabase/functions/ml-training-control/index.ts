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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  const auth = await requireOwner(req);
  if (!auth.ok) return auth.res;

  if (action === "status") {
    const { data: runs } = await admin
      .from("historical_training_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    return json({ runs: runs ?? [] });
  }

  if (action === "start" && req.method === "POST") {
    if (!DIAG_KEY) return json({ error: "DIAG_KEY not configured" }, 500);
    const body = await req.json().catch(() => ({}));
    const start_date = body.start_date;
    const end_date = body.end_date ?? new Date().toISOString().slice(0, 10);
    const batch_size = Number(body.batch_size ?? 10);
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

  return json({ error: "unknown action" }, 400);
});
