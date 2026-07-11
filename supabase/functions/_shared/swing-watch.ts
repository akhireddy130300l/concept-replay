// Swing Trader Watch engine + email renderer.
// v2: Uses Exa Search (EXA_API_KEY) for fresh news/context + deterministic
// keyword scoring. No Gemini, no Google Search grounding.
//
// - One Exa query per unique ticker.
// - Per-trading-day cache in swing_ticker_cache (model="exa", source_type="swing_deep_check").
// - On Exa rate-limit/error/timeout: stop remaining tickers, mark them
//   "skipped_due_to_exa_limit", still send the normal stock email.
// - If EXA_API_KEY missing: no calls, show "Swing Trader Watch unavailable"
//   with reason=missing_exa_api_key.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchFinnhubBundle, scoreFinnhub, type FinnhubBundle, type FinnhubScoring } from "./finnhub-swing.ts";
import { saveTrainingExamples, updateOutcomes, getMLTrainingStats, buildMLTrainingSectionHTML, type MLTrainingStats } from "./swing-ml.ts";

export type SwingTickerInput = {
  ticker: string;
  company: string;
  price?: number;
  oneDayPct?: number;
  sevenDayPct?: number;
  twentyDayPct?: number;
  volumeRatio?: number;
  marketCap?: number;
  analystLabel?: string;
  watchlistScore?: number;
  entryStatus?: string;
  lowerWatch?: number;
  upperWatch?: number;
  riskRewardRaw?: number;
  riskFlags?: string[];
  sourceTables: string[];
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
  legal_classification?: "generic_law_firm_noise" | "material_company_lawsuit" | "regulatory_investigation" | null;
  swing_suitability?: "strong_candidate" | "possible_candidate" | "watch_only" | "rejected" | "needs_confirmation";
  rejection_reason?: string;
  confidence?: "Low" | "Medium" | "High";
  sources?: { title: string; url: string; published?: string }[];
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
    | "deep_check_failed"
    | "skipped_due_to_exa_limit";
  rejectionReason?: string;
  deep?: SwingDeepCheck;
  cacheHit: boolean;
  elapsedMs: number;
  modelUsed: string;
  bestWindow: string;
  finnhub?: (FinnhubScoring & { available: boolean; peerCount: number }) | null;
  selectionBlocker?: string | null;
  nearMiss?: boolean;
  gapToSelected?: number | null;
};


export type SwingUnavailableReason =
  | "missing_exa_api_key"
  | "exa_rate_limited"
  | "exa_error"
  | "exa_timeout";

export type SwingResult = {
  runId?: string;
  modelUsed: string;
  uniqueChecked: number;
  totalSelected: number;
  totalPassedNotSelected: number;
  totalRejected: number;
  totalWatchOnly: number;
  totalFailed: number;
  totalSkipped: number;
  totalCacheHits: number;
  totalExaAttempts: number;
  unavailableReason?: SwingUnavailableReason;
  selected?: CheckedTicker;
  selectedPlan?: TradingPlan;
  passed: CheckedTicker[];
  rejected: CheckedTicker[];
  watchOnly: CheckedTicker[];
  failed: CheckedTicker[];
  skipped: CheckedTicker[];
  all: CheckedTicker[];
  mlStats?: MLTrainingStats;
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

const PROVIDER = "exa";
const EXA_URL = "https://api.exa.ai/search";
const EXA_TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS = 400; // gentle pacing between Exa calls

// Cache bucket resets daily at 8:00 AM America/New_York.
// Before 8 AM ET on date D, bucket = D-1. At/after 8 AM ET, bucket = D.
function swingCacheBucket(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === "year")!.value;
  const mo = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  const h = Number(parts.find(p => p.type === "hour")!.value);
  let bucket = `${y}-${mo}-${d}`;
  if (h < 8) {
    const dt = new Date(`${bucket}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - 1);
    bucket = dt.toISOString().slice(0, 10);
  }
  return bucket;
}

function nowETString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(now);
}

// Legacy alias — trading-day-like key used across the codebase.
function tradingDateNY(): string { return swingCacheBucket(); }

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

function preScore(t: SwingTickerInput): { technical: number; risk: number } {
  let tech = 5;
  if (typeof t.oneDayPct === "number") {
    if (t.oneDayPct > 15) tech -= 2;
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

// ─── Exa Search ──────────────────────────────────────────────────────────

type ExaResult = { title?: string; url?: string; publishedDate?: string; highlights?: string[] };
type ExaCallOutcome =
  | { ok: true; results: ExaResult[] }
  | { ok: false; failure: SwingUnavailableReason; httpStatus?: number };

// Multi-window evaluator: picks the best holding window (3–10, 11–20, 20–40+
// sessions) for a ticker using its 1d/7d/20d moves and volume/RR context.
// Fully deterministic, no extra API calls.
function evaluateBestWindow(t: SwingTickerInput): {
  window: string;
  reason: string;
} {
  const v1 = typeof t.oneDayPct === "number" ? t.oneDayPct : NaN;
  const v7 = typeof t.sevenDayPct === "number" ? t.sevenDayPct : NaN;
  const v20 = typeof t.twentyDayPct === "number" ? t.twentyDayPct : NaN;
  const vol = typeof t.volumeRatio === "number" ? t.volumeRatio : NaN;
  const rr = typeof t.riskRewardRaw === "number" ? t.riskRewardRaw : NaN;

  // Longer swing: 20-day trend clearly up but not overextended in 7d.
  if (Number.isFinite(v20) && v20 > 8 && (!Number.isFinite(v7) || v7 < 15)) {
    return { window: "20–40+ sessions", reason: "Sustained 20-session uptrend without near-term overextension." };
  }
  // Medium swing: strong 7-day trend, moderate 1-day.
  if (Number.isFinite(v7) && v7 > 4 && (!Number.isFinite(v1) || v1 < 10)) {
    return { window: "11–20 sessions", reason: "Constructive 7-session trend with room to run." };
  }
  // Short swing: fresh 1-day breakout with volume/RR support.
  if (Number.isFinite(v1) && v1 > 2 && ((Number.isFinite(vol) && vol > 1.2) || (Number.isFinite(rr) && rr >= 2))) {
    return { window: "3–10 sessions", reason: "Fresh breakout with above-average volume or ≥2R setup." };
  }
  if (Number.isFinite(v1) || Number.isFinite(v7) || Number.isFinite(v20)) {
    return { window: "3–10 sessions", reason: "Default short-swing window (limited multi-window signal)." };
  }
  return { window: "N/A", reason: "Insufficient trend data to evaluate a window." };
}

function buildExaQuery(t: SwingTickerInput): string {
  return `${t.ticker} ${t.company} stock latest news earnings analyst upgrade downgrade lawsuit regulation competitors industry today`;
}

async function callExa(query: string, apiKey: string): Promise<ExaCallOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), EXA_TIMEOUT_MS);
  try {
    const res = await fetch(EXA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 10,
        contents: { highlights: { numSentences: 3, highlightsPerUrl: 3 } },
      }),
      signal: ctrl.signal,
    });
    if (res.status === 429) { await res.text().catch(() => ""); return { ok: false, failure: "exa_rate_limited", httpStatus: 429 }; }
    if (!res.ok) { await res.text().catch(() => ""); return { ok: false, failure: "exa_error", httpStatus: res.status }; }
    const json: any = await res.json().catch(() => null);
    const results: ExaResult[] = Array.isArray(json?.results) ? json.results : [];
    return { ok: true, results };
  } catch (e) {
    const name = (e as Error)?.name || "";
    if (name === "AbortError") return { ok: false, failure: "exa_timeout" };
    return { ok: false, failure: "exa_error" };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Deterministic keyword analysis ──────────────────────────────────────

const POSITIVE_SIGNALS: { rx: RegExp; label: string }[] = [
  { rx: /\braise[sd]?\s+(?:full[- ]?year\s+)?outlook|guidance\s+raise[sd]?|raise[sd]?\s+guidance\b/i, label: "raised outlook" },
  { rx: /\bbeat[s]?\s+(?:on\s+)?earnings|earnings\s+beat|beat\s+estimates|tops?\s+estimates\b/i, label: "beat earnings" },
  { rx: /\bupgrade[sd]?\b/i, label: "upgraded" },
  { rx: /\bprice\s+target\s+(?:raise[sd]?|hike[sd]?|lift(?:ed)?|increase[sd]?)\b/i, label: "price target raised" },
  { rx: /\bstrong\s+demand\b/i, label: "strong demand" },
  { rx: /\brevenue\s+growth\b/i, label: "revenue growth" },
  { rx: /\b(?:record\s+)?deliver(?:y|ies)\s+growth|deliveries?\s+jump\b/i, label: "delivery growth" },
  { rx: /\bfda\s+approv(?:al|ed|es)\b/i, label: "FDA approval" },
  { rx: /\bpositive\s+(?:phase\s+\d+\s+)?trial\s+(?:data|results)|hit\s+primary\s+endpoint\b/i, label: "positive trial data" },
  { rx: /\bpartnership\s+with\b/i, label: "partnership" },
  { rx: /\bcontract\s+win|awarded\s+contract\b/i, label: "contract win" },
  { rx: /\bindex\s+inclusion|added\s+to\s+(?:the\s+)?s&p\b/i, label: "index inclusion" },
  { rx: /\bmargin\s+(?:improvement|expansion)|expanding\s+margins\b/i, label: "margin improvement" },
];

const NEGATIVE_SIGNALS: { rx: RegExp; label: string }[] = [
  { rx: /\blawsuit|sued\b|class[- ]action\b/i, label: "lawsuit" },
  { rx: /\b(?:sec|doj|ftc)\s+investigation|investigat(?:ion|ing)\b/i, label: "investigation" },
  { rx: /\bdowngrade[sd]?\b/i, label: "downgrade" },
  { rx: /\bprice\s+target\s+(?:cut|lowered|reduced)\b/i, label: "price target cut" },
  { rx: /\bearnings\s+miss|miss(?:es|ed)?\s+estimates\b/i, label: "earnings miss" },
  { rx: /\bguidance\s+cut|cut\s+guidance|lowered\s+outlook\b/i, label: "guidance cut" },
  { rx: /\bfda\s+reject(?:ion|ed|s)\b|crl\b/i, label: "FDA rejection" },
  { rx: /\btrial\s+failure|failed\s+(?:phase\s+\d+\s+)?trial|missed\s+primary\s+endpoint\b/i, label: "trial failure" },
  { rx: /\bregulatory\s+(?:issue|action|scrutiny)\b/i, label: "regulatory issue" },
  { rx: /\bcash\s+burn\b/i, label: "cash burn" },
  { rx: /\bdebt\s+(?:concern|load|burden)\b/i, label: "debt concern" },
  { rx: /\binsider\s+selling\b/i, label: "insider selling" },
  { rx: /\bcompetition\s+(?:pressure|intensif)|competitive\s+pressure\b/i, label: "competition pressure" },
  { rx: /\bweak\s+demand|slowing\s+demand\b/i, label: "weak demand" },
  { rx: /\bmargin\s+(?:pressure|compression|contraction)\b/i, label: "margin pressure" },
  { rx: /\brecall(?:ed|s)?\b/i, label: "recall" },
  { rx: /\bbankruptcy\s+(?:risk|filing|protection)\b/i, label: "bankruptcy risk" },
];

const SERIOUS_NEGATIVES = new Set([
  "lawsuit", "investigation", "FDA rejection", "trial failure",
  "regulatory issue", "guidance cut", "earnings miss", "bankruptcy risk", "recall",
]);

// Generic law-firm/class-action solicitation noise: shareholder alerts, law-firm
// press releases, "investigation on behalf of" — do NOT auto-reject on these.
const GENERIC_LEGAL_RX = /shareholder\s+alert|encourages?\s+investors|investigation\s+on\s+behalf\s+of|contact(?:\s+us)?\s+(?:to\s+discuss|about\s+your)|notice\s+of\s+pendency|(?:rosen|schall|pomerantz|bragar\s+eagel|levi\s*&\s*korsinsky|robbins\s+geller|kessler\s+topaz|faruqi|kirby\s+mcinerney|hagens\s+berman|glancy\s+prongay|bronstein\s+gewirtz|holzer|johnson\s+fistel|the\s+gross\s+law|schall\s+law|the\s+klein\s+law)\s+(?:law|firm|pllc|llp)?|law\s+firm\s+(?:investigating|announces)|deadline\s+to\s+(?:contact|join)\s+(?:the\s+)?law|lead\s+plaintiff\s+deadline|class[- ]action\s+(?:reminder|deadline)/i;

// Material company-specific legal/regulatory risk indicators.
const MATERIAL_LEGAL_RX = /sec\s+(?:charges|files|complaint|enforcement|subpoena|fines?)|doj\s+(?:charges|indict|investigation|probe)|ftc\s+(?:sues|complaint|blocks)|(?:court|judge)\s+(?:ruling|orders?|verdict|judgment|injunction)|jury\s+(?:verdict|awards)|settle(?:s|d|ment)\s+(?:for\s+)?\$|files?\s+for\s+bankruptcy|antitrust\s+(?:lawsuit|charges|suit|action)|patent\s+infringement\s+(?:verdict|ruling)|guilty\s+plea|criminal\s+(?:charges|indictment)/i;

const LAWSUIT_HIT_RX = /\blawsuit|sued\b|class[- ]action\b/i;

type LegalClassification = SwingDeepCheck["legal_classification"];

function classifyLegalRisk(results: ExaResult[]): { classification: LegalClassification; materialSourceUrl?: string } {
  let sawGeneric = false;
  let sawMaterial = false;
  let materialUrl: string | undefined;
  const CREDIBLE_HOST_RX = /(sec\.gov|reuters\.com|bloomberg\.com|wsj\.com|ft\.com|nytimes\.com|cnbc\.com|apnews\.com)/i;

  for (const r of results) {
    const title = String(r?.title || "");
    const highlights = Array.isArray(r?.highlights) ? r.highlights.join(" ") : "";
    const combined = `${title} ${highlights}`;
    if (!LAWSUIT_HIT_RX.test(combined) && !/investigat(?:ion|ing)/i.test(combined)) continue;
    const isGeneric = GENERIC_LEGAL_RX.test(combined);
    const isMaterial = MATERIAL_LEGAL_RX.test(combined) || (CREDIBLE_HOST_RX.test(String(r?.url || "")) && !isGeneric);
    if (isMaterial) { sawMaterial = true; materialUrl = materialUrl || r?.url; }
    else if (isGeneric) sawGeneric = true;
  }
  if (sawMaterial) return { classification: "material_company_lawsuit", materialSourceUrl: materialUrl };
  if (sawGeneric) return { classification: "generic_law_firm_noise" };
  return { classification: null };
}

const SERIOUS_REASON_MAP: Record<string, string> = {
  "lawsuit": "Material legal/regulatory risk confirmed",
  "investigation": "SEC/DOJ/FTC investigation reported",
  "FDA rejection": "Material regulatory issue confirmed (FDA rejection)",
  "trial failure": "Clinical trial failure reported",
  "regulatory issue": "Material regulatory issue confirmed",
  "guidance cut": "Earnings/guidance risk outweighs setup (guidance cut)",
  "earnings miss": "Earnings/guidance risk outweighs setup (earnings miss)",
  "bankruptcy risk": "Bankruptcy risk reported",
  "recall": "Product recall reported",
};

function analyseExaResults(input: SwingTickerInput, results: ExaResult[]): SwingDeepCheck {
  const positive = new Set<string>();
  const negative = new Set<string>();
  const catalystSnippets: string[] = [];
  const peerSnippets: string[] = [];
  const industrySnippets: string[] = [];
  const sources: { title: string; url: string; published?: string }[] = [];

  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  let hasRecent = false;

  for (const r of results) {
    if (!r?.url) continue;
    const title = String(r.title || "");
    const highlights = Array.isArray(r.highlights) ? r.highlights.map((h) => String(h || "")) : [];
    const combined = [title, ...highlights].join(" \n ");
    if (!combined.trim()) continue;

    if (r.publishedDate) {
      const ts = Date.parse(r.publishedDate);
      if (Number.isFinite(ts) && now - ts <= fourteenDays) hasRecent = true;
    }

    for (const p of POSITIVE_SIGNALS) if (p.rx.test(combined)) positive.add(p.label);
    for (const n of NEGATIVE_SIGNALS) if (n.rx.test(combined)) negative.add(n.label);

    const snip = (highlights[0] || title).slice(0, 240).trim();
    if (snip) {
      if (/\bpeer|competitor|rival|vs\s+[A-Z]{2,}/i.test(combined)) peerSnippets.push(snip);
      else if (/\bindustry|sector|market\s+(?:for|of)\b/i.test(combined)) industrySnippets.push(snip);
      else catalystSnippets.push(snip);
    }
    if (sources.length < 8) {
      sources.push({ title: title || r.url, url: r.url, published: r.publishedDate });
    }
  }

  // ── Legal risk classification (generic law-firm noise vs material) ────
  let legalClassification: LegalClassification = null;
  if (negative.has("lawsuit") || negative.has("investigation")) {
    const { classification } = classifyLegalRisk(results);
    legalClassification = classification;
    console.log(`[risk-classifier] ticker=${input.ticker} legal_classification=${classification ?? "unclassified"} material=${classification === "material_company_lawsuit"}`);
    if (classification === "generic_law_firm_noise") {
      // Downgrade: not serious, not counted as negative.
      negative.delete("lawsuit");
      negative.delete("investigation");
      negative.add("generic lawsuit noise");
    } else if (classification === "material_company_lawsuit") {
      // Keep 'lawsuit' as a serious red flag.
    } else if (!classification) {
      // Neither generic nor material clearly confirmed — treat as caution, not auto-reject.
      negative.delete("lawsuit");
      negative.add("unconfirmed legal mention");
    }
  }

  const redFlags = Array.from(negative).filter((n) => SERIOUS_NEGATIVES.has(n));
  const hasSerious = redFlags.length > 0;
  const negScore = negative.size;
  const posScore = positive.size;

  const news_check: "passed" | "failed" | "unavailable" =
    results.length === 0 ? "unavailable"
    : hasSerious ? "failed"
    : hasRecent || sources.length > 0 ? "passed"
    : "unavailable";

  const risk_check: "passed" | "failed" | "unavailable" =
    hasSerious ? "failed" : negScore >= 3 ? "failed" : "passed";

  const peer_check: "passed" | "failed" | "unavailable" =
    peerSnippets.length > 0 ? "passed" : "unavailable";
  const industry_check: "passed" | "failed" | "unavailable" =
    industrySnippets.length > 0 ? "passed" : "unavailable";

  let suitability: SwingDeepCheck["swing_suitability"];
  let rejection: string | undefined;

  if (hasSerious) {
    suitability = "rejected";
    rejection = redFlags.map((f) => SERIOUS_REASON_MAP[f] || `Material risk: ${f}`).join("; ");
  } else if (negScore > posScore && negScore >= 2) {
    suitability = "rejected";
    const topNeg = Array.from(negative).slice(0, 3).join(", ");
    rejection = `News mixed; ${negScore} negative signals (${topNeg}) outweigh ${posScore} positive.`;
  } else if (posScore >= 2 && negScore === 0) {
    suitability = "strong_candidate";
  } else if (posScore >= 1 && negScore <= 1) {
    suitability = "possible_candidate";
  } else if (news_check === "unavailable") {
    suitability = "needs_confirmation";
  } else if (legalClassification === "generic_law_firm_noise" && posScore === 0) {
    suitability = "watch_only";
    rejection = "Generic lawsuit noise ignored; no clean fresh catalyst found.";
  } else {
    suitability = "watch_only";
  }

  const confidence: "Low" | "Medium" | "High" =
    hasSerious ? "Low" :
    legalClassification === "generic_law_firm_noise" ? "Medium" :
    posScore >= 3 && negScore === 0 ? "High" :
    posScore >= 1 ? "Medium" : "Low";

  const cleanCatalyst =
    catalystSnippets.find((s) => !LAWSUIT_HIT_RX.test(s)) ||
    (positive.size > 0 ? `Positive signals: ${Array.from(positive).join(", ")}.` : "") ||
    (legalClassification === "generic_law_firm_noise" ? "No clean fresh catalyst found (only generic legal noise)." : "No fresh catalyst detected.");

  return {
    ticker: input.ticker,
    company: input.company,
    latest_catalyst: cleanCatalyst,
    news_check,
    peer_check,
    industry_check,
    risk_check,
    fundamental_check: "unavailable",
    peer_context: peerSnippets[0] || "",
    industry_context: industrySnippets[0] || "",
    key_risks: Array.from(negative),
    red_flags: redFlags,
    positive_factors: Array.from(positive),
    legal_classification: legalClassification,
    swing_suitability: suitability,
    rejection_reason: rejection,
    confidence,
    sources: sources.slice(0, 6),
  };
}

function scoreDeep(deep: SwingDeepCheck): { news: number; peer: number; industry: number; risk: number } {
  const s = (c?: string) => (c === "passed" ? 8 : c === "unavailable" ? 4 : 1);
  let risk = s(deep.risk_check);
  if (Array.isArray(deep.red_flags) && deep.red_flags.length > 0) risk = Math.max(0, risk - 2);
  const posBoost = Math.min(2, (deep.positive_factors?.length ?? 0) * 0.5);
  return {
    news: Math.min(10, s(deep.news_check) + posBoost),
    peer: s(deep.peer_check),
    industry: s(deep.industry_check),
    risk,
  };
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

function computeTradingPlan(t: SwingTickerInput, _d: SwingDeepCheck): TradingPlan | null {
  const price = typeof t.price === "number" && t.price > 0 ? t.price : NaN;
  if (!Number.isFinite(price)) return null;
  const lower = typeof t.lowerWatch === "number" && t.lowerWatch > 0 ? t.lowerWatch : NaN;
  const upper = typeof t.upperWatch === "number" && t.upperWatch > 0 ? t.upperWatch : NaN;

  let entryLow: number, entryHigh: number, targetLow: number, targetHigh: number, stopLoss: number;
  if (Number.isFinite(lower) && Number.isFinite(upper) && upper > lower) {
    entryHigh = Math.min(price, upper);
    entryLow = Math.max(lower, Math.min(price * 0.98, entryHigh));
    if (entryLow >= entryHigh) entryLow = round2(entryHigh * 0.98);
    targetHigh = upper;
    targetLow = round2(price + (upper - price) * 0.6);
    if (targetLow <= entryHigh) targetLow = round2(entryHigh * 1.03);
    stopLoss = round2(lower * 0.98);
  } else {
    entryHigh = price;
    entryLow = round2(price * 0.98);
    targetLow = round2(price * 1.06);
    targetHigh = round2(price * 1.10);
    stopLoss = round2(price * 0.97);
  }
  if (!(stopLoss > 0 && stopLoss < entryLow && targetLow > entryHigh)) return null;

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

// ─── Per-ticker runner ───────────────────────────────────────────────────

async function runOne(
  admin: SupabaseClient,
  input: SwingTickerInput,
  apiKey: string,
  today: string,
): Promise<{ result: CheckedTicker; exaFailure?: SwingUnavailableReason }> {
  const t0 = Date.now();
  const pre = preScore(input);

  // Cache lookup.
  const { data: cacheRow } = await admin
    .from("swing_ticker_cache")
    .select("payload, model")
    .eq("ticker", input.ticker)
    .eq("trading_date", today)
    .eq("model", PROVIDER)
    .eq("source_type", "swing_deep_check")
    .maybeSingle();

  let deep: SwingDeepCheck | null = null;
  let cacheHit = false;
  let exaFailure: SwingUnavailableReason | undefined;
  const bw = evaluateBestWindow(input);

  if (cacheRow) {
    deep = cacheRow.payload as SwingDeepCheck;
    cacheHit = true;
    let ageMin: number | null = null;
    try {
      const created = (cacheRow as any).updated_at || (cacheRow as any).created_at;
      if (created) ageMin = Math.round((Date.now() - new Date(created).getTime()) / 60000);
    } catch { /* noop */ }
    console.log(`[swing-cache] hit ticker=${input.ticker} provider=${PROVIDER} cache_bucket=${today}${ageMin !== null ? ` age_minutes=${ageMin}` : ""}`);
  } else {
    console.log(`[swing-cache] fresh_search ticker=${input.ticker} provider=${PROVIDER} cache_bucket=${today}`);
    const query = buildExaQuery(input);
    const started = Date.now();
    const out = await callExa(query, apiKey);
    console.log(JSON.stringify({
      feature: "swing_trader_watch", ticker: input.ticker, provider: PROVIDER,
      exa_finished: true, ok: out.ok, status: (out as any).httpStatus ?? null,
      results: out.ok ? out.results.length : 0, elapsed_ms: Date.now() - started,
    }));

    if (!out.ok) {
      exaFailure = out.failure;
    } else {
      deep = analyseExaResults(input, out.results);
      try {
        await admin.from("swing_ticker_cache").upsert({
          ticker: input.ticker,
          trading_date: today,
          model: PROVIDER,
          source_type: "swing_deep_check",
          payload: deep,
        });
      } catch (e) {
        console.log(JSON.stringify({ phase: "swing", ticker: input.ticker, cache_upsert_failed: (e as Error).message }));
      }
    }
  }

  // Finnhub structured data (non-fatal, cached).
  let finnhubBundle: FinnhubBundle | null = null;
  let finnhubScoring: FinnhubScoring | null = null;
  try {
    finnhubBundle = await fetchFinnhubBundle(admin, input.ticker);
    if (finnhubBundle.available) {
      finnhubScoring = scoreFinnhub(finnhubBundle, input.price, input.oneDayPct);
    } else {
      console.log(`[finnhub] ticker=${input.ticker} finnhub_unavailable reason=${finnhubBundle.reason || "unknown"}`);
    }
  } catch (e) {
    console.log(`[finnhub] ticker=${input.ticker} finnhub_unavailable reason=${(e as Error).message}`);
  }
  const finnhubMeta = finnhubScoring
    ? { ...finnhubScoring, available: true, peerCount: finnhubBundle?.peers?.length || 0 }
    : { peerScore: 0, peerConfirmation: "Peer confirmation: Not available", peerLabel: "not_available" as const,
        analystScore: 0, analystContext: "Analyst context: Not available", analystLabel: "not_available" as const,
        buyCount: 0, holdCount: 0, sellCount: 0, available: false, peerCount: 0 };

  if (!deep) {
    return {
      result: {
        ticker: input.ticker,
        company: input.company,
        sourceTables: input.sourceTables,
        technicalScore: pre.technical,
        newsScore: 0, peerScore: finnhubMeta.peerScore, industryScore: 0,
        riskScore: pre.risk,
        finalScore: pre.technical + pre.risk,
        status: "deep_check_failed",
        rejectionReason: exaFailure || "Deep check failed",
        cacheHit,
        elapsedMs: Date.now() - t0,
        modelUsed: PROVIDER,
        bestWindow: bw.window,
        finnhub: finnhubMeta,
      },
      exaFailure,
    };
  }

  const d = scoreDeep(deep);
  const status: CheckedTicker["status"] =
    deep.news_check === "unavailable" && deep.swing_suitability !== "rejected"
      ? "news_unavailable"
      : statusFromSuitability(deep.swing_suitability);

  // Blend Finnhub sector/industry back into deep view.
  if (finnhubScoring?.industry) deep.industry = finnhubScoring.industry;

  // Weighted final score. If Finnhub unavailable, redistribute across tech/exa.
  const techNorm = pre.technical / 10;
  const newsNorm = d.news / 10;
  const riskNorm = ((d.risk + pre.risk) / 2) / 10;
  const peerNorm = finnhubMeta.available ? finnhubMeta.peerScore / 10 : 0;
  const analystNorm = finnhubMeta.available ? finnhubMeta.analystScore / 10 : 0;
  const weights = finnhubMeta.available
    ? { tech: 0.35, news: 0.25, risk: 0.15, peer: 0.10, analyst: 0.10, learn: 0.05 }
    : { tech: 0.45, news: 0.30, risk: 0.20, peer: 0.00, analyst: 0.00, learn: 0.05 };
  const finalScore = (
    techNorm * weights.tech +
    newsNorm * weights.news +
    riskNorm * weights.risk +
    peerNorm * weights.peer +
    analystNorm * weights.analyst +
    0.5 * weights.learn
  ) * 10;

  // Refine confidence downward if Finnhub strongly contradicts the trade.
  if (deep.confidence === "High" && finnhubMeta.available) {
    if (finnhubMeta.analystLabel === "negative" || finnhubMeta.peerLabel === "negative") {
      deep.confidence = "Medium";
    }
    if (finnhubMeta.targetSupportsTrade === false && typeof finnhubMeta.targetUpsidePct === "number" && finnhubMeta.targetUpsidePct < -3) {
      deep.confidence = "Low";
    }
  }

  // Legal-noise refinement is now handled in analyseExaResults via
  // legal_classification. Keep the deep.rejection_reason as-is.
  const refinedReason = deep.rejection_reason || undefined;

  return {
    result: {
      ticker: input.ticker,
      company: input.company,
      sourceTables: input.sourceTables,
      technicalScore: pre.technical,
      newsScore: d.news,
      peerScore: finnhubMeta.available ? finnhubMeta.peerScore : d.peer,
      industryScore: d.industry,
      riskScore: (d.risk + pre.risk) / 2,
      finalScore,
      status,
      rejectionReason: refinedReason,
      deep,
      cacheHit,
      elapsedMs: Date.now() - t0,
      modelUsed: PROVIDER,
      bestWindow: bw.window,
      finnhub: finnhubMeta,
    },
  };
}

function makeSkipped(input: SwingTickerInput, reason: SwingUnavailableReason): CheckedTicker {
  const pre = preScore(input);
  const bw = evaluateBestWindow(input);
  return {
    ticker: input.ticker,
    company: input.company,
    sourceTables: input.sourceTables,
    technicalScore: pre.technical,
    newsScore: 0, peerScore: 0, industryScore: 0,
    riskScore: pre.risk,
    finalScore: 0,
    status: "skipped_due_to_exa_limit",
    rejectionReason: reason,
    cacheHit: false,
    elapsedMs: 0,
    modelUsed: PROVIDER,
    bestWindow: bw.window,
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────

export async function runSwingTraderWatch(
  admin: SupabaseClient,
  rawInputs: SwingTickerInput[],
  emailRunId?: string,
  userId?: string,
): Promise<SwingResult> {
  const started = Date.now();
  const apiKey = Deno.env.get("EXA_API_KEY") || "";
  const today = swingCacheBucket();
  const inputs = dedupeInputs(rawInputs);

  // Best-effort outcome update for older training examples. Never blocks email.
  try { await updateOutcomes(admin); } catch (e) {
    console.log(`[ml-training] outcome_update_wrapper_failed reason=${(e as Error).message}`);
  }

  console.log(`[swing-cache] now_et=${nowETString()} cache_bucket=${today} unique_tickers=${inputs.length}`);
  console.log(JSON.stringify({ phase: "swing", event: "start", provider: PROVIDER, unique_tickers: inputs.length, has_key: !!apiKey, cache_bucket: today, has_finnhub_key: !!Deno.env.get("FINNHUB_API_KEY") }));

  const emptyBase = (): Omit<SwingResult, "previous" | "elapsedMs"> => ({
    modelUsed: PROVIDER, uniqueChecked: inputs.length,
    totalSelected: 0, totalPassedNotSelected: 0, totalRejected: 0, totalWatchOnly: 0, totalFailed: 0, totalSkipped: 0,
    totalCacheHits: 0, totalExaAttempts: 0,
    passed: [], rejected: [], watchOnly: [], failed: [], skipped: [], all: [],
  });

  if (!apiKey) {
    return {
      ...emptyBase(),
      unavailableReason: "missing_exa_api_key",
      previous: await loadPrevious(admin),
      elapsedMs: Date.now() - started,
    };
  }
  if (inputs.length === 0) {
    return { ...emptyBase(), previous: await loadPrevious(admin), elapsedMs: Date.now() - started };
  }

  const results: CheckedTicker[] = [];
  let exaFailureSeen: SwingUnavailableReason | undefined;
  let lastStart = 0;
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    if (exaFailureSeen) {
      results.push(makeSkipped(inp, exaFailureSeen));
      continue;
    }
    const wait = Math.max(0, REQUEST_DELAY_MS - (Date.now() - lastStart));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    try {
      const { result, exaFailure } = await runOne(admin, inp, apiKey, today);
      results.push(result);
      if (exaFailure) {
        exaFailureSeen = exaFailure;
        console.log(JSON.stringify({ phase: "swing", event: "exa_stop", reason: exaFailure, remaining: inputs.length - i - 1 }));
      }
    } catch (e) {
      console.log(JSON.stringify({ phase: "swing", ticker: inp.ticker, runOne_threw: (e as Error).message }));
      results.push(makeSkipped(inp, "exa_error"));
      exaFailureSeen = "exa_error";
    }
  }

  const rejected: CheckedTicker[] = [];
  const watchOnly: CheckedTicker[] = [];
  const failed: CheckedTicker[] = [];
  const passed: CheckedTicker[] = [];
  const needsConf: CheckedTicker[] = [];
  const newsUnavailable: CheckedTicker[] = [];
  const skipped: CheckedTicker[] = [];
  for (const r of results) {
    if (!r) continue;
    if (r.status === "rejected") rejected.push(r);
    else if (r.status === "watch_only") watchOnly.push(r);
    else if (r.status === "deep_check_failed") failed.push(r);
    else if (r.status === "needs_confirmation") needsConf.push(r);
    else if (r.status === "news_unavailable") newsUnavailable.push(r);
    else if (r.status === "skipped_due_to_exa_limit") skipped.push(r);
    else passed.push(r);
  }

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
    if (typeof plan.riskReward === "number" && plan.riskReward < 2) continue;
    selected = cand;
    selectedPlan = plan;
    break;
  }
  if (selected) {
    selected.status = "selected";
    const idx = passed.indexOf(selected);
    if (idx >= 0) passed.splice(idx, 1);
    if (selectedPlan && selected.bestWindow && selected.bestWindow !== "N/A") {
      selectedPlan.holdingWindow = selected.bestWindow;
    }
  }
  // Any remaining "passed" rows are strong candidates that lost the tie-break.
  for (const p of passed) {
    if (p.status !== "passed_not_selected") p.status = "passed_not_selected";
  }

  // Classify why each non-selected ticker was not picked, and mark near-misses.
  const selectedScore = selected?.finalScore ?? null;
  const classifyBlocker = (t: CheckedTicker): string | null => {
    if (t.status === "selected") return null;
    if (t.status === "skipped_due_to_exa_limit") return "exa_limit_skipped";
    if (t.status === "deep_check_failed") return "deep_check_failed";
    if (t.status === "news_unavailable") return "news_unavailable";
    const d = t.deep;
    if (d?.red_flags && d.red_flags.length > 0) return "red_flag_present";
    if (d?.news_check === "failed") return "negative_news";
    if (d?.risk_check === "failed") return "risk_failed";
    if (d?.swing_suitability === "rejected") return "suitability_rejected";
    if (d?.swing_suitability === "watch_only") return "watch_only_setup";
    if (d?.swing_suitability === "needs_confirmation") return "needs_confirmation";
    const inp = inputByTicker.get(t.ticker);
    const plan = inp && d ? computeTradingPlan(inp, d) : null;
    if (!plan) return "no_valid_trading_plan";
    if (typeof plan.riskReward === "number" && plan.riskReward < 2) return "risk_reward_below_2R";
    if (t.status === "passed_not_selected") return "passed_but_lower_score";
    return "other";
  };
  const allChecked = [
    ...(selected ? [selected] : []),
    ...passed, ...needsConf, ...watchOnly, ...newsUnavailable, ...rejected, ...failed, ...skipped,
  ];
  for (const t of allChecked) {
    t.selectionBlocker = classifyBlocker(t);
    if (t.status !== "selected" && selectedScore != null && typeof t.finalScore === "number") {
      t.gapToSelected = Math.max(0, selectedScore - t.finalScore);
      t.nearMiss = t.gapToSelected <= 1.5
        && (t.status === "passed_not_selected" || t.status === "needs_confirmation" || t.status === "watch_only");
    } else {
      t.gapToSelected = null;
      t.nearMiss = false;
    }
  }
  console.log(JSON.stringify({
    phase: "swing", event: "selection_blockers",
    total: allChecked.length, near_miss: allChecked.filter(t => t.nearMiss).length,
    blockers: allChecked.reduce((acc: Record<string, number>, t) => {
      const k = t.selectionBlocker || "none"; acc[k] = (acc[k] || 0) + 1; return acc;
    }, {}),
  }));


  const totalCacheHits = results.filter((r) => r.cacheHit).length;
  const totalExaAttempts = results.filter((r) => !r.cacheHit && r.status !== "skipped_due_to_exa_limit").length;

  // If every ticker was either skipped or hit a real Exa failure and we have no
  // successful checks, mark the whole run unavailable.
  const anySuccessful = results.some((r) => r.deep && r.status !== "skipped_due_to_exa_limit");
  const unavailableReason: SwingUnavailableReason | undefined =
    !anySuccessful && exaFailureSeen ? exaFailureSeen :
    !anySuccessful && failed.length > 0 ? "exa_error" :
    undefined;

  let runId: string | undefined;
  try {
    const runRow: any = {
      email_run_id: emailRunId ?? null,
      run_date: today,
      model_used: PROVIDER,
      unique_tickers_checked: inputs.length,
      total_selected: selected ? 1 : 0,
      total_rejected: rejected.length,
      total_watch_only: watchOnly.length + needsConf.length + newsUnavailable.length,
      total_failed: failed.length + skipped.length,
      final_status: selected ? "candidate_selected" : (unavailableReason ? "unavailable" : "no_candidate"),
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
      const rows = [selected, ...passed, ...rejected, ...watchOnly, ...needsConf, ...newsUnavailable, ...failed, ...skipped]
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
          selection_blocker: r!.selectionBlocker ?? null,
          near_miss: r!.nearMiss ?? false,
          gap_to_selected: r!.gapToSelected ?? null,
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

  const preliminary: SwingResult = {
    runId, modelUsed: PROVIDER, uniqueChecked: inputs.length,
    totalSelected: selected ? 1 : 0,
    totalPassedNotSelected: passed.length,
    totalRejected: rejected.length,
    totalWatchOnly: watchOnly.length + needsConf.length + newsUnavailable.length,
    totalFailed: failed.length,
    totalSkipped: skipped.length,
    totalCacheHits, totalExaAttempts,
    unavailableReason,
    selected, selectedPlan,
    passed, rejected, watchOnly: [...watchOnly, ...needsConf, ...newsUnavailable],
    failed, skipped,
    all: results,
    previous,
    elapsedMs: Date.now() - started,
  };

  // Save one training example per checked ticker. Best-effort.
  let savedThisRun = 0;
  try {
    savedThisRun = await saveTrainingExamples(admin, preliminary, inputs, userId ?? null, runId ?? null);
  } catch (e) {
    console.log(`[ml-training] save_wrapper_failed reason=${(e as Error).message}`);
  }
  try {
    preliminary.mlStats = await getMLTrainingStats(admin, savedThisRun);
  } catch { /* noop */ }
  console.log(`[ml-export] dataset_view_ready name=swing_ml_training_dataset_v1`);

  // Count-consistency check for the email summary line.
  const summed = preliminary.totalSelected + preliminary.totalPassedNotSelected
    + preliminary.totalRejected + preliminary.totalWatchOnly
    + preliminary.totalFailed + preliminary.totalSkipped;
  if (summed !== preliminary.uniqueChecked) {
    console.log(`[swing-counts] mismatch unique=${preliminary.uniqueChecked} summed=${summed} selected=${preliminary.totalSelected} passed_not_selected=${preliminary.totalPassedNotSelected} rejected=${preliminary.totalRejected} watch_only=${preliminary.totalWatchOnly} failed=${preliminary.totalFailed} skipped=${preliminary.totalSkipped}`);
  }

  console.log(JSON.stringify({
    phase: "swing", event: "done", provider: PROVIDER,
    unique_checked: inputs.length,
    selected: selected?.ticker || "no_candidate",
    passed_not_selected: preliminary.totalPassedNotSelected,
    rejected: rejected.length, watch_only: watchOnly.length,
    failed: failed.length, skipped: skipped.length,
    cache_hits: totalCacheHits, exa_attempts: totalExaAttempts,
    unavailable_reason: unavailableReason ?? null,
    ml_saved_this_run: savedThisRun,
    ml_saved_today: preliminary.mlStats?.savedToday ?? null,
    ml_total_outcomes: preliminary.mlStats?.totalOutcomes ?? null,
    ml_completed: preliminary.mlStats?.completed ?? null,
    ml_completed_10: preliminary.mlStats?.completed10Session ?? null,
    ml_ready: preliminary.mlStats?.ready ?? null,
    elapsed_ms: Date.now() - started,
  }));

  return preliminary;
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
    news_unavailable: { label: "Search unavailable", bg: "#e2e8f0", color: "#475569" },
    deep_check_failed: { label: "Deep check failed", bg: "#e2e8f0", color: "#475569" },
    skipped_due_to_exa_limit: { label: "Skipped due to Exa limit", bg: "#e2e8f0", color: "#475569" },
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
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Sector / industry</td><td>${esc(s.finnhub?.sector || s.finnhub?.industry || d.industry || "Not available")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Peer confirmation</td><td>${esc(s.finnhub?.peerConfirmation || "Peer confirmation: Not available")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Analyst context</td><td>${esc(s.finnhub?.analystContext || "Analyst context: Not available")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Peer / competitor context (Exa)</td><td>${esc(d.peer_context || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Industry context (Exa)</td><td>${esc(d.industry_context || "—")}</td></tr>
          <tr><td style="padding:3px 0;color:#64748b;vertical-align:top;">Key risks</td><td>${(d.key_risks && d.key_risks.length > 0) ? d.key_risks.map(esc).join("; ") : "No material risks detected"}</td></tr>
        </table>
        ${Array.isArray(d.sources) && d.sources.length > 0 ? `<p style="margin:8px 0 0 0;font-size:11px;color:#475569;">Sources: ${d.sources.slice(0, 4).map((x) => `<a href="${esc(x.url)}" style="color:#0891b2;">${esc(x.title || "source")}</a>`).join(" · ")}</p>` : ""}
        ${disclaimer}
      </div>`;
  } else if (r.unavailableReason) {
    swingBlock = `
      <div style="padding:16px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#9a3412;font-weight:700;">🎯 Swing Trader Watch unavailable for this run</p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#7c2d12;line-height:1.6;">Reason: <code>${esc(r.unavailableReason)}</code>. Existing stock tables below are unchanged.</p>
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

  const swingSection = `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">🎯 Swing Trader Watch <span style="font-weight:400;color:#64748b;font-size:13px;">(multi-window: 3–10 · 11–20 · 20–40+ sessions · powered by Exa Search)</span></h3>
    ${swingBlock}`;

  // Show ALL checked tickers — no slice/limit.
  const combined = [
    ...(r.selected ? [r.selected] : []),
    ...r.passed, ...r.rejected, ...r.watchOnly, ...r.failed, ...r.skipped,
  ];

  const rowsHtml = combined.map((t) => {
    const d = t.deep;
    const fnAvail = t.finnhub?.available;
    const fnPeers = fnAvail ? "✅" : "❔";
    const fnAnalyst = fnAvail ? "✅" : "❔";
    const checks = d
      ? `Tech ✅ · Exa News ${checkIcon(d.news_check)} · Finnhub Peers ${fnPeers} · Finnhub Analyst ${fnAnalyst} · Risk ${checkIcon(d.risk_check)}`
      : (t.status === "skipped_due_to_exa_limit" ? "Skipped (Exa limit)" : "Deep check failed");
    let reason = t.rejectionReason || (d?.news_check === "unavailable" ? "Fresh news check unavailable" : (d?.positive_factors?.[0] || ""));
    if (t.status === "passed_not_selected" && !reason) reason = "Strong setup but selected ticker ranked higher.";
    if (t.cacheHit) reason = reason ? `${reason} (cache used)` : "Cache used";
    return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;">${tickerLink(appBaseUrl, t.ticker)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;">${esc(t.company)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${statusBadge(t.status)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${esc(t.bestWindow || "N/A")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${esc(checks)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${esc(reason || "—")}</td>
      </tr>`;
  }).join("");

  const checkedSection = `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">🔎 Tickers Checked Today</h3>
    <p style="margin:0 0 8px 0;font-size:12px;color:#475569;">Provider: Exa · ${r.uniqueChecked} unique tickers · ${r.totalExaAttempts} fresh Exa searches · ${r.totalCacheHits} cache hits · ${r.totalSelected} selected · ${r.totalPassedNotSelected} passed (not selected) · ${r.totalRejected} rejected · ${r.totalWatchOnly} watch only · ${r.totalFailed} failed${r.totalSkipped ? ` · ${r.totalSkipped} skipped` : ""}. Showing all ${combined.length} rows.</p>
    <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">TICKER</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">COMPANY</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">STATUS</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">BEST WINDOW</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">CHECKS</th>
            <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">REASON</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="6" style="padding:12px;color:#64748b;">No tickers checked.</td></tr>`}</tbody>
      </table>
    </div>`;

  const p = r.previous;
  const prevSection = p ? `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">📌 Previous Swing Candidate Check</h3>
    <div style="padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#78350f;">
      Last candidate: <strong>${tickerLink(appBaseUrl, p.ticker)}</strong>${p.company ? ` · ${esc(p.company)}` : ""} · selected on ${esc(p.selectedDate)}${typeof p.selectedPrice === "number" ? ` at $${p.selectedPrice.toFixed(2)}` : ""}. Status: <strong>${esc(p.status)}</strong>. Target hit: ${p.targetHit ? "yes" : "no"} · Stop hit: ${p.stopHit ? "yes" : "no"}.
    </div>` : "";

  const mlSection = r.mlStats ? buildMLTrainingSectionHTML(r.mlStats) : "";
  return `${swingSection}\n${checkedSection}\n${prevSection}\n${mlSection}`;
}
