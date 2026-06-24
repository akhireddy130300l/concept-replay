// submit-portfolio-research
// JWT-required. Validates payload, enforces limits, snapshots holdings,
// creates a pending request, dispatches async processing, returns 202.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { dispatchProcessRequest } from "../_shared/dispatch.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const COOLDOWN_SECONDS = 120;
const DAILY_REQUEST_CAP = 10;
const MAX_HOLDINGS = 5;

const HoldingSchema = z.object({
  ticker: z.string().trim().transform((s) => s.toUpperCase()).refine((s) => TICKER_RE.test(s), "invalid_ticker"),
  shares: z.number().positive().finite(),
  average_cost: z.number().positive().finite().nullable(),
  purchase_date: z.string().nullable().optional(),
}).strict();

const PayloadSchema = z.object({
  holdings: z.array(HoldingSchema).min(1).max(MAX_HOLDINGS),
  cash_balance: z.number().nonnegative().finite().nullable().optional(),
  account_total_declared: z.boolean().optional(),
  trigger_type: z.enum(["web_form", "email_link_then_confirm"]).optional(),
  save_holdings: z.boolean().optional(),
}).strict();

function bad(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return bad(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const DISPATCH_SECRET = Deno.env.get("INTERNAL_DISPATCH_SECRET");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY || !DISPATCH_SECRET) {
    return bad(500, { error: "server_misconfigured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return bad(401, { error: "missing_authorization" });
  }

  // Identify user via JWT (verify_jwt=true at platform level also gates this).
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return bad(401, { error: "invalid_token" });
  const userId = userData.user.id;

  // Parse + reject identity/recipient-like fields.
  let raw: any;
  try { raw = await req.json(); } catch { return bad(400, { error: "invalid_json" }); }
  for (const forbidden of ["user_id", "email", "recipient", "to", "user", "userId"]) {
    if (raw && typeof raw === "object" && forbidden in raw) {
      return bad(400, { error: "forbidden_field", field: forbidden });
    }
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return bad(400, { error: "validation_failed", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path, message: i.message })) });
  }
  const payload = parsed.data;

  // Dedupe holdings by ticker (uppercase already enforced by schema transform).
  const seen = new Set<string>();
  for (const h of payload.holdings) {
    if (seen.has(h.ticker)) return bad(400, { error: "duplicate_ticker", ticker: h.ticker });
    seen.add(h.ticker);
  }

  // Service-role client for limit checks + writes (RLS would block authenticated writes).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Cooldown: any request created in the last 120 seconds (any status).
  const cooldownIso = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
  const cooldownQuery = await admin
    .from("portfolio_research_requests")
    .select("id, created_at")
    .eq("user_id", userId)
    .gte("created_at", cooldownIso)
    .limit(1);
  if (cooldownQuery.error) return bad(500, { error: "cooldown_check_failed" });
  if ((cooldownQuery.data ?? []).length > 0) {
    return bad(429, { error: "cooldown_active", retry_after_seconds: COOLDOWN_SECONDS });
  }

  // Daily cap: count accepted requests today in user's local timezone.
  const prefs = await admin.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle();
  const tz = prefs.data?.timezone && typeof prefs.data.timezone === "string" ? prefs.data.timezone : "UTC";
  const { startIso, endIso } = localDayBounds(tz, new Date());
  const dailyQuery = await admin
    .from("portfolio_research_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .in("status", ["pending", "running", "completed", "failed"]);
  if (dailyQuery.error) return bad(500, { error: "daily_cap_check_failed" });
  if ((dailyQuery.count ?? 0) >= DAILY_REQUEST_CAP) {
    return bad(429, { error: "daily_cap_reached", cap: DAILY_REQUEST_CAP });
  }

  // Stale-request recovery: pending >5min or running >10min are marked failed.
  // If active request is newer than those limits, return 409.
  const activeQuery = await admin
    .from("portfolio_research_requests")
    .select("id, status, created_at, started_at")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (activeQuery.error) return bad(500, { error: "active_check_failed" });
  const active = (activeQuery.data ?? [])[0];
  if (active) {
    const nowMs = Date.now();
    const createdMs = new Date(active.created_at as string).getTime();
    const startedMs = active.started_at ? new Date(active.started_at as string).getTime() : createdMs;
    const pendingAgeMs = nowMs - createdMs;
    const runningAgeMs = nowMs - startedMs;
    const isStale =
      (active.status === "pending" && pendingAgeMs > 5 * 60 * 1000) ||
      (active.status === "running" && runningAgeMs > 10 * 60 * 1000);
    if (isStale) {
      await admin.from("portfolio_research_requests").update({
        status: "failed",
        error_summary: "stale_request_recovered",
        completed_at: new Date().toISOString(),
      }).eq("id", active.id);
    } else {
      return bad(409, { error: "active_request_already_exists" });
    }
  }

  // Cash + concentration basis.
  const cashBalance = payload.cash_balance ?? null;
  const declaredAccountTotal = Boolean(payload.account_total_declared && cashBalance !== null);
  const concentrationBasis: "account_total" | "submitted_only" = declaredAccountTotal ? "account_total" : "submitted_only";

  // Insert request. Partial unique index on (user_id) WHERE status IN ('pending','running')
  // blocks duplicate active requests at the DB level.
  const insertReq = await admin
    .from("portfolio_research_requests")
    .insert({
      user_id: userId,
      status: "pending",
      attempts: 0,
      trigger_type: payload.trigger_type ?? "web_form",
      holdings_count: payload.holdings.length,
      cash_balance: cashBalance,
      concentration_basis: concentrationBasis,
    })
    .select("id")
    .single();
  if (insertReq.error) {
    const code = (insertReq.error as any).code;
    if (code === "23505") return bad(409, { error: "active_request_already_exists" });
    return bad(500, { error: "request_create_failed" });
  }
  const requestId = insertReq.data.id as string;

  // Snapshot items (frozen).
  const itemRows = payload.holdings.map((h) => ({
    request_id: requestId,
    user_id: userId,
    ticker: h.ticker,
    shares: h.shares,
    average_cost: h.average_cost,
    purchase_date: h.purchase_date ?? null,
  }));
  const itemsInsert = await admin.from("portfolio_research_request_items").insert(itemRows);
  if (itemsInsert.error) {
    await admin.from("portfolio_research_requests")
      .update({ status: "failed", error_summary: "snapshot_items_failed", completed_at: new Date().toISOString() })
      .eq("id", requestId);
    return bad(500, { error: "items_snapshot_failed" });
  }

  // Optionally persist saved holdings (only when user opts in AND not flagged as one-time).
  if (payload.save_holdings === true) {
    for (const h of payload.holdings) {
      await admin.from("portfolio_positions").upsert(
        { user_id: userId, ticker: h.ticker, shares: h.shares, average_cost: h.average_cost, purchase_date: h.purchase_date ?? null, deleted_at: null },
        { onConflict: "user_id,ticker" },
      );
    }
  }

  // Fire-and-forget dispatch; do not await processing.
  // Note: we use waitUntil-equivalent by not awaiting; runtime keeps it alive for the
  // duration of this request's response cycle. A future Phase will add a sweeper.
  dispatchProcessRequest(SUPABASE_URL, DISPATCH_SECRET, requestId).catch(() => { /* swallow */ });

  return new Response(JSON.stringify({ request_id: requestId, status: "pending" }), {
    status: 202,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

// Compute [start, end) ISO bounds for the user's local calendar day.
function localDayBounds(timeZone: string, now: Date): { startIso: string; endIso: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    const y = parts.year, m = parts.month, d = parts.day;
    // Midnight in the target tz, expressed as a Date at UTC by reversing the offset.
    const localMidnightUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
    // Find tz offset at that moment: format the same instant in tz and compare.
    const tzNow = new Date(now.getTime());
    const offsetMs = tzOffsetMs(tzNow, timeZone);
    const start = new Date(localMidnightUtc.getTime() - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  } catch {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
}
