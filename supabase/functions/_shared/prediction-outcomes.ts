export const DEFAULT_HORIZON_SESSIONS = 10;

export type OutcomeLabel = "positive" | "negative" | "flat";

export type HorizonOutcomeResult =
  | { matured: false; sessionsElapsed: number; reason: string }
  | {
      matured: true;
      sessionsElapsed: number;
      entryPrice: number;
      exitPrice: number;
      actualReturnPct: number;
      maxGainPct: number;
      maxDrawdownPct: number;
      actualLabel: OutcomeLabel;
    };

function toUtcDateString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function classifyOutcomeLabel(
  returnPct: number,
  maxGainPct: number,
  maxDrawdownPct: number,
): OutcomeLabel {
  if (returnPct > 2 || maxGainPct >= 3) return "positive";
  if (returnPct < -2 || maxDrawdownPct <= -3) return "negative";
  return "flat";
}

export function computeHorizonOutcome(input: {
  predictionDate: string;
  horizonSessions?: number;
  timestamps: number[];
  closes: number[];
  highs: number[];
  lows: number[];
}): HorizonOutcomeResult {
  const horizon = input.horizonSessions ?? DEFAULT_HORIZON_SESSIONS;
  const n = Math.min(
    input.timestamps.length,
    input.closes.length,
    input.highs.length,
    input.lows.length,
  );
  if (n < 2) {
    return { matured: false, sessionsElapsed: 0, reason: "insufficient_history" };
  }

  const targetDate = input.predictionDate.slice(0, 10);
  let entryIdx = -1;
  for (let i = 0; i < n; i++) {
    const ts = input.timestamps[i];
    if (ts !== undefined && toUtcDateString(ts) >= targetDate) {
      entryIdx = i;
      break;
    }
  }

  if (entryIdx < 0) {
    return { matured: false, sessionsElapsed: 0, reason: "prediction_date_after_chart" };
  }

  const sessionsElapsed = n - 1 - entryIdx;
  if (sessionsElapsed < horizon) {
    return { matured: false, sessionsElapsed, reason: "pending_horizon" };
  }

  const exitIdx = entryIdx + horizon;
  const entryPrice = input.closes[entryIdx];
  const exitPrice = input.closes[exitIdx];
  if (
    entryPrice === undefined ||
    exitPrice === undefined ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(exitPrice) ||
    entryPrice <= 0
  ) {
    return { matured: false, sessionsElapsed, reason: "invalid_prices" };
  }

  let maxHigh = entryPrice;
  let minLow = entryPrice;
  for (let i = entryIdx; i <= exitIdx; i++) {
    const h = input.highs[i];
    const l = input.lows[i];
    if (h !== undefined && Number.isFinite(h) && h > maxHigh) maxHigh = h;
    if (l !== undefined && Number.isFinite(l) && l < minLow) minLow = l;
  }

  const actualReturnPct = round4(((exitPrice - entryPrice) / entryPrice) * 100);
  const maxGainPct = round4(((maxHigh - entryPrice) / entryPrice) * 100);
  const maxDrawdownPct = round4(((minLow - entryPrice) / entryPrice) * 100);
  const actualLabel = classifyOutcomeLabel(actualReturnPct, maxGainPct, maxDrawdownPct);

  return {
    matured: true,
    sessionsElapsed: horizon,
    entryPrice,
    exitPrice,
    actualReturnPct,
    maxGainPct,
    maxDrawdownPct,
    actualLabel,
  };
}