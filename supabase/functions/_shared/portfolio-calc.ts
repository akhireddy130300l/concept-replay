// Deterministic portfolio math. All numbers computed here, never by Gemini.

export type HoldingInput = {
  ticker: string;
  shares: number;
  averageCost: number | null; // null => unknown
  purchaseDate: string | null;
};

export type ConcentrationThresholds = {
  normal: number;     // < this => Normal
  moderate: number;   // < this => Moderate
  high: number;       // < this => High
  very_high: number;  // < this => Very high, >= => Critical
};

export const DEFAULT_CONCENTRATION_THRESHOLDS: ConcentrationThresholds = {
  normal: 10,
  moderate: 20,
  high: 35,
  very_high: 50,
};

export type ConcentrationLevel = "Normal" | "Moderate" | "High" | "Very high" | "Critical";

export function classifyConcentration(weightPct: number, t: ConcentrationThresholds = DEFAULT_CONCENTRATION_THRESHOLDS): ConcentrationLevel {
  if (weightPct < t.normal) return "Normal";
  if (weightPct < t.moderate) return "Moderate";
  if (weightPct < t.high) return "High";
  if (weightPct < t.very_high) return "Very high";
  return "Critical";
}

export type HoldingMetrics = {
  ticker: string;
  shares: number;
  averageCost: number | null;
  marketPrice: number;
  marketValue: number;             // shares * marketPrice
  costBasis: number | null;        // shares * averageCost  (null if avg cost unknown)
  unrealizedPL: number | null;
  unrealizedPLPct: number | null;
  weightPct: number | null;        // null until total is computed
  concentrationLevel: ConcentrationLevel | null;
  impactOf5PctDecline: number;     // dollars
  impactOf10PctDecline: number;
};

export function computeHoldingMetrics(h: HoldingInput, marketPrice: number): HoldingMetrics {
  const shares = h.shares;
  const marketValue = round2(shares * marketPrice);
  const costBasis = h.averageCost !== null ? round2(shares * h.averageCost) : null;
  const unrealizedPL = costBasis !== null ? round2(marketValue - costBasis) : null;
  const unrealizedPLPct = costBasis !== null && costBasis > 0
    ? round4(((marketValue - costBasis) / costBasis) * 100)
    : null;
  return {
    ticker: h.ticker,
    shares,
    averageCost: h.averageCost,
    marketPrice,
    marketValue,
    costBasis,
    unrealizedPL,
    unrealizedPLPct,
    weightPct: null,
    concentrationLevel: null,
    impactOf5PctDecline: round2(marketValue * -0.05),
    impactOf10PctDecline: round2(marketValue * -0.10),
  };
}

export type PortfolioTotals = {
  totalHoldingValue: number;
  cashBalance: number | null;
  totalPortfolioValue: number;
  basis: "submitted_only" | "account_total";
  weightLabel: "Account concentration" | "Weight among submitted holdings";
};

export function computeTotals(
  metrics: HoldingMetrics[],
  cashBalance: number | null,
  declaredAccountTotal: boolean,
): PortfolioTotals {
  const holdingsValue = round2(metrics.reduce((s, m) => s + m.marketValue, 0));
  const cash = cashBalance ?? 0;
  const total = round2(holdingsValue + cash);
  const basis = declaredAccountTotal && cashBalance !== null ? "account_total" : "submitted_only";
  return {
    totalHoldingValue: holdingsValue,
    cashBalance,
    totalPortfolioValue: total,
    basis,
    weightLabel: basis === "account_total" ? "Account concentration" : "Weight among submitted holdings",
  };
}

export function applyWeights(metrics: HoldingMetrics[], totals: PortfolioTotals, thresholds = DEFAULT_CONCENTRATION_THRESHOLDS): void {
  const denominator = totals.totalPortfolioValue;
  if (denominator <= 0) return;
  for (const m of metrics) {
    const w = (m.marketValue / denominator) * 100;
    m.weightPct = round4(w);
    m.concentrationLevel = classifyConcentration(w, thresholds);
  }
}

export type PeerAnalysis =
  | {
      available: true;
      peerCount: number;
      peersFalling: number;
      peersFallingPct: number;
      peersFallingAtLeast5Pct: number;
      medianPeerOneSessionReturn: number;
      classification: "Stock-specific weakness" | "Sector-wide weakness" | "Mixed peer action" | "Resilient holding";
    }
  | { available: false; reason: string };

export function computePeerAnalysis(
  ownReturn1: number | null,
  peerReturns: Array<{ symbol: string; return1Session: number | null }>,
): PeerAnalysis {
  const valid = peerReturns.filter((p) => p.return1Session !== null) as Array<{ symbol: string; return1Session: number }>;
  if (valid.length === 0) return { available: false, reason: "no_valid_peer_returns" };
  const falling = valid.filter((p) => p.return1Session < 0);
  const fallingAtLeast5 = valid.filter((p) => p.return1Session <= -5);
  const fallingPct = (falling.length / valid.length) * 100;

  const sorted = [...valid].sort((a, b) => a.return1Session - b.return1Session);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1].return1Session + sorted[mid].return1Session) / 2
    : sorted[mid].return1Session;

  let classification: PeerAnalysis extends { classification: infer C } ? C : never;
  const ownDown = (ownReturn1 ?? 0) < -1;
  const ownUp = (ownReturn1 ?? 0) > 1;
  if (ownDown && fallingPct >= 60) classification = "Sector-wide weakness";
  else if (ownDown && fallingPct < 30) classification = "Stock-specific weakness";
  else if (ownUp && fallingPct < 30) classification = "Resilient holding";
  else classification = "Mixed peer action";

  return {
    available: true,
    peerCount: valid.length,
    peersFalling: falling.length,
    peersFallingPct: round4(fallingPct),
    peersFallingAtLeast5Pct: fallingAtLeast5.length,
    medianPeerOneSessionReturn: round4(median),
    classification,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
