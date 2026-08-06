// Streams the canonical training dataset as CSV or NDJSON.
// Query: ?dataset=v3|v2&from_date&to_date&format=csv|json&only_matured=true&limit=200000&offset=0
// Auth:  x-ml-key: <ML_TRAINING_KEY>   (narrow, training-only)
//        x-diag-key: <DIAG_KEY>        (legacy owner diagnostics)
// This function is the ONLY way CI reaches training data — the service-role key
// never leaves the backend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diag-key, x-ml-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const DIAG_KEY = Deno.env.get("DIAG_KEY") ?? "";
const ML_TRAINING_KEY = Deno.env.get("ML_TRAINING_KEY") ?? "";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function authorized(req: Request): boolean {
  const mlKey = req.headers.get("x-ml-key");
  if (ML_TRAINING_KEY && mlKey === ML_TRAINING_KEY) return true;
  const diag = req.headers.get("x-diag-key");
  if (DIAG_KEY && diag === DIAG_KEY) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  }
  const url = new URL(req.url);
  const dataset = (url.searchParams.get("dataset") ?? "v3").toLowerCase();
  const view = dataset === "v2" ? "ml_training_dataset_v2" : "ml_training_dataset_v3";
  const dateCol = view === "ml_training_dataset_v3" ? "decision_date" : "checked_date_et";
  const from = url.searchParams.get("from_date");
  const to = url.searchParams.get("to_date");
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const dsv = url.searchParams.get("dataset_version");
  const onlyMatured = (url.searchParams.get("only_matured") ?? "").toLowerCase() === "true";
  const unmaturedOnly = (url.searchParams.get("unmatured_only") ?? "").toLowerCase() === "true";
  const limit = Math.min(200000, Number(url.searchParams.get("limit") ?? 100000));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  let q = admin.from(view).select("*").order(dateCol, { ascending: true }).range(offset, offset + limit - 1);
  if (dsv) q = q.eq("dataset_version", dsv);
  if (from) q = q.gte(dateCol, from);
  if (to) q = q.lte(dateCol, to);
  if (view === "ml_training_dataset_v3") {
    if (onlyMatured) q = q.eq("label_matured", true);
    if (unmaturedOnly) q = q.eq("label_matured", false);
  }
  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  const rows = data ?? [];
  console.log(`[ml-export] view=${view} rows=${rows.length} format=${format} offset=${offset} matured_only=${onlyMatured}`);

  const commonHeaders = {
    ...CORS,
    "x-row-count": String(rows.length),
    "x-dataset-view": view,
    "x-feature-version": "v1",
  };

  if (format === "csv") {
    if (rows.length === 0) return new Response("", { headers: { ...commonHeaders, "content-type": "text/csv" } });
    const cols = Object.keys(rows[0]);
    const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell((r as any)[c])).join(","))];
    return new Response(lines.join("\n"), { headers: { ...commonHeaders, "content-type": "text/csv", "content-disposition": `attachment; filename="swing_training_${view}.csv"` } });
  }
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  return new Response(body, { headers: { ...commonHeaders, "content-type": "application/x-ndjson" } });
});
