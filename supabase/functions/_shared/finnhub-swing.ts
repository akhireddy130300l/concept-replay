// Finnhub structured data for Swing Trader Watch.
// Cached in stock_provider_cache. All failures are non-fatal — Swing continues
// with Yahoo + Exa if Finnhub is unavailable.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 6000;

// Cache TTLs
const TTL_PROFILE_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_PEERS_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_RECS_MS = 24 * 60 * 60 * 1000;
const TTL_TARGET_MS = 24 * 60 * 60 * 1000;

export type FinnhubProfile = {
  name?: string;
  ticker?: string;
  exchange?: string;
  finnhubIndustry?: string;
  sector?: string;
  marketCapitalization?: number;
  country?: string;
  weburl?: string;
};

export type FinnhubRecTrend = {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
};

export type FinnhubTarget = {
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
  lastUpdated?: string;
};

export type FinnhubBundle = {
  available: boolean;
  reason?: string;
  ticker: string;
  profile?: FinnhubProfile | null;
  peers?: string[] | null;
  recommendation?: FinnhubRecTrend[] | null;
  target?: FinnhubTarget | null;
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`finnhub_timeout_${ms}ms`)), ms)),
  ]);
}

async function cachedFetch(
  admin: SupabaseClient,
  ticker: string,
  cacheType: string,
  ttlMs: number,
  url: string,
): Promise<any | null> {
  try {
    const { data: row } = await admin
      .from("stock_provider_cache")
      .select("data_json, expires_at")
      .eq("provider", "finnhub")
      .eq("ticker", ticker)
      .eq("cache_type", cacheType)
      .maybeSingle();
    if (row && new Date(row.expires_at).getTime() > Date.now()) {
      return row.data_json;
    }
  } catch { /* ignore cache errors */ }

  try {
    const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), TIMEOUT_MS);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (json === null || json === undefined) return null;
    const expires = new Date(Date.now() + ttlMs).toISOString();
    try {
      await admin.from("stock_provider_cache").upsert({
        provider: "finnhub",
        ticker,
        cache_type: cacheType,
        data_json: json,
        fetched_at: new Date().toISOString(),
        expires_at: expires,
      }, { onConflict: "provider,ticker,cache_type" });
    } catch { /* ignore */ }
    return json;
  } catch {
    return null;
  }
}

export async function fetchFinnhubBundle(
  admin: SupabaseClient,
  ticker: string,
): Promise<FinnhubBundle> {
  const apiKey = Deno.env.get("FINNHUB_API_KEY") || "";
  if (!apiKey) {
    return { available: false, reason: "missing_finnhub_key", ticker };
  }
  const t = encodeURIComponent(ticker);
  const [profile, peers, rec, target] = await Promise.all([
    cachedFetch(admin, ticker, "company_profile", TTL_PROFILE_MS,
      `${FINNHUB_BASE}/stock/profile2?symbol=${t}&token=${apiKey}`),
    cachedFetch(admin, ticker, "peers", TTL_PEERS_MS,
      `${FINNHUB_BASE}/stock/peers?symbol=${t}&token=${apiKey}`),
    cachedFetch(admin, ticker, "recommendation_trend", TTL_RECS_MS,
      `${FINNHUB_BASE}/stock/recommendation?symbol=${t}&token=${apiKey}`),
    cachedFetch(admin, ticker, "price_target", TTL_TARGET_MS,
      `${FINNHUB_BASE}/stock/price-target?symbol=${t}&token=${apiKey}`),
  ]);
  const anyOk = !!(profile || (Array.isArray(peers) && peers.length) || (Array.isArray(rec) && rec.length) || target);
  return {
    available: anyOk,
    reason: anyOk ? undefined : "finnhub_unavailable",
    ticker,
    profile: profile as FinnhubProfile | null,
    peers: Array.isArray(peers) ? (peers as string[]).slice(0, 10) : null,
    recommendation: Array.isArray(rec) ? (rec as FinnhubRecTrend[]).slice(0, 6) : null,
    target: target as FinnhubTarget | null,
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────

export type FinnhubScoring = {
  peerScore: number;           // 0..10
  peerConfirmation: string;    // human-readable
  peerLabel: "positive" | "neutral" | "negative" | "not_available";
  analystScore: number;        // 0..10
  analystContext: string;      // human-readable
  analystLabel: "positive" | "neutral" | "negative" | "not_available";
  sector?: string;
  industry?: string;
  targetMean?: number;
  targetUpsidePct?: number;
  targetSupportsTrade?: boolean;
  buyCount: number;
  holdCount: number;
  sellCount: number;
};

export function scoreFinnhub(
  bundle: FinnhubBundle,
  currentPrice: number | undefined,
  tickerOneDayPct: number | undefined,
): FinnhubScoring {
  const industry = bundle.profile?.finnhubIndustry;
  const sector = bundle.profile?.sector || industry;

  // Peer scoring — we can't fetch peer prices synchronously here without a lot
  // of extra API calls; use peer count + ticker's own move as a proxy signal.
  let peerScore = 5;
  let peerLabel: FinnhubScoring["peerLabel"] = "not_available";
  let peerConfirmation = "Peer confirmation: Not available";
  const peerCount = bundle.peers?.length ?? 0;
  if (peerCount >= 3) {
    if (typeof tickerOneDayPct === "number") {
      if (tickerOneDayPct > 2) {
        peerScore = 7;
        peerLabel = "positive";
        peerConfirmation = `Peer confirmation: Positive — ${bundle.ticker} is moving up alongside ${peerCount} tracked ${industry ? `${industry.toLowerCase()} ` : ""}peers.`;
      } else if (tickerOneDayPct < -2) {
        peerScore = 4;
        peerLabel = "negative";
        peerConfirmation = `Peer confirmation: Negative — ${bundle.ticker} is under pressure in the ${industry || "peer"} group.`;
      } else {
        peerScore = 5;
        peerLabel = "neutral";
        peerConfirmation = `Peer confirmation: Neutral — ${peerCount} peers tracked in ${industry || "sector"}, no clear divergence.`;
      }
    } else {
      peerScore = 5;
      peerLabel = "neutral";
      peerConfirmation = `Peer confirmation: Neutral — ${peerCount} peers tracked.`;
    }
  }

  // Analyst scoring
  let analystScore = 5;
  let analystLabel: FinnhubScoring["analystLabel"] = "not_available";
  let analystContext = "Analyst context: Not available";
  let buy = 0, hold = 0, sell = 0;
  const latest = bundle.recommendation?.[0];
  if (latest) {
    buy = (latest.buy || 0) + (latest.strongBuy || 0);
    hold = latest.hold || 0;
    sell = (latest.sell || 0) + (latest.strongSell || 0);
    const total = buy + hold + sell;
    if (total > 0) {
      const buyPct = buy / total;
      const sellPct = sell / total;
      if (buyPct >= 0.6) {
        analystScore = 8; analystLabel = "positive";
        analystContext = `Analyst context: Buy-leaning (${buy} buy / ${hold} hold / ${sell} sell).`;
      } else if (sellPct >= 0.4) {
        analystScore = 3; analystLabel = "negative";
        analystContext = `Analyst context: Negative — meaningful sell coverage (${buy} buy / ${hold} hold / ${sell} sell).`;
      } else {
        analystScore = 5; analystLabel = "neutral";
        analystContext = `Analyst context: Mixed (${buy} buy / ${hold} hold / ${sell} sell).`;
      }
    }
  }

  // Price target
  let targetMean: number | undefined;
  let targetUpsidePct: number | undefined;
  let targetSupportsTrade: boolean | undefined;
  const tm = bundle.target?.targetMean;
  if (typeof tm === "number" && tm > 0 && typeof currentPrice === "number" && currentPrice > 0) {
    targetMean = tm;
    targetUpsidePct = ((tm - currentPrice) / currentPrice) * 100;
    if (targetUpsidePct >= 8) {
      targetSupportsTrade = true;
      analystScore = Math.min(10, analystScore + 1);
      analystContext += ` Average target $${tm.toFixed(2)} (~${targetUpsidePct.toFixed(1)}% upside) supports the trade.`;
      if (analystLabel === "not_available") analystLabel = "positive";
    } else if (targetUpsidePct <= -3) {
      targetSupportsTrade = false;
      analystScore = Math.max(0, analystScore - 2);
      analystContext += ` Current price is above the average analyst target $${tm.toFixed(2)} (${targetUpsidePct.toFixed(1)}% vs current).`;
      if (analystLabel === "not_available" || analystLabel === "neutral") analystLabel = "negative";
    } else {
      targetSupportsTrade = false;
      analystContext += ` Average target $${tm.toFixed(2)} is close to current price.`;
    }
  }

  return {
    peerScore, peerConfirmation, peerLabel,
    analystScore, analystContext, analystLabel,
    sector: sector || undefined,
    industry: industry || undefined,
    targetMean, targetUpsidePct, targetSupportsTrade,
    buyCount: buy, holdCount: hold, sellCount: sell,
  };
}
