// Swing Trader Watch engine + email renderer.
// Called by the daily stock email. Uses direct Gemini (GEMINI_API_KEY) with
// Google Search grounding. Model comes from GEMINI_SWING_MODEL env; falls back
// to gemini-2.5-flash on 4xx/5xx from the primary model.
//
// Safe execution: max 3 concurrent Gemini calls, exponential backoff on 429,
// per-trading-day cache per (ticker, model, source_type=swing_deep_check).
// One failed ticker never blocks the whole email.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SwingTickerInput = {
  ticker: string;
  company: string;
  price?: number;
  oneDayPct?: number;
  sevenDayPct?: number;
  twentyDayPct?: number;
  volumeRatio?: number;   // vs 20-day avg, if known
  marketCap?: number;
  analystLabel?: string;
  watchlistScore?: number;
  entryStatus?: string;
  lowerWatch?: number;
  upperWatch?: number;
  riskRewardRaw?: number;
  riskFlags?: string[];
  sourceTables: string[]; // which tables this ticker appeared in
};

export type SwingDeepCheck = {
  ticker: string;
  company: string;
  industry?: string;
  latest_catalyst?: string;
  news_check?: "passed" | "failed" | "unavailable";
  peer_check?: "passed" | "failed" | "unavailable";
  industry_check?: "passed" | "failed" | "unavailable";
  risk_check?: "passed" | "failed" | "unavailable";
  fundamental_check?: "passed" | "failed" | "unavailable";
  peer_context?: string;
  industry_context?: string;
  key_risks?: string[];
  red_flags?: string[];
  positive_factors?: string[];
  swing_suitability?: "strong_candidate" | "possible_candidate" | "watch_only" | "rejected" | "needs_confirmation";
  rejection_reason?: string;
  confidence?: "Low" | "Medium" | "High";
  sources?: { title: string; url: string }[];
};

export type CheckedTicker = {
  ticker: string;
  company: string;
  sourceTables: string[];
  technicalScore: number;
  newsScore: number;
  peerScore: number;
  industryScore: number;
  riskScore: number;
  finalScore: number;
  status:
    | "selected"
    | "passed_not_selected"
    | "rejected"
    | "watch_only"
    | "needs_confirmation"
    | "news_unavailable"
    | "deep_check_failed";
  rejectionReason?: string;
  deep?: SwingDeepCheck;
  cacheHit: boolean;
  elapsedMs: number;
  modelUsed: string;
};

export type SwingResult = {
  runId?: string;
  modelUsed: string;
  uniqueChecked: number;
  totalSelected: number;
  totalRejected: number;
  totalWatchOnly: number;
  totalFailed: number;
  totalCacheHits: number;
  totalGeminiAttempts: number;
  selected?: CheckedTicker;
  selectedPlan?: TradingPlan;
  passed: CheckedTicker[]; // passed but not selected
  rejected: CheckedTicker[];
  watchOnly: CheckedTicker[];
  failed: CheckedTicker[];
  all: CheckedTicker[];
  previous?: {
    ticker: string;
    company?: string;
    selectedDate: string;
    selectedPrice?: number;
    currentPrice?: number;
    plPct?: number;
    targetHit: boolean;
    stopHit: boolean;
    status: string;
  } | null;
  elapsedMs: number;
};

const DEFAULT_SWING_MODEL = "gemini-3.1-flash-lite";
// NOTE: No per-ticker model fallback. gemini-2.5-flash has only 20 RPD and would
// exhaust after a few tickers. On primary-model failure a ticker is marked
// deep_check_failed and we continue with the next one.
const MAX_CONCURRENT = 1;
const MAX_RETRIES = 2;
const REQUEST_DELAY_MS = 4500; // strict: ~13.3 starts/min, well under 15 RPM cap

function tradingDateNY(): string {
  const now = new Date();
  // Use New York date; not adjusting for weekends/holidays — cache scoped daily is enough.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function dedupeInputs(inputs: SwingTickerInput[]): SwingTickerInput[] {
  const map = new Map<string, SwingTickerInput>();
  for (const raw of inputs) {
    const key = String(raw.ticker || "").toUpperCase().trim();
    if (!key || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(key)) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...raw, ticker: key, sourceTables: [...new Set(raw.sourceTables || [])] });
    } else {
      const merged = { ...existing };
      // Merge source tables and fill missing fields.
      merged.sourceTables = Array.from(new Set([...(existing.sourceTables || []), ...(raw.sourceTables || [])]));
      for (const k of Object.keys(raw) as (keyof SwingTickerInput)[]) {
        if (k === "sourceTables" || k === "ticker") continue;
        if ((merged as any)[k] === undefined || (merged as any)[k] === null || (merged as any)[k] === "") {
          (merged as any)[k] = (raw as any)[k];
        }
      }
      map.set(key, merged);
    }
  }
  return Array.from(map.values());
}

// Deterministic pre-scores 0..10 per axis.
function preScore(t: SwingTickerInput): { technical: number; risk: number } {
  let tech = 5;
  if (typeof t.oneDayPct === "number") {
    if (t.oneDayPct > 15) tech -= 2; // very extended
    else if (t.oneDayPct > 8) tech -= 1;
    else if (t.oneDayPct > 2) tech += 1;
  }
  if (typeof t.sevenDayPct === "number") {
    if (t.sevenDayPct > 40) tech -= 2;
    else if (t.sevenDayPct > 5) tech += 1;
    else if (t.sevenDayPct < -8) tech -= 1;
  }
  if (typeof t.volumeRatio === "number") {
    if (t.volumeRatio > 1.5) tech += 1;
    if (t.volumeRatio < 0.7) tech -= 1;
  }
  if (typeof t.riskRewardRaw === "number") {
    if (t.riskRewardRaw >= 2) tech += 1;
    if (t.riskRewardRaw < 1) tech -= 1;
  }
  if (typeof t.watchlistScore === "number") tech += Math.max(-1, Math.min(2, (t.watchlistScore - 50) / 25));

  let risk = 5;
  if (Array.isArray(t.riskFlags)) risk -= Math.min(3, t.riskFlags.length);
  if (typeof t.marketCap === "number") {
    if (t.marketCap < 300_000_000) risk -= 2;
    else if (t.marketCap < 2_000_000_000) risk -= 1;
    else if (t.marketCap > 20_000_000_000) risk += 1;
  }
  if (typeof t.oneDayPct === "number" && Math.abs(t.oneDayPct) > 20) risk -= 2;

  return {
    technical: Math.max(0, Math.min(10, tech)),
    risk: Math.max(0, Math.min(10, risk)),
  };
}

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) return t.slice(i, j + 1);
  return t;
}

function buildPrompt(t: SwingTickerInput): string {
  return [
    `You are a stock analyst evaluating "${t.ticker}" (${t.company}) for a 3–10 TRADING DAY swing setup.`,
    `Use Google Search to fetch CURRENT public information. Do not rely on memory alone.`,
    `Return ONLY strict JSON, no markdown, no commentary, matching this shape:`,
    `{
  "ticker": "${t.ticker}",
  "company": "${t.company}",
  "industry": string,
  "latest_catalyst": string,
  "news_check": "passed" | "failed" | "unavailable",
  "peer_check": "passed" | "failed" | "unavailable",
  "industry_check": "passed" | "failed" | "unavailable",
  "risk_check": "passed" | "failed" | "unavailable",
  "fundamental_check": "passed" | "failed" | "unavailable",
  "peer_context": string,
  "industry_context": string,
  "key_risks": string[],
  "red_flags": string[],
  "positive_factors": string[],
  "swing_suitability": "strong_candidate" | "possible_candidate" | "watch_only" | "rejected" | "needs_confirmation",
  "rejection_reason": string,
  "confidence": "Low" | "Medium" | "High",
  "sources": [ { "title": string, "url": string } ]
}`,
    `Rules:`,
    `- Check: latest news (past 14 days), catalyst, earnings/news risk, analyst upgrades/downgrades, regulatory/legal risks, fundamentals summary, industry condition, main peers, whether the move is with or against peers, geopolitical/country risk, sector-specific risks, whether the move is news-backed or speculative.`,
    `- Apply industry-specific checks where relevant: biotech/pharma (pipeline, FDA, trials, patents, competitor drugs), tech/software (demand, AI/cloud trend, valuation, customer growth), financials (rates, credit, earnings quality), airlines/travel (fuel, demand, debt), EV/auto (deliveries, margins, cash burn, competition).`,
    `- If no fresh news can be found, set news_check to "unavailable".`,
    `- Reject if: major negative news, serious lawsuit or regulatory risk, earnings miss or guidance cut, extremely overextended, weak volume confirmation, peer group much stronger than candidate, move appears purely hype-based, high volatility without clear catalyst.`,
    `- Every text field <= 500 chars. sources must contain real URLs from search.`,
  ].join("\n");
}

async function callGeminiOnce(model: string, prompt: string, apiKey: string, signal?: AbortSignal): Promise<{ text: string; grounded: boolean; groundingChunks: any[]; httpStatus: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.4 },
    }),
    signal,
  });
  if (res.status === 429) return { text: "", grounded: false, groundingChunks: [], httpStatus: 429 };
  if (!res.ok) return { text: "", grounded: false, groundingChunks: [], httpStatus: res.status };
  const json: any = await res.json().catch(() => null);
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts;
  const text: string = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
    : "";
  const gm = cand?.groundingMetadata;
  const chunks = Array.isArray(gm?.groundingChunks) ? gm.groundingChunks : [];
  const grounded = chunks.length > 0 || (Array.isArray(gm?.webSearchQueries) && gm.webSearchQueries.length > 0);
  return { text, grounded, groundingChunks: chunks, httpStatus: res.status };
}

async function callGeminiWithRetry(model: string, prompt: string, apiKey: string, ticker: string): Promise<{ deep: SwingDeepCheck | null; modelUsed: string; failure?: string }> {
  let delay = 2000;
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const started = Date.now();
    console.log(JSON.stringify({
      feature: "swing_trader_watch", ticker, model_used: model,
      request_started: true, attempt,
    }));
    const r = await callGeminiOnce(model, prompt, apiKey);
    lastStatus = r.httpStatus;
    console.log(JSON.stringify({
      feature: "swing_trader_watch", ticker, model_used: model,
      request_finished: true, attempt, status: r.httpStatus, elapsed_ms: Date.now() - started,
    }));
    if (r.httpStatus === 429) {
      if (attempt < MAX_RETRIES) {
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        continue;
      }
      return { deep: null, modelUsed: model, failure: `rate_limited_429` };
    }
    if (r.httpStatus >= 400) {
      return { deep: null, modelUsed: model, failure: `http_${r.httpStatus}` };
    }
    if (!r.text) return { deep: null, modelUsed: model, failure: "empty_response" };
    let parsed: any;
    try { parsed = JSON.parse(extractJson(r.text)); } catch { return { deep: null, modelUsed: model, failure: "invalid_json" }; }
    if (Array.isArray(r.groundingChunks) && r.groundingChunks.length > 0) {
      const extra = r.groundingChunks
        .map((c: any) => c?.web ? { title: String(c.web.title || c.web.uri || "source"), url: String(c.web.uri || "") } : null)
        .filter((x: any) => x && x.url);
      if (!Array.isArray(parsed.sources)) parsed.sources = [];
      const seen = new Set(parsed.sources.map((s: any) => s?.url).filter(Boolean));
      for (const s of extra) if (!seen.has(s.url)) { parsed.sources.push(s); seen.add(s.url); }
    }
    return { deep: parsed as SwingDeepCheck, modelUsed: model };
  }
  return { deep: null, modelUsed: model, failure: `gemini_failed_status_${lastStatus ?? "unknown"}` };
}

function statusFromSuitability(s?: string): CheckedTicker["status"] {
  switch (s) {
    case "strong_candidate": return "passed_not_selected";
    case "possible_candidate": return "passed_not_selected";
    case "watch_only": return "watch_only";
    case "needs_confirmation": return "needs_confirmation";
    case "rejected": return "rejected";
    default: return "needs_confirmation";
  }
}

function scoreDeep(deep: SwingDeepCheck): { news: number; peer: number; industry: number; risk: number } {
  const s = (c?: string) => (c === "passed" ? 8 : c === "unavailable" ? 4 : 1);
  let risk = s(deep.risk_check);
  if (Array.isArray(deep.red_flags) && deep.red_flags.length > 0) risk = Math.max(0, risk - 2);
  return {
    news: s(deep.news_check),
    peer: s(deep.peer_check),
    industry: s(deep.industry_check),
    risk,
  };
}

export type TradingPlan = {
  currentPrice: number;
  entryLow: number;
  entryHigh: number;
  targetLow: number;
  targetHigh: number;
  stopLoss: number;
  riskReward?: number;
  holdingWindow: string;
  invalidation: string;
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

// Build a deterministic trading plan from the input's watchlist/chart fields.
// Returns null when the setup lacks the fields needed to define entry, target,
// and stop clearly — in that case, the ticker is NOT selected.
function computeTradingPlan(t: SwingTickerInput, _d: SwingDeepCheck): TradingPlan | null {
  const price = typeof t.price === "number" && t.price > 0 ? t.price : NaN;
  if (!Number.isFinite(price)) return null;

  // Prefer deterministic watchlist bands when available.
  const lower = typeof t.lowerWatch === "number" && t.lowerWatch > 0 ? t.lowerWatch : NaN;
  const upper = typeof t.upperWatch === "number" && t.upperWatch > 0 ? t.upperWatch : NaN;

  let entryLow: number, entryHigh: number, targetLow: number, targetHigh: number, stopLoss: number;

  if (Number.isFinite(lower) && Number.isFinite(upper) && upper > lower) {
    // Entry: current price down to lowerWatch (buy pullback). Cap entry band at price.
    entryHigh = Math.min(price, upper);
    entryLow = Math.max(lower, Math.min(price * 0.98, entryHigh));
    if (entryLow >= entryHigh) entryLow = round2(entryHigh * 0.98);
    targetHigh = upper;
    targetLow = round2(price + (upper - price) * 0.6);
    if (targetLow <= entryHigh) targetLow = round2(entryHigh * 1.03);
    stopLoss = round2(lower * 0.98);
  } else {
    // Fallback: derive from price only (~2% entry band, ~6-10% target, ~3% stop).
    entryHigh = price;
    entryLow = round2(price * 0.98);
    targetLow = round2(price * 1.06);
    targetHigh = round2(price * 1.10);
    stopLoss = round2(price * 0.97);
  }

  if (!(stopLoss > 0 && stopLoss < entryLow && targetLow > entryHigh)) return null;

  // Risk/reward from raw watchlist value if present, else compute.
  let rr: number | undefined;
  if (typeof t.riskRewardRaw === "number" && t.riskRewardRaw > 0 && Number.isFinite(t.riskRewardRaw)) {
    rr = round2(t.riskRewardRaw);
  } else {
    const risk = entryHigh - stopLoss;
    const reward = targetLow - entryHigh;
    if (risk > 0) rr = round2(reward / risk);
  }

  const invalidation =
    `Setup weakens if price closes below $${stopLoss.toFixed(2)}` +
    (Number.isFinite(lower) ? ` (below key support $${lower.toFixed(2)})` : "") +
    `, if fresh negative news appears, or if the peer group leads down on strong volume.`;

  return {
    currentPrice: round2(price),
    entryLow: round2(entryLow),
    entryHigh: round2(entryHigh),
    targetLow: round2(targetLow),
    targetHigh: round2(targetHigh),
    stopLoss,
    riskReward: rr,
    holdingWindow: "3–10 trading days",
    invalidation,
  };
}

async function runOne(
  admin: SupabaseClient,
  input: SwingTickerInput,
  primaryModel: string,
  apiKey: string,
  today: string,
): Promise<CheckedTicker> {
  const t0 = Date.now();
  const pre = preScore(input);

  // Cache lookup.
  const { data: cacheRow } = await admin
    .from("swing_ticker_cache")
    .select("payload, model")
    .eq("ticker", input.ticker)
    .eq("trading_date", today)
    .eq("model", primaryModel)
    .eq("source_type", "swing_deep_check")
    .maybeSingle();

  let deep: SwingDeepCheck | null = null;
  let modelUsed = primaryModel;
  let cacheHit = false;
  let failure: string | undefined;

  if (cacheRow) {
    deep = cacheRow.payload as SwingDeepCheck;
    modelUsed = String(cacheRow.model || primaryModel);
    cacheHit = true;
    console.log(JSON.stringify({ feature: "swing_trader_watch", ticker: input.ticker, model_used: modelUsed, cache_hit: true, status: "cache" }));
  } else {
    console.log(`[swing] checking ${input.ticker} with model ${primaryModel}`);
    const out = await callGeminiWithRetry(primaryModel, buildPrompt(input), apiKey, input.ticker);
    deep = out.deep;
    modelUsed = out.modelUsed;
    failure = out.failure;
    console.log(JSON.stringify({
      feature: "swing_trader_watch", ticker: input.ticker, model_used: modelUsed,
      cache_hit: false, status: deep ? "ok" : "failed",
      failure_category: failure ?? null,
    }));
    if (deep) {
      try {
        await admin.from("swing_ticker_cache").upsert({
          ticker: input.ticker,
          trading_date: today,
          model: modelUsed,
          source_type: "swing_deep_check",
          payload: deep,
        });
      } catch (e) {
        console.log(JSON.stringify({ phase: "swing", ticker: input.ticker, cache_upsert_failed: (e as Error).message }));
      }
    }
  }

  if (!deep) {
    return {
      ticker: input.ticker,
      company: input.company,
      sourceTables: input.sourceTables,
      technicalScore: pre.technical,
      newsScore: 0, peerScore: 0, industryScore: 0,
      riskScore: pre.risk,
      finalScore: pre.technical + pre.risk,
      status: "deep_check_failed",
      rejectionReason: failure || "Deep check failed",
      cacheHit,
      elapsedMs: Date.now() - t0,
      modelUsed,
    };
  }

  const d = scoreDeep(deep);
  const status: CheckedTicker["status"] =
    deep.news_check === "unavailable" && deep.swing_suitability !== "rejected"
      ? "news_unavailable"
      : statusFromSuitability(deep.swing_suitability);

  const finalScore =
    pre.technical * 1.2 +
    d.news * 1.5 +
    d.peer * 0.8 +
    d.industry * 0.8 +
    (d.risk + pre.risk) / 2 * 1.2;

  return {
    ticker: input.ticker,
    company: input.company,
    sourceTables: input.sourceTables,
    technicalScore: pre.technical,
    newsScore: d.news,
    peerScore: d.peer,
    industryScore: d.industry,
    riskScore: (d.risk + pre.risk) / 2,
    finalScore,
    status,
    rejectionReason: deep.rejection_reason || undefined,
    deep,
    cacheHit,
    elapsedMs: Date.now() - t0,
    modelUsed,
  };
}

// Strict serial pacer: enforces >= REQUEST_DELAY_MS between call STARTS.
// With MAX_CONCURRENT=1 this guarantees no more than 60000/REQUEST_DELAY_MS
// request starts per minute (well under the 15 RPM cap for gemini-3.1-flash-lite).
async function limitedParallel<T, R>(items: T[], _limit: number, worker: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let lastStart = 0;
  for (let i = 0; i < items.length; i++) {
    const wait = Math.max(0, REQUEST_DELAY_MS - (Date.now() - lastStart));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    try { results[i] = await worker(items[i], i); } catch (e) { results[i] = e as any; }
  }
  return results;
}

export async function runSwingTraderWatch(
  admin: SupabaseClient,
  rawInputs: SwingTickerInput[],
  emailRunId?: string,
): Promise<SwingResult> {
  const started = Date.now();
  const primaryModel = Deno.env.get("GEMINI_SWING_MODEL") || DEFAULT_SWING_MODEL;
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const today = tradingDateNY();
  const inputs = dedupeInputs(rawInputs);

  console.log(JSON.stringify({ phase: "swing", event: "start", unique_tickers: inputs.length, model: primaryModel }));

  if (!apiKey || inputs.length === 0) {
    return {
      modelUsed: primaryModel, uniqueChecked: inputs.length, totalSelected: 0,
      totalRejected: 0, totalWatchOnly: 0, totalFailed: inputs.length, totalCacheHits: 0,
      totalGeminiAttempts: 0, passed: [], rejected: [], watchOnly: [], failed: [], all: [],
      previous: await loadPrevious(admin), elapsedMs: Date.now() - started,
    };
  }

  const results = await limitedParallel(inputs, MAX_CONCURRENT, (inp) => runOne(admin, inp, primaryModel, apiKey, today));

  // Bucket by status.
  const rejected: CheckedTicker[] = [];
  const watchOnly: CheckedTicker[] = [];
  const failed: CheckedTicker[] = [];
  const passed: CheckedTicker[] = [];
  const needsConf: CheckedTicker[] = [];
  const newsUnavailable: CheckedTicker[] = [];
  for (const r of results) {
    if (!r) continue;
    if (r.status === "rejected") rejected.push(r);
    else if (r.status === "watch_only") watchOnly.push(r);
    else if (r.status === "deep_check_failed") failed.push(r);
    else if (r.status === "needs_confirmation") needsConf.push(r);
    else if (r.status === "news_unavailable") newsUnavailable.push(r);
    else passed.push(r);
  }

  // Pick highest-scoring "passed" with strong_candidate + news_check passed.
  // Pick highest-scoring "passed" with strong_candidate + news_check passed +
  // no red flags + a computable trading plan with clear entry/target/stop and RR>=2 where possible.
  const eligibleAll = passed
    .filter((r) => r.deep?.swing_suitability === "strong_candidate")
    .filter((r) => r.deep?.news_check === "passed")
    .filter((r) => !Array.isArray(r.deep?.red_flags) || r.deep!.red_flags!.length === 0)
    .sort((a, b) => b.finalScore - a.finalScore);

  const inputByTicker = new Map(inputs.map((i) => [i.ticker, i]));
  let selected: CheckedTicker | undefined;
  let selectedPlan: TradingPlan | undefined;
  for (const cand of eligibleAll) {
    const inp = inputByTicker.get(cand.ticker);
    if (!inp) continue;
    const plan = computeTradingPlan(inp, cand.deep!);
    if (!plan) continue;
    // Require RR >= 2 when it can be computed; if RR unknown, still allow.
    if (typeof plan.riskReward === "number" && plan.riskReward < 2) continue;
    selected = cand;
    selectedPlan = plan;
    break;
  }
  if (selected) {
    selected.status = "selected";
    const idx = passed.indexOf(selected);
    if (idx >= 0) passed.splice(idx, 1);
  }

  const totalCacheHits = results.filter((r) => r?.cacheHit).length;
  const totalGeminiAttempts = results.length - totalCacheHits;

  // Persist run + rows.
  let runId: string | undefined;
  try {
    const runRow: any = {
      email_run_id: emailRunId ?? null,
      run_date: today,
      model_used: primaryModel,
      unique_tickers_checked: inputs.length,
      total_selected: selected ? 1 : 0,
      total_rejected: rejected.length,
      total_watch_only: watchOnly.length + needsConf.length + newsUnavailable.length,
      total_failed: failed.length,
      final_status: selected ? "candidate_selected" : "no_candidate",
      selected_ticker: selected?.ticker ?? null,
      selected_company: selected?.company ?? null,
      confidence: selected?.deep?.confidence ?? null,
      setup_type: selected?.deep?.swing_suitability ?? null,
      catalyst_summary: selected?.deep?.latest_catalyst ?? null,
      peer_context: selected?.deep?.peer_context ?? null,
      industry_context: selected?.deep?.industry_context ?? null,
      key_risks: selected?.deep?.key_risks ?? null,
      selected_price: selectedPlan?.currentPrice ?? null,
      entry_zone_low: selectedPlan?.entryLow ?? null,
      entry_zone_high: selectedPlan?.entryHigh ?? null,
      target_zone_low: selectedPlan?.targetLow ?? null,
      target_zone_high: selectedPlan?.targetHigh ?? null,
      stop_loss: selectedPlan?.stopLoss ?? null,
      holding_window: selectedPlan?.holdingWindow ?? null,
      risk_reward: selectedPlan?.riskReward ?? null,
      invalidation: selectedPlan?.invalidation ?? null,
      source_timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
    };
    const { data: runIns } = await admin.from("swing_trade_runs").insert(runRow).select("id").maybeSingle();
    runId = runIns?.id;
    if (runId) {
      const rows = [selected, ...passed, ...rejected, ...watchOnly, ...needsConf, ...newsUnavailable, ...failed]
        .filter(Boolean)
        .map((r) => ({
          run_id: runId,
          ticker: r!.ticker,
          company: r!.company,
          source_tables: r!.sourceTables,
          technical_score: r!.technicalScore,
          news_score: r!.newsScore,
          peer_score: r!.peerScore,
          industry_score: r!.industryScore,
          risk_score: r!.riskScore,
          final_score: r!.finalScore,
          status: r!.status,
          checks_completed: r!.deep ? {
            tech: true,
            news: r!.deep.news_check,
            peer: r!.deep.peer_check,
            industry: r!.deep.industry_check,
            risk: r!.deep.risk_check,
            fundamentals: r!.deep.fundamental_check,
          } : null,
          latest_catalyst: r!.deep?.latest_catalyst ?? null,
          peer_context: r!.deep?.peer_context ?? null,
          industry_context: r!.deep?.industry_context ?? null,
          key_risks: r!.deep?.key_risks ?? null,
          red_flags: r!.deep?.red_flags ?? null,
          rejection_reason: r!.rejectionReason ?? null,
          confidence: r!.deep?.confidence ?? null,
          sources_json: r!.deep?.sources ?? null,
          model_used: r!.modelUsed,
          elapsed_ms: r!.elapsedMs,
        }));
      if (rows.length > 0) {
        try {
          await admin.from("swing_trade_checked_tickers").insert(rows);
        } catch (e) {
          console.log(JSON.stringify({ phase: "swing", failure_category: "checked_tickers_insert_failed", message: (e as Error).message }));
        }
      }
    }
  } catch (e) {
    console.log(JSON.stringify({ phase: "swing", failure_category: "persist_failed", message: (e as Error).message }));
  }

  const previous = await loadPrevious(admin);

  console.log(JSON.stringify({
    phase: "swing", event: "done",
    unique_checked: inputs.length,
    selected: selected?.ticker || "no_candidate",
    rejected: rejected.length,
    watch_only: watchOnly.length,
    failed: failed.length,
    cache_hits: totalCacheHits,
    gemini_attempts: totalGeminiAttempts,
    elapsed_ms: Date.now() - started,
  }));

  return {
    runId, modelUsed: primaryModel, uniqueChecked: inputs.length,
    totalSelected: selected ? 1 : 0,
    totalRejected: rejected.length,
    totalWatchOnly: watchOnly.length + needsConf.length + newsUnavailable.length,
    totalFailed: failed.length,
    totalCacheHits, totalGeminiAttempts,
    selected, selectedPlan, passed, rejected, watchOnly: [...watchOnly, ...needsConf, ...newsUnavailable], failed,
    all: results.filter(Boolean) as CheckedTicker[],
    previous,
    elapsedMs: Date.now() - started,
  };
}

async function loadPrevious(admin: SupabaseClient): Promise<SwingResult["previous"]> {
  try {
    const today = tradingDateNY();
    const { data } = await admin
      .from("swing_trade_runs")
      .select("selected_ticker, selected_company, selected_price, run_date, final_status")
      .not("selected_ticker", "is", null)
      .lt("run_date", today)
      .order("run_date", { ascending: false })
      .limit(1);
    const r = data?.[0];
    if (!r || !r.selected_ticker) return null;
    return {
      ticker: r.selected_ticker as string,
      company: r.selected_company as string | undefined,
      selectedDate: r.run_date as string,
      selectedPrice: r.selected_price as number | undefined,
      targetHit: false,
      stopHit: false,
      status: "watching",
    };
  } catch { return null; }
}

// ─── Renderer ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function statusBadge(s: CheckedTicker["status"]): string {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    selected: { label: "Selected", bg: "#dcfce7", color: "#047857" },
    passed_not_selected: { label: "Passed but not selected", bg: "#e0f2fe", color: "#0369a1" },
    rejected: { label: "Rejected", bg: "#fee2e2", color: "#b91c1c" },
    watch_only: { label: "Watch only", bg: "#fef3c7", color: "#92400e" },
    needs_confirmation: { label: "Needs more confirmation", bg: "#fef3c7", color: "#92400e" },
    news_unavailable: { label: "News check unavailable", bg: "#e2e8f0", color: "#475569" },
    deep_check_failed: { label: "Deep check failed", bg: "#e2e8f0", color: "#475569" },
  };
  const m = map[s] || map.needs_confirmation;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${m.bg};color:${m.color};font-size:11px;font-weight:600;">${m.label}</span>`;
}

function checkIcon(v?: string): string {
  if (v === "passed") return "✅";
  if (v === "failed") return "❌";
  if (v === "unavailable") return "❔";
  return "—";
}

function tickerLink(base: string, ticker: string): string {
  if (!base) return esc(ticker);
  return `<a href="${base.replace(/\/+$/, "")}/stock-insight?ticker=${encodeURIComponent(ticker)}&source=stock-email" style="color:#0891b2;text-decoration:none;font-weight:700;">${esc(ticker)}</a>`;
}

export function buildSwingSectionsHTML(r: SwingResult, appBaseUrl: string): string {
  // 🎯 Swing Trader Watch
  const s = r.selected;
  const disclaimer = `<p style="margin:10px 0 0 0;font-size:11px;color:#7f1d1d;line-height:1.5;">This is not financial advice. This setup can fail. Use position sizing, stop discipline, and your own research before making any trade.</p>`;

  let swingBlock = "";
  if (s && s.deep) {
    const d = s.deep;
    const p = r.selectedPlan;
    const fmt = (n?: number) => (typeof n === "number" ? `$${n.toFixed(2)}` : "—");
    const planRows = p ? `
          <tr><td style="padding:3px 0;color:#64748b;">Current price</td><td><strong>${fmt(p.currentPrice)}</strong></td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Entry zone</td><td>${fmt(p.entryLow)} – ${fmt(p.entryHigh)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Target zone</td><td>${fmt(p.targetLow)} – ${fmt(p.targetHigh)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Stop-loss zone</td><td>${fmt(p.stopLoss)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Risk/reward</td><td>${typeof p.riskReward === "number" ? `${p.riskReward.toFixed(2)}R` : "—"}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Expected holding window</td><td>${esc(p.holdingWindow)}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Invalidation</td><td>${esc(p.invalidation)}</td></tr>` : `
          <tr><td style="padding:3px 0;color:#64748b;">Holding window</td><td>3–10 trading days</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Invalidation</td><td>Watch for negative catalyst, break of support, or peer group leading down.</td></tr>`;
    swingBlock = `
      <div style="padding:16px;background:#ffffff;border:1px solid #bae6fd;border-left:4px solid #0891b2;border-radius:10px;">
        <p style="margin:0 0 6px 0;font-size:14px;color:#0c4a6e;font-weight:700;">${tickerLink(appBaseUrl, s.ticker)} · ${esc(s.company)}</p>
        <p style="margin:0 0 8px 0;font-size:12px;color:#475569;">${esc(d.industry || "")}</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;font-size:12px;color:#0f172a;">
          <tr><td style="padding:3px 0;color:#64748b;">Setup type</td><td>${esc(d.swing_suitability || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;">Confidence</td><td>${esc(d.confidence || "—")}</td></tr>
          ${planRows}
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Latest catalyst</td><td>${esc(d.latest_catalyst || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Peer / competitor context</td><td>${esc(d.peer_context || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Industry context</td><td>${esc(d.industry_context || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Key risks</td><td>${(d.key_risks || []).map(esc).join("; ") || "—"}</td></tr>
        </table>
        ${Array.isArray(d.sources) && d.sources.length > 0 ? `<p style="margin:8px 0 0 0;font-size:11px;color:#475569;">Sources: ${d.sources.slice(0, 4).map((x) => `<a href="${esc(x.url)}" style="color:#0891b2;">${esc(x.title || "source")}</a>`).join(" · ")}</p>` : ""}
        ${disclaimer}
      </div>`;
  } else {
    // Distinguish "all checks failed" (Gemini rate limit / model error) from
    // "checks completed but nothing qualified".
    const noRealChecks = r.uniqueChecked > 0 && r.totalFailed >= r.uniqueChecked;
    if (noRealChecks) {
      swingBlock = `
      <div style="padding:16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#9a3412;font-weight:700;">🎯 Swing Trader Watch unavailable for this run</p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#7c2d12;line-height:1.6;">Deep checks could not complete (likely Gemini rate limit or model error). Existing stock tables below are unchanged.</p>
        ${disclaimer}
      </div>`;
    } else {
      swingBlock = `
      <div style="padding:16px;background:#ffffff;border:1px dashed #cbd5e1;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#0f172a;font-weight:700;">No high-quality swing setup today.</p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#475569;line-height:1.6;">All checked stocks were rejected because they were extended, lacked clean risk/reward, had weak volume, had no clear target, or did not pass fresh news, peer, industry, or risk checks.</p>
        ${disclaimer}
      </div>`;
    }
  }

  const swingSection = `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">🎯 Swing Trader Watch <span style="font-weight:400;color:#64748b;font-size:13px;">(3–10 trading day watch)</span></h3>
    ${swingBlock}`;

  // 🔎 Tickers Checked Today (top 10 rows)
  const combined = [
    ...(r.selected ? [r.selected] : []),
    ...r.passed, ...r.rejected, ...r.watchOnly, ...r.failed,
  ].slice(0, 10);

  const rowsHtml = combined.map((t) => {
    const d = t.deep;
    const checks = d
      ? `Tech ✅ · News ${checkIcon(d.news_check)} · Peers ${checkIcon(d.peer_check)} · Industry ${checkIcon(d.industry_check)} · Risk ${checkIcon(d.risk_check)}`
      : "Deep check failed";
    const reason = t.rejectionReason || (d?.news_check === "unavailable" ? "Fresh news check unavailable" : (d?.positive_factors?.[0] || ""));
    return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;">${tickerLink(appBaseUrl, t.ticker)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;">${esc(t.company)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${statusBadge(t.status)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${esc(checks)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${esc(reason || "—")}</td>
      </tr>`;
  }).join("");

  const checkedSection = `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">🔎 Tickers Checked Today</h3>
    <p style="margin:0 0 8px 0;font-size:12px;color:#475569;">Full checked ticker count: ${r.uniqueChecked} unique tickers · ${r.totalCacheHits} cache hits · ${r.totalGeminiAttempts} deep checks · ${r.totalRejected} rejected · ${r.totalWatchOnly} watch only · ${r.totalFailed} failed.</p>
    <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">TICKER</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">COMPANY</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">STATUS</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">CHECKS</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">REASON</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" style="padding:12px;color:#64748b;">No tickers checked.</td></tr>`}</tbody>
      </table>
    </div>`;

  // 📌 Previous Swing Candidate Check
  const p = r.previous;
  const prevSection = p ? `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">📌 Previous Swing Candidate Check</h3>
    <div style="padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#78350f;">
      Last candidate: <strong>${tickerLink(appBaseUrl, p.ticker)}</strong>${p.company ? ` · ${esc(p.company)}` : ""} · selected on ${esc(p.selectedDate)}${typeof p.selectedPrice === "number" ? ` at $${p.selectedPrice.toFixed(2)}` : ""}. Status: <strong>${esc(p.status)}</strong>. Target hit: ${p.targetHit ? "yes" : "no"} · Stop hit: ${p.stopHit ? "yes" : "no"}.
    </div>` : "";

  return `${swingSection}\n${checkedSection}\n${prevSection}`;
}
