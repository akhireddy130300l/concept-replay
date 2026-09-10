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
import { COST_LIMITS, capDays, rankFullDay, canStartRun, clampReplayRequest, isHalted, nextDayIndex } from "../_shared/cost-guard.ts";
import { planDayStep, shouldContinue, nextStepTarget } from "../_shared/replay-scheduler.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-diag-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIAG_KEY = Deno.env.get("DIAG_KEY") ?? "";
const EXA_API_KEY = Deno.env.get("EXA_API_KEY") ?? "";
const PIPELINE_VERSION = "historical_replay_v2";
const FEATURE_VERSION = "v1";
const DATASET_VERSION = "dataset_v1";
const MAX_CONSECUTIVE_ERRORS_DEFAULT = COST_LIMITS.maxConsecutiveErrors;
const MAX_DAYS_PER_INVOCATION = COST_LIMITS.maxDaysPerInvocation;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function logEvent(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ event, pipeline: PIPELINE_VERSION, ts: new Date().toISOString(), ...details }));
}

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
  { ok: true; bars: { ts: number; close: number; high: number; low: number; volume: number }[]; latency_ms: number; status: number; provider_timestamp: string } | { ok: false; reason: string; latency_ms: number; status?: number; provider_timestamp: string }
> {
  const started = Date.now();
  const provider_timestamp = new Date().toISOString();
  const period1 = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
  const period2 = Math.floor(new Date(to + "T00:00:00Z").getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (res.status !== 200) return { ok: false, reason: `status_${res.status}`, latency_ms: Date.now() - started, status: res.status, provider_timestamp };
    const j = await res.json();
    const r = j?.chart?.result?.[0]; const q = r?.indicators?.quote?.[0]; const ts = r?.timestamp;
    if (!Array.isArray(ts) || !q) return { ok: false, reason: "missing_series", latency_ms: Date.now() - started, status: res.status, provider_timestamp };
    const bars: any[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close?.[i], h = q.high?.[i], l = q.low?.[i], v = q.volume?.[i];
      if ([c, h, l, v].every((x) => typeof x === "number" && Number.isFinite(x))) {
        bars.push({ ts: ts[i], close: c, high: h, low: l, volume: v });
      }
    }
    return { ok: true, bars, latency_ms: Date.now() - started, status: res.status, provider_timestamp };
  } catch (e) { return { ok: false, reason: (e as Error).message.slice(0, 100), latency_ms: Date.now() - started, provider_timestamp }; }
}

async function exaHistoricalNews(ticker: string, company: string, day: string): Promise<any> {
  const started = Date.now();
  const provider_timestamp = new Date().toISOString();
  if (!EXA_API_KEY) return { skipped: "missing_exa_api_key", _meta: { provider: "exa", status: "skipped", latency_ms: 0, provider_timestamp } };
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
    if (!res.ok) return { error: `status_${res.status}`, _meta: { provider: "exa", status: res.status, latency_ms: Date.now() - started, provider_timestamp } };
    const j = await res.json();
    return { results: (j.results ?? []).map((r: any) => ({ title: r.title, url: r.url, published: r.publishedDate, highlights: r.highlights ?? [] })), _meta: { provider: "exa", status: res.status, latency_ms: Date.now() - started, provider_timestamp } };
  } catch (e) { return { error: (e as Error).message.slice(0, 100), _meta: { provider: "exa", status: "error", latency_ms: Date.now() - started, provider_timestamp } }; }
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

async function touchRun(runId: string, patch: Record<string, unknown> = {}) {
  await admin.from("historical_training_runs").update({ heartbeat_at: new Date().toISOString(), ...patch }).eq("id", runId);
}

async function upsertDayLog(runId: string, day: string, patch: Record<string, unknown>) {
  await admin.from("historical_replay_day_logs").upsert({
    run_id: runId,
    replay_date: day,
    updated_at: new Date().toISOString(),
    ...patch,
  }, { onConflict: "run_id,replay_date" });
}

async function countDayQualityEvents(runId: string, day: string): Promise<number> {
  const { count } = await admin
    .from("ml_data_quality_log")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("historical_date", day);
  return count ?? 0;
}

function confidenceFromScore(score: number, exaScore: { positive_count: number; negative_count: number }) {
  const signalStrength = Math.min(0.25, Math.abs(exaScore.positive_count - exaScore.negative_count) * 0.03);
  return Math.max(0.35, Math.min(0.92, 0.45 + score / 25 + signalStrength));
}

function marketRegimeFor(day: string, scored: { twentyDayPct: number; volumeRatio: number }[]) {
  const avg20 = scored.length ? scored.reduce((a, s) => a + s.twentyDayPct, 0) / scored.length : 0;
  const avgVolume = scored.length ? scored.reduce((a, s) => a + s.volumeRatio, 0) / scored.length : 1;
  const broad = avg20 > 3 ? "bull" : avg20 < -3 ? "bear" : "sideways";
  const vol = avgVolume > 1.35 ? "high_volatility" : avgVolume < 0.8 ? "low_volatility" : "normal_volatility";
  const month = Number(day.slice(5, 7));
  const dd = Number(day.slice(8, 10));
  return {
    broad_market_label: broad,
    volatility_label: vol,
    trend_label: avg20 > 1 ? "uptrend" : avg20 < -1 ? "downtrend" : "rangebound",
    fed_week: dd >= 15 && dd <= 22,
    earnings_season: [1, 4, 7, 10].includes(month),
    spy_return_20d: avg20,
    vix_level: null,
    confidence_score: 0.55,
    metadata: { proxy: "average_top_universe_20d_return_and_volume", avg_volume_ratio: avgVolume },
  };
}

// ---------------------------------------------------------------------------
// Chunked day processing.
//
// COST GUARD (hard rule): ONE Edge Function invocation performs exactly ONE
// unit of work — either a single scan chunk of at most
// COST_LIMITS.maxTickersPerInvocation tickers, or the day's finalization
// (which touches at most top_n <= 60 tickers). Intermediate per-ticker scores
// are persisted in historical_replay_chunk_scores, so a crash after chunk 2 of
// 3 resumes at chunk 3 instead of recomputing the trading day.
// ---------------------------------------------------------------------------

type Metrics = { price: number; oneDayPct: number; sevenDayPct: number; twentyDayPct: number; volumeRatio: number; asOfIdx: number };

function windowFor(day: string) {
  return {
    from: iso(addDays(new Date(day + "T00:00:00Z"), -70)),
    to: iso(addDays(new Date(day + "T00:00:00Z"), 55)),
    dayTs: Math.floor(new Date(day + "T00:00:00Z").getTime() / 1000),
  };
}

function computeMetrics(bars: any[], dayTs: number): Metrics | null {
  const asOfIdx = bars.reduce((acc: number, b: any, i: number) => (b.ts <= dayTs + 43200 ? i : acc), -1);
  if (asOfIdx < 21) return null; // need 20+ prior sessions
  const price = bars[asOfIdx].close;
  const p1 = bars[asOfIdx - 1].close;
  const p7 = bars[Math.max(0, asOfIdx - 7)].close;
  const p20 = bars[Math.max(0, asOfIdx - 20)].close;
  const avgVol20 = bars.slice(Math.max(0, asOfIdx - 20), asOfIdx).reduce((a: number, b: any) => a + b.volume, 0) / 20;
  const volumeRatio = avgVol20 > 0 ? bars[asOfIdx].volume / avgVol20 : 1;
  return {
    price,
    oneDayPct: pctChange(p1, price),
    sevenDayPct: pctChange(p7, price),
    twentyDayPct: pctChange(p20, price),
    volumeRatio,
    asOfIdx,
  };
}

/** Point-in-time gainer/momentum score used to rank the FULL daily universe. */
function chunkScoreOf(m: { oneDayPct: number; sevenDayPct: number; volumeRatio: number }): number {
  return m.oneDayPct + m.sevenDayPct * 0.3 + (m.volumeRatio - 1) * 5;
}

async function fetchBarsConcurrent(
  symbols: string[],
  from: string,
  to: string,
  onFail: (sym: string, r: any) => Promise<void>,
) {
  const barsByTicker = new Map<string, any[]>();
  const yahooMetaByTicker = new Map<string, any>();
  let failures = 0;
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const sym = symbols[idx++];
      const r = await fetchYahooHistorical(sym, from, to);
      if (r.ok) {
        barsByTicker.set(sym, r.bars);
        yahooMetaByTicker.set(sym, { status: r.status, latency_ms: r.latency_ms, provider_timestamp: r.provider_timestamp });
      } else {
        failures++;
        yahooMetaByTicker.set(sym, { status: r.status ?? "error", latency_ms: r.latency_ms, provider_timestamp: r.provider_timestamp, reason: r.reason });
        await onFail(sym, r);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { barsByTicker, yahooMetaByTicker, failures };
}

/** Chunks already persisted for this run/day (resume granularity). */
async function completedChunkCount(runId: string, day: string): Promise<number> {
  const { data } = await admin
    .from("historical_replay_day_logs")
    .select("metadata")
    .eq("run_id", runId)
    .eq("replay_date", day)
    .maybeSingle();
  return Number((data?.metadata as any)?.chunks_completed ?? 0);
}

/** Scan exactly ONE chunk (<= 250 tickers) and persist its scores. */
async function scanChunk(runId: string, day: string, chunk: string[], chunkIndex: number, chunksTotal: number, universeCount: number, topN: number) {
  const started = Date.now();
  const { from, to, dayTs } = windowFor(day);
  logEvent("historical_chunk_started", { run_id: runId, replay_date: day, chunk: chunkIndex + 1, chunks: chunksTotal, tickers: chunk.length });
  if (chunkIndex === 0) {
    await upsertDayLog(runId, day, {
      status: "started",
      universe_count: universeCount,
      started_at: new Date().toISOString(),
      metadata: { top_n: topN, pipeline_version: PIPELINE_VERSION, chunks_total: chunksTotal, chunks_completed: 0, phase: "scan", chunk_size: COST_LIMITS.maxTickersPerInvocation },
    });
  }
  const { barsByTicker, failures } = await fetchBarsConcurrent(chunk, from, to, async (sym, r) => {
    await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: sym, historical_date: day, reason: "yahoo_fetch_failed", details: { reason: r.reason, status: r.status, latency_ms: r.latency_ms } });
  });

  const rows: any[] = [];
  for (const [ticker, bars] of barsByTicker.entries()) {
    const m = computeMetrics(bars, dayTs);
    if (!m) continue;
    rows.push({ run_id: runId, replay_date: day, chunk_index: chunkIndex, ticker, score: chunkScoreOf(m), metrics: m });
  }
  if (rows.length) {
    await admin.from("historical_replay_chunk_scores").upsert(rows, { onConflict: "run_id,replay_date,ticker" });
  }
  await touchRun(runId);
  await upsertDayLog(runId, day, {
    status: "scanning",
    universe_count: universeCount,
    metadata: {
      top_n: topN,
      pipeline_version: PIPELINE_VERSION,
      chunk_size: COST_LIMITS.maxTickersPerInvocation,
      chunks_total: chunksTotal,
      chunks_completed: chunkIndex + 1,
      phase: chunkIndex + 1 >= chunksTotal ? "finalize_pending" : "scan",
    },
  });
  logEvent("historical_chunk_complete", {
    run_id: runId, replay_date: day, chunk: chunkIndex + 1, chunks: chunksTotal,
    tickers_evaluated: chunk.length, scored: rows.length, yahoo_failures: failures, duration_ms: Date.now() - started,
  });
  return { scored: rows.length, failures };
}

/**
 * Finalize a day: rank the COMBINED scores of every chunk (the complete daily
 * universe), keep the final Top N, then deep-analyse only those tickers.
 */
async function finalizeDay(runId: string, day: string, universeCount: number, topN: number) {
  const dayStarted = Date.now();
  const { from, to, dayTs } = windowFor(day);
  const { data: scoreRows } = await admin
    .from("historical_replay_chunk_scores")
    .select("ticker,score,metrics")
    .eq("run_id", runId)
    .eq("replay_date", day);
  const scored = (scoreRows ?? []).map((r: any) => ({
    ticker: r.ticker as string,
    score: Number(r.score),
    twentyDayPct: Number(r.metrics?.twentyDayPct ?? 0),
    volumeRatio: Number(r.metrics?.volumeRatio ?? 1),
  }));
  const ranked = rankFullDay(scored, topN, (r) => r.score, (r) => r.ticker);
  logEvent("historical_day_ranked", { run_id: runId, replay_date: day, scored_count: scored.length, selected_count: ranked.length, universe_count: universeCount });

  // Re-fetch bars for the selected Top N only (<= 60 tickers, well under the
  // per-invocation ceiling). Deep analysis needs full bar history.
  const { barsByTicker, yahooMetaByTicker, failures: yahooFailures } = await fetchBarsConcurrent(
    ranked.map((r) => r.ticker), from, to,
    async (sym, r) => {
      await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: sym, historical_date: day, reason: "yahoo_refetch_failed", details: { reason: r.reason, status: r.status } });
    },
  );
  await touchRun(runId);

  type Scored = { ticker: string; asOfIdx: number; bars: any[]; price: number; oneDayPct: number; sevenDayPct: number; twentyDayPct: number; volumeRatio: number };
  const selected: Scored[] = [];
  for (const r of ranked) {
    const bars = barsByTicker.get(r.ticker);
    if (!bars) continue;
    const m = computeMetrics(bars, dayTs);
    if (!m) continue;
    selected.push({ ticker: r.ticker, asOfIdx: m.asOfIdx, bars, price: m.price, oneDayPct: m.oneDayPct, sevenDayPct: m.sevenDayPct, twentyDayPct: m.twentyDayPct, volumeRatio: m.volumeRatio });
  }

  await upsertDayLog(runId, day, {
    status: "scored",
    scored_count: scored.length,
    selected_count: selected.length,
    yahoo_failures: yahooFailures,
    metadata: { bars_fetched: barsByTicker.size, top_n: topN, pipeline_version: PIPELINE_VERSION },
  });

  const regime = marketRegimeFor(day, scored);
  const { data: regimeRow } = await admin.from("market_regimes").upsert({
    regime_date: day,
    ...regime,
  }, { onConflict: "regime_date" }).select("id,broad_market_label,volatility_label,trend_label").maybeSingle();
  const marketRegimeLabel = regimeRow ? `${regimeRow.broad_market_label}/${regimeRow.volatility_label}` : `${regime.broad_market_label}/${regime.volatility_label}`;

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
    const confidenceScore = confidenceFromScore(technicalScore, exaScore);
    const providerStatus = {
      yahoo: yahooMetaByTicker.get(s.ticker)?.status ?? "unknown",
      exa: news?._meta?.status ?? (news?.error ? "error" : "unknown"),
      finnhub: "unavailable_historical_free_tier",
    };
    const apiLatencyMs = {
      yahoo: yahooMetaByTicker.get(s.ticker)?.latency_ms ?? null,
      exa: news?._meta?.latency_ms ?? null,
      finnhub: null,
    };
    const providerTimestamp = news?._meta?.provider_timestamp ?? yahooMetaByTicker.get(s.ticker)?.provider_timestamp ?? new Date().toISOString();

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
    const exitPrice = future[exitIdx].close;
    const exitDate = iso(new Date(future[exitIdx].ts * 1000));
    const riskAdjustedReturn = Math.abs(maxDD) > 0 ? returnPct / Math.abs(maxDD) : returnPct;
    const whyPrediction = {
      technical_score: technicalScore,
      volume_strength: s.volumeRatio,
      one_day_return_pct: s.oneDayPct,
      seven_day_return_pct: s.sevenDayPct,
      positive_news_signals: exaScore.positive_count,
      negative_news_signals: exaScore.negative_count,
      risk_reward: rr,
    };

    const featureVector = {
      price: entry,
      one_session_return_pct: s.oneDayPct,
      seven_session_return_pct: s.sevenDayPct,
      twenty_session_return_pct: s.twentyDayPct,
      volume_strength: s.volumeRatio,
      technical_score: technicalScore,
      risk_reward: rr,
      exa_result_count: exaScore.result_count,
      exa_positive_signal_count: exaScore.positive_count,
      exa_negative_signal_count: exaScore.negative_count,
      market_regime_label: marketRegimeLabel,
      confidence_score: confidenceScore,
    };

    const { data: featureRow, error: featureErr } = await admin.from("swing_feature_store").upsert({
      ticker: s.ticker,
      feature_date: day,
      feature_version: FEATURE_VERSION,
      dataset_version: DATASET_VERSION,
      training_source: "historical",
      pipeline_version: PIPELINE_VERSION,
      provider_version: { yahoo_chart: "v8", exa_search: "search", finnhub: "free_tier_no_historical" },
      provider_timestamp: providerTimestamp,
      provider_status: providerStatus,
      api_latency_ms: apiLatencyMs,
      market_regime_id: regimeRow?.id ?? null,
      market_regime_label: marketRegimeLabel,
      current_price: entry,
      one_session_return_pct: s.oneDayPct,
      seven_session_return_pct: s.sevenDayPct,
      twenty_session_return_pct: s.twentyDayPct,
      volume_strength: s.volumeRatio,
      technical_score: technicalScore,
      exa_result_count: exaScore.result_count,
      exa_positive_signal_count: exaScore.positive_count,
      exa_negative_signal_count: exaScore.negative_count,
      finnhub_available: false,
      confidence_score: confidenceScore,
      feature_vector: featureVector,
      yahoo_snapshot: { price: entry, one_day_pct: s.oneDayPct, seven_day_pct: s.sevenDayPct, twenty_day_pct: s.twentyDayPct, volume_ratio: s.volumeRatio, support, resistance },
      finnhub_snapshot: null,
      exa_snapshot: news,
      data_quality_flags: ["finnhub_lookahead_unavailable"],
    }, { onConflict: "ticker,feature_date,feature_version,dataset_version,training_source" }).select("id").maybeSingle();
    if (featureErr) {
      await admin.from("ml_data_quality_log").insert({ run_id: runId, ticker: s.ticker, historical_date: day, reason: "feature_store_upsert_failed", details: { error: featureErr.message } });
    }

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

      feature_version: FEATURE_VERSION, dataset_version: DATASET_VERSION, training_source: "historical",
      historical_run_id: runId, historical_date: day,
      yahoo_snapshot: { price: entry, one_day_pct: s.oneDayPct, seven_day_pct: s.sevenDayPct, twenty_day_pct: s.twentyDayPct, volume_ratio: s.volumeRatio, support, resistance },
      finnhub_snapshot: null,
      exa_snapshot: news,
      entry_price: entry, exit_price: exitPrice,
      entry_date: day, exit_date: exitDate,
      commission_bps: 0, slippage_bps: 0, position_size_pct: 0,
      split_bucket: "train", // historical rows always land in train
      data_quality_flags: ["finnhub_lookahead_unavailable"],
      feature_store_id: featureRow?.id ?? null,
      provider_version: { yahoo_chart: "v8", exa_search: "search", finnhub: "free_tier_no_historical" },
      provider_timestamp: providerTimestamp,
      provider_status: providerStatus,
      api_latency_ms: apiLatencyMs,
      pipeline_version: PIPELINE_VERSION,
      created_by_pipeline: "historical_replay",
      confidence_score: confidenceScore,
      market_regime_id: regimeRow?.id ?? null,
      market_regime_label: marketRegimeLabel,
      future_return: returnPct,
      risk_adjusted_return: riskAdjustedReturn,
      reward_drawdown: maxDD,
      holding_days: Math.min(sessionsElapsed, 40),
      why_prediction: whyPrediction,
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
  const dataQualityEvents = await countDayQualityEvents(runId, day);
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - dayStarted;
  await upsertDayLog(runId, day, {
    status: "completed",
    universe_count: universeCount,
    scored_count: scored.length,
    selected_count: selected.length,
    examples_created: examplesCreated,
    outcomes_created: outcomesCreated,
    tickers_processed: selected.length,
    yahoo_failures: yahooFailures,
    data_quality_events: dataQualityEvents,
    finished_at: finishedAt,
    duration_ms: durationMs,
    metadata: { market_regime_label: marketRegimeLabel, pipeline_version: PIPELINE_VERSION, phase: "completed", universe_count: universeCount },
  });
  // Intermediate chunk scores are scratch state; drop them once the day is done.
  await admin.from("historical_replay_chunk_scores").delete().eq("run_id", runId).eq("replay_date", day);
  logEvent("historical_day_completed", { run_id: runId, replay_date: day, examples_created: examplesCreated, outcomes_created: outcomesCreated, tickers_processed: selected.length, duration_ms: durationMs, data_quality_events: dataQualityEvents });
  return { examplesCreated, outcomesCreated, tickersProcessed: selected.length, scoredCount: scored.length, selectedCount: selected.length, yahooFailures, dataQualityEvents };
}

/**
 * Perform ONE unit of work for `day`: the next unfinished scan chunk, or the
 * finalization once every chunk is persisted. Returns whether the day is done.
 */
async function processDayStep(runId: string, day: string, universe: string[], topN: number) {
  const done = await completedChunkCount(runId, day);
  const plan = planDayStep(universe, done);
  if (plan.action === "scan") {
    const r = await scanChunk(runId, day, plan.tickers, plan.chunkIndex, plan.chunksTotal, universe.length, topN);
    return { dayComplete: false, chunkIndex: plan.chunkIndex, chunksTotal: plan.chunksTotal, ...r };
  }
  const result = await finalizeDay(runId, day, universe.length, topN);
  return { dayComplete: true, chunksTotal: plan.chunksTotal, ...result };
}

async function runReplay(runId: string, config: any) {
  try {
    logEvent("historical_run_started", { run_id: runId, config });
    const { data: universe } = await admin.from("ml_universe_russell1000").select("ticker");
    const rawTickers = (universe ?? []).map((u: any) => u.ticker);
    if (rawTickers.length === 0) {
      await touchRun(runId, { status: "failed", last_error: "empty_universe", completed_at: new Date().toISOString() });
      logEvent("historical_run_failed", { run_id: runId, reason: "empty_universe" });
      return;
    }
    // COST GUARD: the full universe is processed in chunks of at most
    // maxTickersPerInvocation. No ticker is dropped — chunking only bounds the
    // work done between heartbeats.
    const tickers = [...new Set(rawTickers as string[])].sort();
    if (tickers.length > COST_LIMITS.maxTickersPerInvocation) {
      logEvent("cost_guard_universe_chunked", {
        run_id: runId,
        universe: tickers.length,
        chunk_size: COST_LIMITS.maxTickersPerInvocation,
        chunks: Math.ceil(tickers.length / COST_LIMITS.maxTickersPerInvocation),
      });
    }
    // COST GUARD: cap the total trading days one run may cover.
    const allDays = tradingDaysInRange(config.start_date, config.end_date);
    const { days, capped: daysCapped } = capDays(allDays, Number(config.max_trading_days ?? COST_LIMITS.maxTradingDaysPerRun));
    if (daysCapped) {
      logEvent("cost_guard_days_capped", { run_id: runId, from: allDays.length, to: days.length });
    }
    const { data: existing } = await admin
      .from("historical_training_runs")
      .select("current_replay_date,status,tickers_processed,examples_created,outcomes_created,failure_count,consecutive_error_count,processed_trading_days")
      .eq("id", runId)
      .maybeSingle();
    // COST GUARD: never resume work on a halted (paused/cancelled/completed/failed) run.
    if (!existing || isHalted(existing.status)) {
      logEvent("historical_run_skipped", { run_id: runId, status: existing?.status ?? "missing", reason: "halted_or_missing" });
      return;
    }
    // Resumability: skip every day already committed — no recomputation.
    const resumeFrom = config.resume && existing?.current_replay_date ? existing.current_replay_date : null;
    const startIdx = nextDayIndex(days, resumeFrom);
    const batchSize = Math.max(1, Math.min(MAX_DAYS_PER_INVOCATION, Number(config.batch_size ?? 1)));
    const maxConsecutiveErrors = Math.max(1, Math.min(COST_LIMITS.maxConsecutiveErrors, Number(config.max_consecutive_errors ?? MAX_CONSECUTIVE_ERRORS_DEFAULT)));
    const batchEndIdx = Math.min(days.length, startIdx + batchSize);

    let totalExamples = Number(existing.examples_created ?? 0);
    let totalOutcomes = Number(existing.outcomes_created ?? 0);
    let totalTickers = Number(existing.tickers_processed ?? 0);
    let processedTradingDays = Number(existing.processed_trading_days ?? Math.max(0, startIdx));
    let failureCount = Number(existing.failure_count ?? 0);
    let consecutiveErrors = Number(existing.consecutive_error_count ?? 0);
    await touchRun(runId, {
      status: "running",
      total_trading_days: days.length,
      processed_trading_days: processedTradingDays,
      last_processed_batch: { start_idx: startIdx, end_idx_exclusive: batchEndIdx, batch_size: batchSize, started_at: new Date().toISOString() },
    });

    if (startIdx >= days.length) {
      await touchRun(runId, { status: "completed", completed_at: new Date().toISOString(), last_error: null });
      logEvent("historical_run_completed", { run_id: runId, examples_created: totalExamples, outcomes_created: totalOutcomes, processed_trading_days: processedTradingDays });
      return;
    }

    // ONE unit of work per invocation: the next unfinished chunk of the current
    // trading day, or that day's finalization.
    const day = days[startIdx];
    let dayComplete = false;
    let stepInfo: Record<string, unknown> = {};
    try {
      const r: any = await processDayStep(runId, day, tickers, config.top_n ?? 60);
      dayComplete = !!r.dayComplete;
      stepInfo = r.dayComplete
        ? { phase: "finalize", chunks_total: r.chunksTotal, tickers_processed: r.tickersProcessed }
        : { phase: "scan", chunk: (r.chunkIndex ?? 0) + 1, chunks_total: r.chunksTotal };
      if (dayComplete) {
        totalExamples += Number(r.examplesCreated ?? 0);
        totalOutcomes += Number(r.outcomesCreated ?? 0);
        totalTickers += Number(r.tickersProcessed ?? 0);
        processedTradingDays = startIdx + 1;
      }
      consecutiveErrors = 0;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      logEvent("historical_day_failed", { run_id: runId, replay_date: day, reason: msg });
      failureCount += 1;
      consecutiveErrors += 1;
      await upsertDayLog(runId, day, {
        status: "failed",
        error_message: msg,
        finished_at: new Date().toISOString(),
        metadata: { pipeline_version: PIPELINE_VERSION, consecutive_errors: consecutiveErrors },
      });
      await admin.from("ml_data_quality_log").insert({ run_id: runId, historical_date: day, reason: "day_failed", details: { error: (e as Error).message } });
      if (consecutiveErrors >= maxConsecutiveErrors) {
        await touchRun(runId, {
          status: "failed",
          last_error: `failed_after_${consecutiveErrors}_consecutive_day_errors: ${msg}`,
          completed_at: new Date().toISOString(),
          failure_count: failureCount,
          consecutive_error_count: consecutiveErrors,
          tickers_processed: totalTickers,
          examples_created: totalExamples,
          outcomes_created: totalOutcomes,
          processed_trading_days: processedTradingDays,
        });
        logEvent("historical_run_failed", { run_id: runId, reason: "max_consecutive_errors", consecutive_errors: consecutiveErrors, last_error: msg });
        return;
      }
    }

    const runFinished = dayComplete && startIdx === days.length - 1;
    await touchRun(runId, {
      // Only advance the day cursor once the whole day is finalized, so a
      // resume re-enters the same day at its next unfinished chunk.
      ...(dayComplete ? { current_replay_date: day } : {}),
      tickers_processed: totalTickers,
      examples_created: totalExamples,
      outcomes_created: totalOutcomes,
      processed_trading_days: processedTradingDays,
      failure_count: failureCount,
      consecutive_error_count: consecutiveErrors,
      last_progress_at: new Date().toISOString(),
      last_error: consecutiveErrors ? `last day error: ${day}` : null,
      status: runFinished ? "completed" : "running",
      completed_at: runFinished ? new Date().toISOString() : null,
      last_processed_batch: { start_idx: startIdx, replay_date: day, day_complete: dayComplete, ...stepInfo, committed_at: new Date().toISOString() },
    });
    logEvent("historical_progress_committed", { run_id: runId, replay_date: day, day_complete: dayComplete, ...stepInfo, processed_trading_days: processedTradingDays, total_trading_days: days.length });

    if (runFinished) {
      logEvent("historical_run_completed", { run_id: runId, examples_created: totalExamples, outcomes_created: totalOutcomes, processed_trading_days: processedTradingDays });
      return;
    }

    // COST GUARD: re-read status right before self-reinvocation. If the run was
    // paused/cancelled meanwhile, or the failure threshold was reached, stop the chain.
    const { data: latest } = await admin
      .from("historical_training_runs")
      .select("status,consecutive_error_count")
      .eq("id", runId)
      .maybeSingle();
    if (!latest || isHalted(latest.status)) {
      logEvent("cost_guard_reinvoke_suppressed", { run_id: runId, status: latest?.status ?? "missing", reason: "run_halted" });
      return;
    }
    if (Number(latest.consecutive_error_count ?? 0) >= maxConsecutiveErrors) {
      await touchRun(runId, { status: "failed", last_error: "halted_by_cost_guard_consecutive_errors", completed_at: new Date().toISOString() });
      logEvent("cost_guard_reinvoke_suppressed", { run_id: runId, reason: "consecutive_error_threshold" });
      return;
    }

    const nextDay = dayComplete ? days[startIdx + 1] : day;
    await touchRun(runId, {
      status: "running",
      last_processed_batch: { start_idx: startIdx, queued_next_at: new Date().toISOString(), next_replay_date: nextDay, resuming_same_day: !dayComplete },
    });
    logEvent("historical_next_batch_queued", { run_id: runId, next_replay_date: nextDay, resuming_same_day: !dayComplete, processed_trading_days: processedTradingDays, total_trading_days: days.length });
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/historical-swing-trainer`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-diag-key": DIAG_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ ...config, run_id: runId, resume: true }),
    });
    logEvent("historical_next_batch_invoked", { run_id: runId, status: resp.status, ok: resp.ok });
  } catch (e) {
    await touchRun(runId, { status: "failed", last_error: (e as Error).message, completed_at: new Date().toISOString() });
    logEvent("historical_run_failed", { run_id: runId, reason: (e as Error).message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.headers.get("x-diag-key") !== DIAG_KEY || !DIAG_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
  }
  const body = await req.json().catch(() => ({}));
  const { start_date, end_date, universe = "russell1000", dry_run = false, run_id = null } = body;
  if (!start_date || !end_date) {
    return new Response(JSON.stringify({ error: "start_date and end_date required" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  }
  // COST GUARD: clamp every caller-supplied workload knob.
  const { config: clamped, warnings } = clampReplayRequest({
    start_date, end_date,
    batch_size: body.batch_size,
    top_n: body.top_n,
    resume: body.resume,
    max_consecutive_errors: body.max_consecutive_errors,
    max_trading_days: body.max_trading_days,
  });
  if (warnings.length) logEvent("cost_guard_request_clamped", { warnings, run_id });
  const config = { ...clamped, universe };
  let run = run_id ? { id: run_id } : null;
  if (!run) {
    // COST GUARD: single active replay run at a time (running or paused).
    const { data: active } = await admin
      .from("historical_training_runs")
      .select("id,status")
      .in("status", ["running", "paused"])
      .limit(1);
    const gate = canStartRun(active?.length ?? 0, body.force === true);
    if (!gate.ok) {
      logEvent("cost_guard_start_blocked", { reason: gate.reason, active_run_id: active?.[0]?.id });
      return new Response(JSON.stringify({ error: gate.reason, run_id: active?.[0]?.id }), { status: 409, headers: { ...CORS, "content-type": "application/json" } });
    }
    const inserted = await admin.from("historical_training_runs").insert({
      start_date,
      end_date,
      status: dry_run ? "dry_run" : "running",
      config,
      heartbeat_at: new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
      pipeline_version: PIPELINE_VERSION,
      run_source: body.run_source ?? "manual",
    }).select("id").single();
    if (inserted.error) return new Response(JSON.stringify({ error: inserted.error.message }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
    run = inserted.data;
  }

  if (dry_run) {
    const days = capDays(tradingDaysInRange(start_date, end_date), config.max_trading_days).days;
    return new Response(JSON.stringify({ run_id: run.id, cost_guard: { limits: COST_LIMITS, warnings }, trading_days: days.length, first_day: days[0], last_day: days[days.length - 1] }), { headers: { ...CORS, "content-type": "application/json" } });
  }
  // @ts-ignore EdgeRuntime is provided by Deno Deploy in Supabase Edge Functions.
  EdgeRuntime.waitUntil(runReplay(run.id, config));
  return new Response(JSON.stringify({ run_id: run.id, status: "running", cost_guard_warnings: warnings }), { headers: { ...CORS, "content-type": "application/json" } });
});
