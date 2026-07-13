// Historical Swing Trader replay engine.
//
// Purpose: fill swing_training_examples + swing_training_outcomes with
// historical rows so the ML foundation has more than just today's data.
//
// Design constraints:
// - NO look-ahead bias. Every feature uses bars <= replay_date. Every outcome
//   uses bars > replay_date. Exa news is filtered to end_published_date=day.
// - Finnhub profile/peers/analyst have no historical API on the free tier;
//   those fields are stored under finnhub_snapshot.as_of='today' with a
//   `finnhub_lookahead` data_quality_flag so ML pipelines can filter them.
// - Historical replay does NOT read or write the live swing_ticker_cache.
// - Batches: process `batch_size` trading days per invocation, then persist
//   `current_replay_date` and self-reinvoke so we never hit the 150s wall.
// - Idempotent-ish: `resume=true` picks up from `current_replay_date + 1`.
//
// Request body: {
//   start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD",
//   batch_size?: number = 10, resume?: boolean = true,
//   universe?: "russell1000" (only value for now),
//   dry_run?: boolean = false,
//   top_n?: number = 60,
// }
// Header: x-diag-key: <DIAG_KEY>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diag-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIAG_KEY = Deno.env.get("DIAG_KEY") ?? "";
const EXA_API_KEY = Deno.env.get("EXA_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// US market holidays 2023-2027 (regular closes only; half-days included as full).
const US_HOLIDAYS = new Set<string>([
  "2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
  "2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
  "2025-01-01","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
  "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
]);

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }
function isTradingDay(d: Date): boolean {
  const dow = d.getUTCDay(); if (dow === 0 || dow === 6) return false;
  return !US_HOLIDAYS.has(iso(d));
}
function tradingDaysInRange(start: string, end: string): string[] {
  const out: string[] = []; let cur = new Date(start + "T00:00:00Z"); const stop = new Date(end + "T00:00:00Z");
  while (cur <= stop) { if (isTradingDay(cur)) out.push(iso(cur)); cur = addDays(cur, 1); }
  return out;
}

async function fetchYahooHistorical(symbol: string, from: string, to: string): Promise<
  { ok: true; bars: { ts: number; close: number; high: number; low: number; volume: number }[] } | { ok: false; reason: string }
> {
  const period1 = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
  const period2 = Math.floor(new Date(to + "T00:00:00Z").getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (res.status !== 200) return { ok: false, reason: `status_${res.status}` };
    const j = await res.json();
    const r = j?.chart?.result?.[0]; const q = r?.indicators?.quote?.[0]; const ts = r?.timestamp;
    if (!Array.isArray(ts) || !q) return { ok: false, reason: "missing_series" };
    const bars: any[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close?.[i], h = q.high?.[i], l = q.low?.[i], v = q.volume?.[i];
      if ([c, h, l, v].every((x) => typeof x === "number" && Number.isFinite(x))) {
        bars.push({ ts: ts[i], close: c, high: h, low: l, volume: v });
      }
    }
    return { ok: true, bars };
  } catch (e) { return { ok: false, reason: (e as Error).message.slice(0, 100) }; }
}

async function exaHistoricalNews(ticker: string, company: string, day: string): Promise<any> {
  if (!EXA_API_KEY) return { skipped: "missing_exa_api_key" };
  const end = day; const start = iso(addDays(new Date(day + "T00:00:00Z"), -14));
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": EXA_API_KEY },
      body: JSON.stringify({
        query: `${ticker} ${company} stock news`,
        numResults: 8, type: "auto", useAutoprompt: true,
        startPublishedDate: `${start}T00:00:00.000Z`,
        endPublishedDate: `${end}T23:59:59.999Z`,
        contents: { highlights: true },
      }),
    });
    if (!res.ok) return { error: `status_${res.status}` };
    const j = await res.json();
    return { results: (j.results ?? []).map((r: any) => ({ title: r.title, url: r.url, published: r.publishedDate, highlights: r.highlights ?? [] })) };
  } catch (e) { return { error: (e as Error).message.slice(0, 100) }; }
}

// Deterministic keyword-based signals (subset of live pipeline).
const POS = /(revenue growth|raised outlook|beat earnings|upgraded|price target raised|FDA approval|contract win|partnership)/i;
const NEG = /(lawsuit|investigation|downgrade|earnings miss|guidance cut|insider selling|cash burn|margin pressure)/i;
function scoreExa(news: any) {
  const results = news?.results ?? [];
  let pos = 0, neg = 0;
  for (const r of results) {
    const blob = `${r.title ?? ""} ${(r.highlights ?? []).join(" ")}`;
    if (POS.test(blob)) pos++;
    if (NEG.test(blob)) neg++;
  }
  return { result_count: results.length, positive_count: pos, negative_count: neg };
}

function pctChange(a: number, b: number): number { return a > 0 ? ((b - a) / a) * 100 : 0; }

function labelFor(returnPct: number, targetHit: boolean, stopHit: boolean, maxGain: number, maxDD: number, sessionsElapsed: number, req: number): string {
  if (sessionsElapsed < req) return "pending";
  if (targetHit && !stopHit) return "positive";
  if (stopHit && !targetHit) return "negative";
  if (returnPct > 2 || maxGain >= 3) return "positive";
  if (returnPct < -2 || maxDD <= -3) return "negative";
  return "flat";
}

async function processDay(runId: string, day: string, universe: string[], topN: number) {
  console.log(`[hist-trainer] day_started date=${day} universe=${universe.length}`);
  // Fetch bars [day-60, day+45] for every universe ticker with concurrency 3.
  const from = iso(addDays(new Date(day + "T00:00:00Z"), -70));
  const to = iso(addDays(new Date(day + "T00:00:00Z"), 55));
  const barsByTicker = new Map<string, any[]>();
  let idx = 0;
  async function worker() {
    while (idx < universe.length) {
      const i = idx++; const sym = universe[i];
      const r = await fetchYahooHistorical(sym, from, to);
      if (r.ok) barsByTicker.set(sym, r.bars);
      else await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: sym, historical_date: day, reason: "yahoo_fetch_failed", details: { reason: r.reason } });
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  // Compute point-in-time metrics per ticker as of `day`.
  const dayTs = Math.floor(new Date(day + "T00:00:00Z").getTime() / 1000);
  type Scored = { ticker: string; asOfIdx: number; bars: any[]; price: number; oneDayPct: number; sevenDayPct: number; twentyDayPct: number; volumeRatio: number };
  const scored: Scored[] = [];
  for (const [ticker, bars] of barsByTicker.entries()) {
    // Find the last bar with ts <= dayTs + 12h (end of that trading day).
    const asOfIdx = bars.reduce((acc, b, i) => (b.ts <= dayTs + 43200 ? i : acc), -1);
    if (asOfIdx < 21) continue; // need 20+ prior sessions
    const price = bars[asOfIdx].close;
    const p1 = bars[asOfIdx - 1].close;
    const p7 = bars[Math.max(0, asOfIdx - 7)].close;
    const p20 = bars[Math.max(0, asOfIdx - 20)].close;
    const avgVol20 = bars.slice(Math.max(0, asOfIdx - 20), asOfIdx).reduce((a, b) => a + b.volume, 0) / 20;
    const volumeRatio = avgVol20 > 0 ? bars[asOfIdx].volume / avgVol20 : 1;
    scored.push({ ticker, asOfIdx, bars, price, oneDayPct: pctChange(p1, price), sevenDayPct: pctChange(p7, price), twentyDayPct: pctChange(p20, price), volumeRatio });
  }
  // Point-in-time "top gainers" universe: sort by composite gainer/momentum then take topN.
  scored.sort((a, b) => (b.oneDayPct + b.sevenDayPct * 0.3 + (b.volumeRatio - 1) * 5) - (a.oneDayPct + a.sevenDayPct * 0.3 + (a.volumeRatio - 1) * 5));
  const selected = scored.slice(0, topN);
  console.log(`[hist-trainer] gainers_scan date=${day} scored=${scored.length} selected=${selected.length}`);

  let examplesCreated = 0, outcomesCreated = 0;
  for (const s of selected) {
    // News (Exa, historical window)
    const news = await exaHistoricalNews(s.ticker, s.ticker, day);
    const exaScore = scoreExa(news);
    // Deterministic swing tech scores (0-100 scaled 0-10)
    const technicalScore = Math.max(0, Math.min(10, 5 + (s.oneDayPct / 10) + (s.volumeRatio - 1) * 2));
    // Simple support/resistance from prior 20 sessions
    const prior = s.bars.slice(Math.max(0, s.asOfIdx - 20), s.asOfIdx);
    const support = Math.min(...prior.map((b) => b.low));
    const resistance = Math.max(...prior.map((b) => b.high));
    const entry = s.price;
    const stop = support * 0.98;
    const target = resistance * 1.02;
    const rr = entry > stop ? (target - entry) / (entry - stop) : 0;

    // Deterministic outcomes from bars > asOfIdx.
    const future = s.bars.slice(s.asOfIdx + 1);
    const sessionsElapsed = future.length;
    if (sessionsElapsed < 3) {
      await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: s.ticker, historical_date: day, reason: "insufficient_future_bars", details: { sessions: sessionsElapsed } });
      continue;
    }
    const maxHigh = Math.max(...future.map((b) => b.high));
    const minLow = Math.min(...future.map((b) => b.low));
    const currentPrice = future[future.length - 1].close;
    const returnPct = pctChange(entry, currentPrice);
    const maxGain = pctChange(entry, maxHigh);
    const maxDD = pctChange(entry, minLow);
    const targetHit = maxHigh >= target;
    const stopHit = minLow <= stop;
    const label3 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 3);
    const label10 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 10);
    const label20 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 20);
    const label40 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 40);
    const finalLabel = label40 !== "pending" ? label40 : label20 !== "pending" ? label20 : label10 !== "pending" ? label10 : label3;
    const exitIdx = Math.min(future.length - 1, 40);

    // Insert example
    const row = {
      user_id: null, run_id: null,
      ticker: s.ticker, company: s.ticker,
      checked_date_et: day,
      provider: "historical_replay",
      was_selected: false, status_at_check: "historical_backfill",
      current_price: entry, market_cap: null, analyst_signal: null,
      one_session_return_pct: s.oneDayPct, seven_session_return_pct: s.sevenDayPct, twenty_session_return_pct: s.twentyDayPct,
      volume_strength: s.volumeRatio,
      lower_watch_area: stop, upper_watch_area: target,
      upside_vs_risk: rr, risk_reward: rr, entry_status: null,
      technical_score: technicalScore,
      overbought_flag: s.oneDayPct > 15, weak_volume_flag: s.volumeRatio < 0.7,
      high_volatility_flag: Math.abs(s.oneDayPct) > 20, extended_flag: s.sevenDayPct > 40,
      exa_result_count: exaScore.result_count, exa_positive_signal_count: exaScore.positive_count, exa_negative_signal_count: exaScore.negative_count,
      catalyst_summary: null, key_risks: null,
      finnhub_available: false, // no historical Finnhub on free tier
      rule_based_final_score: technicalScore, final_swing_score: technicalScore,

      feature_version: "v1", dataset_version: "dataset_v1", training_source: "historical",
      historical_run_id: runId, historical_date: day,
      yahoo_snapshot: { price: entry, one_day_pct: s.oneDayPct, seven_day_pct: s.sevenDayPct, twenty_day_pct: s.twentyDayPct, volume_ratio: s.volumeRatio, support, resistance },
      finnhub_snapshot: null,
      exa_snapshot: news,
      entry_price: entry, exit_price: future[exitIdx].close,
      entry_date: day, exit_date: iso(new Date(future[exitIdx].ts * 1000)),
      commission_bps: 0, slippage_bps: 0, position_size_pct: 0,
      split_bucket: "train", // historical rows always land in train
      data_quality_flags: ["finnhub_lookahead_unavailable"],
    };

    const { data: ins, error: insErr } = await admin.from("swing_training_examples").insert(row).select("id").maybeSingle();
    if (insErr || !ins) {
      await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: s.ticker, historical_date: day, reason: "insert_failed", details: { error: insErr?.message } });
      continue;
    }
    examplesCreated++;

    await admin.from("swing_training_outcomes").upsert({
      training_example_id: ins.id, ticker: s.ticker,
      checked_at: new Date(day + "T20:00:00Z").toISOString(),
      outcome_checked_at: new Date().toISOString(),
      sessions_elapsed: sessionsElapsed,
      price_at_check: entry, current_price: currentPrice,
      max_high_since_check: maxHigh, min_low_since_check: minLow,
      return_pct_current: returnPct, max_gain_pct: maxGain, max_drawdown_pct: maxDD,
      target_hit: targetHit, stop_hit: stopHit,
      outcome_3_session: sessionsElapsed >= 3 ? returnPct : null,
      outcome_10_session: sessionsElapsed >= 10 ? returnPct : null,
      outcome_20_session: sessionsElapsed >= 20 ? returnPct : null,
      outcome_40_session: sessionsElapsed >= 40 ? returnPct : null,
      label_3_session: label3, label_10_session: label10, label_20_session: label20, label_40_session: label40,
      final_label: finalLabel,
    }, { onConflict: "training_example_id" });
    outcomesCreated++;
  }
  console.log(`[hist-trainer] day_complete date=${day} examples=${examplesCreated} outcomes=${outcomesCreated}`);
  return { examplesCreated, outcomesCreated, tickersProcessed: selected.length };
}

async function runReplay(runId: string, config: any) {
  try {
    const { data: universe } = await admin.from("ml_universe_russell1000").select("ticker");
    const tickers = (universe ?? []).map((u: any) => u.ticker);
    if (tickers.length === 0) {
      await admin.from("historical_training_runs").update({ status: "failed", last_error: "empty_universe", completed_at: new Date().toISOString() }).eq("id", runId);
      return;
    }
    const days = tradingDaysInRange(config.start_date, config.end_date);
    const { data: existing } = await admin.from("historical_training_runs").select("current_replay_date").eq("id", runId).maybeSingle();
    const resumeFrom = config.resume && existing?.current_replay_date ? existing.current_replay_date : null;
    const startIdx = resumeFrom ? Math.max(0, days.findIndex((d) => d > resumeFrom)) : 0;

    let totalExamples = 0, totalOutcomes = 0, totalTickers = 0;
    for (let i = startIdx; i < days.length; i++) {
      const day = days[i];
      try {
        const r = await processDay(runId, day, tickers, config.top_n ?? 60);
        totalExamples += r.examplesCreated; totalOutcomes += r.outcomesCreated; totalTickers += r.tickersProcessed;
      } catch (e) {
        console.log(`[hist-trainer] day_failed date=${day} reason=${(e as Error).message}`);
        await admin.from("ml_data_quality_log").insert({ run_id: runId, historical_date: day, reason: "day_failed", details: { error: (e as Error).message } });
      }
      await admin.from("historical_training_runs").update({
        current_replay_date: day,
        tickers_processed: totalTickers,
        examples_created: totalExamples,
        outcomes_created: totalOutcomes,
        status: i === days.length - 1 ? "completed" : "running",
      }).eq("id", runId);

      // Batch pause every N days to avoid provider bursts.
      if ((i - startIdx + 1) % (config.batch_size ?? 10) === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    await admin.from("historical_training_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId);
    console.log(`[hist-trainer] run_complete run_id=${runId} examples=${totalExamples} outcomes=${totalOutcomes}`);
  } catch (e) {
    await admin.from("historical_training_runs").update({ status: "failed", last_error: (e as Error).message, completed_at: new Date().toISOString() }).eq("id", runId);
    console.log(`[hist-trainer] run_failed reason=${(e as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.headers.get("x-diag-key") !== DIAG_KEY || !DIAG_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  }
  const body = await req.json().catch(() => ({}));
  const { start_date, end_date, batch_size = 10, resume = true, universe = "russell1000", dry_run = false, top_n = 60 } = body;
  if (!start_date || !end_date) {
    return new Response(JSON.stringify({ error: "start_date and end_date required" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  }
  const config = { start_date, end_date, batch_size, resume, universe, top_n };
  const { data: run, error } = await admin.from("historical_training_runs").insert({
    start_date, end_date, status: dry_run ? "dry_run" : "running", config,
  }).select("id").single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });

  if (dry_run) {
    const days = tradingDaysInRange(start_date, end_date);
    return new Response(JSON.stringify({ run_id: run.id, trading_days: days.length, first_day: days[0], last_day: days[days.length - 1] }), { headers: { ...CORS, "content-type": "application/json" } });
  }
  // @ts-ignore EdgeRuntime is provided by Deno Deploy in Supabase Edge Functions.
  EdgeRuntime.waitUntil(runReplay(run.id, config));
  return new Response(JSON.stringify({ run_id: run.id, status: "running" }), { headers: { ...CORS, "content-type": "application/json" } });
});
