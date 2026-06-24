// Technical indicators for portfolio research. Pure functions, no IO.
// All computations rely on regular-session daily OHLCV (no pre/post-market).

import type { YahooChart } from "./yahoo-chart.ts";

export type Technicals = {
  price: number;
  previousClose: number | null;
  return1Session: number | null;     // pct
  return3Session: number | null;
  return7Session: number | null;
  return20Session: number | null;
  rsi14: number | null;
  atr14: number | null;              // dollars
  atr14Pct: number | null;
  sma20: number | null;
  sma50: number | null;
  support: number | null;            // 20-session low
  resistance: number | null;         // 20-session high
  supportBreak: boolean;             // current < 20-session low * 1.0
  drawdownFromRecentHighPct: number | null;
  averageVolume20: number | null;
  volumeStrengthPct: number | null;  // latest vs avg20, pct
  sessionsAnalyzed: number;
};

function pctReturn(latest: number, prior: number | undefined): number | null {
  if (!Number.isFinite(latest) || prior === undefined || !Number.isFinite(prior) || prior === 0) return null;
  return ((latest - prior) / prior) * 100;
}

export function computeRSI14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeATR14(highs: number[], lows: number[], closes: number[]): number | null {
  const n = closes.length;
  if (n < 15) return null;
  const trs: number[] = [];
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeTechnicals(chart: YahooChart): Technicals {
  const { price, previousClose, closes, highs, lows, volumes } = chart;
  const last = closes[closes.length - 1] ?? price;
  const ret1 = pctReturn(last, closes[closes.length - 2]);
  const ret3 = pctReturn(last, closes[closes.length - 4]);
  const ret7 = pctReturn(last, closes[closes.length - 8]);
  const ret20 = pctReturn(last, closes[closes.length - 21]);

  const rsi14 = computeRSI14(closes);
  const atr14 = computeATR14(highs, lows, closes);
  const atr14Pct = atr14 !== null && price > 0 ? (atr14 / price) * 100 : null;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  const window = closes.length >= 20 ? 20 : closes.length;
  const recentHighs = highs.slice(highs.length - window);
  const recentLows = lows.slice(lows.length - window);
  const resistance = recentHighs.length > 0 ? Math.max(...recentHighs) : null;
  const support = recentLows.length > 0 ? Math.min(...recentLows) : null;
  const supportBreak = support !== null && price < support;

  const recentHighMax = recentHighs.length > 0 ? Math.max(...recentHighs) : null;
  const drawdownFromRecentHighPct = recentHighMax !== null && recentHighMax > 0
    ? ((price - recentHighMax) / recentHighMax) * 100
    : null;

  const avgVol20 = sma(volumes, 20);
  const latestVol = volumes[volumes.length - 1] ?? null;
  const volumeStrengthPct = avgVol20 !== null && avgVol20 > 0 && latestVol !== null
    ? (latestVol / avgVol20) * 100
    : null;

  return {
    price,
    previousClose,
    return1Session: ret1,
    return3Session: ret3,
    return7Session: ret7,
    return20Session: ret20,
    rsi14,
    atr14,
    atr14Pct,
    sma20,
    sma50,
    support,
    resistance,
    supportBreak,
    drawdownFromRecentHighPct,
    averageVolume20: avgVol20,
    volumeStrengthPct,
    sessionsAnalyzed: closes.length,
  };
}

export type VolumeCondition = "Heavy selling" | "Strong bullish confirmation" | "Average" | "Quiet";
export function classifyVolume(t: Technicals): VolumeCondition {
  if (t.volumeStrengthPct === null) return "Average";
  const heavy = t.volumeStrengthPct >= 150;
  const quiet = t.volumeStrengthPct < 70;
  const downDay = (t.return1Session ?? 0) < -0.3;
  const upDay = (t.return1Session ?? 0) > 0.3;
  if (heavy && downDay) return "Heavy selling";
  if (heavy && upDay) return "Strong bullish confirmation";
  if (quiet) return "Quiet";
  return "Average";
}

export type SupportCondition = "Holding support" | "Near support" | "Below support" | "Mid-range" | "Near resistance";
export function classifySupport(t: Technicals): SupportCondition {
  if (t.support === null || t.resistance === null) return "Mid-range";
  if (t.supportBreak) return "Below support";
  const range = t.resistance - t.support;
  if (range <= 0) return "Mid-range";
  const pos = (t.price - t.support) / range;
  if (pos < 0.15) return "Near support";
  if (pos > 0.85) return "Near resistance";
  if (pos < 0.35) return "Holding support";
  return "Mid-range";
}
