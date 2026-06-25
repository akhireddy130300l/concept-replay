// Deterministic portfolio math. All numbers computed here, never by Gemini.

export type HoldingInput = {
  ticker: string;
  shares: number;
  averageCost: number | null;
  purchaseDate: string | null;
};

export type ConcentrationThresholds = {
  normal: number;
  moderate: number;
  high: number;
  very_high: number;
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
  marketValue: number;
  costBasis: number | null;
  unrealizedPL: number | null;
  unrealizedPLPct: number | null;
  weightPct: number | null;
  concentrationLevel: ConcentrationLevel | null; // null when basis is submitted_only
  impactOf5PctDecline: number;
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
  accountConcentrationAvailable: boolean;
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
  const accountConcentrationAvailable = declaredAccountTotal && cashBalance !== null;
  const basis = accountConcentrationAvailable ? "account_total" : "submitted_only";
  return {
    totalHoldingValue: holdingsValue,
    cashBalance,
    totalPortfolioValue: total,
    basis,
    accountConcentrationAvailable,
    weightLabel: basis === "account_total" ? "Account concentration" : "Weight among submitted holdings",
  };
}

/**
 * Applies weight (relative to denominator). Concentration level is ONLY assigned
 * when basis === "account_total". For submitted_only, weight is informational only.
 */
export function applyWeights(metrics: HoldingMetrics[], totals: PortfolioTotals, thresholds = DEFAULT_CONCENTRATION_THRESHOLDS): void {
  const denominator = totals.totalPortfolioValue;
  if (denominator <= 0) return;
  for (const m of metrics) {
    const w = (m.marketValue / denominator) * 100;
    m.weightPct = round4(w);
    m.concentrationLevel = totals.accountConcentrationAvailable ? classifyConcentration(w, thresholds) : null;
  }
}

export type PeerClassification =
  | "Stock-specific"
  | "Broad peer-group weakness"
  | "Mixed"
  | "Peer analysis unavailable";

export type PeerCondition = "Rising" | "Stable" | "Falling" | "Sharp decline" | "Data unavailable";

export function classifyPeerCondition(ret1Session: number | null): PeerCondition {
  if (ret1Session === null || !Number.isFinite(ret1Session)) return "Data unavailable";
  if (ret1Session >= 1) return "Rising";
  if (ret1Session > -1) return "Stable";
  if (ret1Session > -5) return "Falling";
  return "Sharp decline";
}

export type PeerAnalysis =
  | {
      available: true;
      peerCount: number;             // analyzed peers (valid Yahoo data)
      peersFalling: number;
      peersFallingPct: number;
      peersFallingAtLeast5Pct: number;
      medianPeerOneSessionReturn: number;
      classification: Exclude<PeerClassification, "Peer analysis unavailable">;
    }
  | { available: false; reason: string };

/**
 * Deterministic peer classification rules:
 *  - "Broad peer-group weakness": >=60% of analyzed peers down OR median 1S <= -1%,
 *    AND own holding is not materially weaker than the median.
 *  - "Mixed": broad weakness present but own holding is materially weaker than median
 *    (own - median <= -1.5pp), OR signals not strong enough for either clear bucket.
 *  - "Stock-specific": <40% peers falling AND median >= 0 (peers stable or positive).
 */
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

  const broadWeak = fallingPct >= 60 || median <= -1;
  const ownMateriallyWeaker = ownReturn1 !== null && (ownReturn1 - median) <= -1.5;

  let classification: PeerAnalysis extends { classification: infer C } ? C : never;
  if (broadWeak && ownMateriallyWeaker) classification = "Mixed";
  else if (broadWeak) classification = "Broad peer-group weakness";
  else if (fallingPct < 40 && median >= 0) classification = "Stock-specific";
  else classification = "Mixed";

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

export type AssessmentType =
  | "stock-specific"
  | "broad-peer-weakness"
  | "mixed"
  | "peer-unavailable"
  | "insufficient";

export function peerClassificationToAssessmentType(c: PeerClassification): AssessmentType {
  switch (c) {
    case "Stock-specific": return "stock-specific";
    case "Broad peer-group weakness": return "broad-peer-weakness";
    case "Mixed": return "mixed";
    case "Peer analysis unavailable": return "peer-unavailable";
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
