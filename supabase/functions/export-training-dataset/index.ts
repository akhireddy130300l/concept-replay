// Streams the joined ml_training_dataset_v2 view as CSV or NDJSON.
// Query: ?from_date&to_date&format=csv|json&dataset_version=dataset_v1&split=train|val|test|all&limit=100000
// Header: x-diag-key: <DIAG_KEY>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diag-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const DIAG_KEY = Deno.env.get("DIAG_KEY") ?? "";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.headers.get("x-diag-key") !== DIAG_KEY || !DIAG_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get("from_date");
  const to = url.searchParams.get("to_date");
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const dsv = url.searchParams.get("dataset_version") ?? "dataset_v1";
  const split = url.searchParams.get("split") ?? "all";
  const limit = Math.min(200000, Number(url.searchParams.get("limit") ?? 100000));

  let q = admin.from("ml_training_dataset_v2").select("*").eq("dataset_version", dsv).limit(limit);
  if (from) q = q.gte("checked_date_et", from);
  if (to) q = q.lte("checked_date_et", to);
  if (split !== "all") q = q.eq("split_bucket", split);
  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  const rows = data ?? [];
  console.log(`[ml-export] rows=${rows.length} format=${format} dataset_version=${dsv} split=${split}`);

  const commonHeaders = {
    ...CORS,
    "x-row-count": String(rows.length),
    "x-feature-version": "v1",
    "x-dataset-version": dsv,
  };

  if (format === "csv") {
    if (rows.length === 0) return new Response("", { headers: { ...commonHeaders, "content-type": "text/csv" } });
    const cols = Object.keys(rows[0]);
    const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell((r as any)[c])).join(","))];
    return new Response(lines.join("\n"), { headers: { ...commonHeaders, "content-type": "text/csv", "content-disposition": `attachment; filename="swing_training_${dsv}.csv"` } });
  }
  // NDJSON for streamability.
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  return new Response(body, { headers: { ...commonHeaders, "content-type": "application/x-ndjson" } });
});
