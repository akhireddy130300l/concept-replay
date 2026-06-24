// Finnhub helpers: analyst recommendation + dynamic company peers.
// No hardcoded peer lists. If peers are empty or the request fails, return null
// and the caller must show "Peer analysis unavailable".

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 8000;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`finnhub_timeout_${ms}ms`)), ms)),
  ]);
}

export type AnalystRecommendation = {
  source: "finnhub";
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  totalAnalysts: number;
  signal: "Strong buy" | "Buy" | "Hold" | "Sell" | "Strong sell" | "Mixed";
};

function deriveSignal(r: Omit<AnalystRecommendation, "source" | "signal" | "totalAnalysts">): AnalystRecommendation["signal"] {
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (total === 0) return "Mixed";
  const weightedScore = (r.strongBuy * 2 + r.buy * 1 - r.sell * 1 - r.strongSell * 2) / total;
  if (weightedScore >= 1.2) return "Strong buy";
  if (weightedScore >= 0.4) return "Buy";
  if (weightedScore <= -1.2) return "Strong sell";
  if (weightedScore <= -0.4) return "Sell";
  return "Hold";
}

export async function fetchFinnhubRecommendation(symbol: string, apiKey: string): Promise<AnalystRecommendation | null> {
  try {
    const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await withTimeout(fetch(url), TIMEOUT_MS);
    if (res.status !== 200) { try { await res.text(); } catch { /* ignore */ } return null; }
    const json: any = await res.json().catch(() => null);
    if (!Array.isArray(json) || json.length === 0) return null;
    const latest = json[0];
    const counts = {
      period: typeof latest.period === "string" ? latest.period : "",
      strongBuy: Number(latest.strongBuy) || 0,
      buy: Number(latest.buy) || 0,
      hold: Number(latest.hold) || 0,
      sell: Number(latest.sell) || 0,
      strongSell: Number(latest.strongSell) || 0,
    };
    const total = counts.strongBuy + counts.buy + counts.hold + counts.sell + counts.strongSell;
    if (total === 0) return null;
    return { source: "finnhub", ...counts, totalAnalysts: total, signal: deriveSignal(counts) };
  } catch {
    return null;
  }
}

export type PeerResult =
  | { ok: true; peers: string[] }
  | { ok: false; reason: string };

export async function fetchFinnhubPeers(symbol: string, apiKey: string, limit = 8): Promise<PeerResult> {
  try {
    const url = `${FINNHUB_BASE}/stock/peers?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await withTimeout(fetch(url), TIMEOUT_MS);
    if (res.status !== 200) { try { await res.text(); } catch { /* ignore */ } return { ok: false, reason: `status_${res.status}` }; }
    const json: any = await res.json().catch(() => null);
    if (!Array.isArray(json)) return { ok: false, reason: "non_array_response" };
    const upper = symbol.toUpperCase();
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of json) {
      if (typeof raw !== "string") continue;
      const t = raw.trim().toUpperCase();
      if (!TICKER_RE.test(t)) continue;
      if (t === upper) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      cleaned.push(t);
      if (cleaned.length >= limit) break;
    }
    if (cleaned.length === 0) return { ok: false, reason: "empty_peer_list" };
    return { ok: true, peers: cleaned };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "unknown_error" };
  }
}
