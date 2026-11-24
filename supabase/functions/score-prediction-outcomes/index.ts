import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchYahooChartWithRetry, type YahooChart } from "../_shared/yahoo-chart.ts";
import {
  computeHorizonOutcome,
  DEFAULT_HORIZON_SESSIONS,
} from "../_shared/prediction-outcomes.ts";

const LOCK_NAME = "score-prediction-outcomes";
const LOCK_SECONDS = 300;
const CHART_CONCURRENCY = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "missing_server_config" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Cron-secret authentication (supports both vault get_cron_secret and managed LOVABLE_CRON_SECRET)
  const { data: vaultSecret } = await admin.rpc("get_cron_secret");
  const managedSecret = Deno.env.get("LOVABLE_CRON_SECRET") ?? "";
  const validSecrets = [vaultSecret, managedSecret].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const headerSecret =
    req.headers.get("x-cron-secret") ??
    req.headers.get("x-lovable-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (validSecrets.length === 0 || !validSecrets.includes(headerSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  let limit = 250;
  let horizon = DEFAULT_HORIZON_SESSIONS;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number" && body.limit >= 1 && body.limit <= 1000) {
        limit = Math.floor(body.limit);
      }
      if (typeof body?.horizon === "number" && body.horizon >= 1 && body.horizon <= 60) {
        horizon = Math.floor(body.horizon);
      }
    }
  } catch {
    // use defaults
  }

  const { data: lockAcquired, error: lockErr } = await admin.rpc("try_acquire_run_lock", {
    _name: LOCK_NAME,
    _seconds: LOCK_SECONDS,
  });
  if (lockErr || !lockAcquired) {
    return json({ ok: true, skipped: "lock_held" }, 200);
  }

  try {
    const { data: rows, error: qErr } = await admin
      .from("prediction_history")
      .select("id, ticker, prediction_date, training_example_id")
      .is("actual_label", null)
      .not("ticker", "is", null)
      .not("prediction_date", "is", null)
      .order("prediction_date", { ascending: true })
      .limit(limit);

    if (qErr) throw qErr;
    const pendingRows = rows ?? [];
    if (pendingRows.length === 0) {
      return json({
        ok: true,
        scanned: 0,
        matured: 0,
        updated: 0,
        pending: 0,
        failed: 0,
        tickers_fetched: 0,
      });
    }

    const uniqueTickers = Array.from(
      new Set(pendingRows.map((r) => String(r.ticker).toUpperCase())),
    );
    const charts = new Map<string, YahooChart>();

    for (let i = 0; i < uniqueTickers.length; i += CHART_CONCURRENCY) {
      const batch = uniqueTickers.slice(i, i + CHART_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (ticker) => ({
          ticker,
          res: await fetchYahooChartWithRetry(ticker, 1, "1y"),
        })),
      );
      for (const { ticker, res } of results) {
        if (res.ok === true) charts.set(ticker, res.chart);
      }
    }

    let matured = 0;
    let updated = 0;
    let pending = 0;
    let failed = 0;
    const nowIso = new Date().toISOString();

    for (const row of pendingRows) {
      const ticker = String(row.ticker).toUpperCase();
      const chart = charts.get(ticker);
      if (!chart) {
        failed++;
        continue;
      }

      const outcome = computeHorizonOutcome({
        predictionDate: String(row.prediction_date),
        horizonSessions: horizon,
        timestamps: chart.timestamps,
        closes: chart.closes,
        highs: chart.highs,
        lows: chart.lows,
      });

      if (!outcome.matured) {
        if (outcome.reason === "pending_horizon") pending++;
        else failed++;
        continue;
      }

      matured++;
      const { error: updErr } = await admin
        .from("prediction_history")
        .update({
          actual_return: outcome.actualReturnPct,
          actual_label: outcome.actualLabel,
          actual_label_at: nowIso,
        })
        .eq("id", row.id);

      if (updErr) {
        failed++;
        continue;
      }
      updated++;

      if (row.training_example_id && horizon === DEFAULT_HORIZON_SESSIONS) {
        await admin
          .from("swing_training_outcomes")
          .update({
            outcome_checked_at: nowIso,
            sessions_elapsed: outcome.sessionsElapsed,
            price_at_check: outcome.entryPrice,
            current_price: outcome.exitPrice,
            return_pct_current: outcome.actualReturnPct,
            max_gain_pct: outcome.maxGainPct,
            max_drawdown_pct: outcome.maxDrawdownPct,
            outcome_10_session: outcome.actualReturnPct,
            label_10_session: outcome.actualLabel,
            final_label: outcome.actualLabel,
          })
          .eq("training_example_id", row.training_example_id)
          .is("outcome_10_session", null);
      }
    }

    console.log(
      `[score-prediction-outcomes] scanned=${pendingRows.length} matured=${matured} updated=${updated} pending=${pending} failed=${failed} tickers=${charts.size}/${uniqueTickers.length}`,
    );
    return json({
      ok: true,
      scanned: pendingRows.length,
      matured,
      updated,
      pending,
      failed,
      tickers_fetched: charts.size,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error(`[score-prediction-outcomes] error=${msg}`);
    return json({ error: msg }, 500);
  } finally {
    await admin.rpc("release_run_lock", { _name: LOCK_NAME });
  }
});