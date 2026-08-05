// Portfolio action plan engine — "what to trim / what to buy" for a 2-week to
// 1-month horizon, scored by a calibrated statistical model.
//
// Model: logistic scoring over deterministic technical features. The feature
// weights are calibrated at runtime from the project's own historical swing
// dataset (swing_training_examples x swing_training_outcomes, 10-session
// labels). When there is not enough labelled history the model falls back to
// documented prior weights and the email says so explicitly.
//
// This module is pure decision support. It never places orders.

import type { Technicals } from "./technicals.ts";

export type ModelFeatures = {
  mom1: number | null;   // 1-session return %
  mom7: number | null;   // 7-session return %
  mom20: number | null;  // 20-session return %
  rsi: number | null;
  atrPct: number | null;
  drawdownPct: number | null;    // from recent high (negative)
  volumeStrengthPct: number | null; // vs 20-session average, 100 = average
  supportBreak: boolean;
  peerLift: number | null;       // holding 1S return minus peer median 1S return
  analystSignal: string | null;  // Finnhub signal text
};

export type Calibration = {
  sampleSize: number;
  baseRate: number;
  calibrated: boolean;
  weights: Record<string, number>;
  intercept: number;
};

// Documented prior weights (log-odds contributions). Used as-is with no
// history, and blended with empirical log-odds once history exists.
const PRIOR_WEIGHTS: Record<string, number> = {
  mom7_positive: 0.35,
  mom20_positive: 0.30,
  rsi_healthy: 0.28,        // 45 <= rsi <= 68
  rsi_overbought: -0.30,    // rsi > 75
  rsi_oversold_weak: -0.22, // rsi < 32 with negative 7s momentum
  volume_confirming: 0.22,  // volume strength > 120
  volume_weak: -0.18,       // volume strength < 70
  low_volatility: 0.12,     // atrPct < 4
  high_volatility: -0.20,   // atrPct > 8
  deep_drawdown: -0.25,     // drawdown < -18%
  support_break: -0.45,
  peer_outperform: 0.20,
  analyst_buy: 0.18,
  analyst_sell: -0.25,
};

const PRIOR_INTERCEPT = -0.15;

// Binary indicator extraction — the ONLY place features become model inputs.
export function indicators(f: ModelFeatures): Record<string, number> {
  const rsi = f.rsi;
  const vol = f.volumeStrengthPct;
  const atr = f.atrPct;
  const sig = (f.analystSignal ?? "").toLowerCase();
  return {
    mom7_positive: f.mom7 !== null && f.mom7 > 0 ? 1 : 0,
    mom20_positive: f.mom20 !== null && f.mom20 > 0 ? 1 : 0,
    rsi_healthy: rsi !== null && rsi >= 45 && rsi <= 68 ? 1 : 0,
    rsi_overbought: rsi !== null && rsi > 75 ? 1 : 0,
    rsi_oversold_weak: rsi !== null && rsi < 32 && (f.mom7 ?? 0) < 0 ? 1 : 0,
    volume_confirming: vol !== null && vol > 120 ? 1 : 0,
    volume_weak: vol !== null && vol < 70 ? 1 : 0,
    low_volatility: atr !== null && atr < 4 ? 1 : 0,
    high_volatility: atr !== null && atr > 8 ? 1 : 0,
    deep_drawdown: f.drawdownPct !== null && f.drawdownPct < -18 ? 1 : 0,
    support_break: f.supportBreak ? 1 : 0,
    peer_outperform: f.peerLift !== null && f.peerLift > 0 ? 1 : 0,
    analyst_buy: sig.includes("buy") ? 1 : 0,
    analyst_sell: sig.includes("sell") ? 1 : 0,
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function priorCalibration(): Calibration {
  return { sampleSize: 0, baseRate: 0.5, calibrated: false, weights: { ...PRIOR_WEIGHTS }, intercept: PRIOR_INTERCEPT };
}

type LabelledRow = {
  win: boolean;
  mom1: number | null;
  mom7: number | null;
  mom20: number | null;
  volume: number | null;
  technical: number | null;
};

// Calibrate feature log-odds from the project's own labelled swing history.
// Only the features that exist in the historical dataset are re-estimated;
// the rest keep their prior weight.
export async function loadCalibration(admin: any): Promise<Calibration> {
  const prior = priorCalibration();
  try {
    const { data, error } = await admin
      .from("swing_training_outcomes")
      .select("label_10_session, outcome_10_session, swing_training_examples!inner(one_session_return_pct, seven_session_return_pct, twenty_session_return_pct, volume_strength, technical_score)")
      .not("label_10_session", "is", null)
      .limit(5000);
    if (error || !Array.isArray(data) || data.length === 0) return prior;

    const rows: LabelledRow[] = data.map((r: any) => {
      const ex = r.swing_training_examples ?? {};
      const label = String(r.label_10_session ?? "").toLowerCase();
      const ret = typeof r.outcome_10_session === "number" ? r.outcome_10_session : null;
      const win = label.includes("win") || label.includes("success") || label.includes("positive")
        ? true
        : (ret !== null ? ret > 0 : false);
      return {
        win,
        mom1: num(ex.one_session_return_pct),
        mom7: num(ex.seven_session_return_pct),
        mom20: num(ex.twenty_session_return_pct),
        volume: num(ex.volume_strength),
        technical: num(ex.technical_score),
      };
    });

    const n = rows.length;
    if (n < 100) return { ...prior, sampleSize: n };

    const base = clamp(rows.filter((r) => r.win).length / n, 0.05, 0.95);
    const baseLogOdds = Math.log(base / (1 - base));
    const alpha = clamp(n / 800, 0, 1); // full trust in empirical weights at 800+ labelled rows

    const empirical: Record<string, (r: LabelledRow) => boolean | null> = {
      mom7_positive: (r) => (r.mom7 === null ? null : r.mom7 > 0),
      mom20_positive: (r) => (r.mom20 === null ? null : r.mom20 > 0),
      volume_confirming: (r) => (r.volume === null ? null : r.volume > 120),
      volume_weak: (r) => (r.volume === null ? null : r.volume < 70),
    };

    const weights = { ...prior.weights };
    for (const [key, pred] of Object.entries(empirical)) {
      let hit = 0, hitWin = 0;
      for (const r of rows) {
        const v = pred(r);
        if (v !== true) continue;
        hit++;
        if (r.win) hitWin++;
      }
      if (hit < 40) continue;
      const p = clamp(hitWin / hit, 0.05, 0.95);
      const lift = Math.log(p / (1 - p)) - baseLogOdds;
      weights[key] = prior.weights[key] * (1 - alpha) + clamp(lift, -1.2, 1.2) * alpha;
    }

    return {
      sampleSize: n,
      baseRate: base,
      calibrated: true,
      weights,
      intercept: prior.intercept * (1 - alpha) + baseLogOdds * alpha,
    };
  } catch {
    return prior;
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export type Scored = {
  probability: number;   // modelled probability of a positive 10-session move
  drivers: string[];     // top positive contributors
  detractors: string[];  // top negative contributors
};

export function scoreFeatures(f: ModelFeatures, cal: Calibration): Scored {
  const ind = indicators(f);
  let z = cal.intercept;
  const contribs: Array<[string, number]> = [];
  for (const [key, on] of Object.entries(ind)) {
    if (!on) continue;
    const w = cal.weights[key] ?? 0;
    z += w;
    contribs.push([key, w]);
  }
  contribs.sort((a, b) => b[1] - a[1]);
  const label = (k: string) => k.replace(/_/g, " ");
  return {
    probability: clamp(sigmoid(z), 0.02, 0.98),
    drivers: contribs.filter(([, w]) => w > 0).slice(0, 3).map(([k]) => label(k)),
    detractors: contribs.filter(([, w]) => w < 0).slice(0, 3).map(([k]) => label(k)),
  };
}

export function featuresFrom(t: Technicals | null, peerLift: number | null, analystSignal: string | null): ModelFeatures {
  return {
    mom1: t?.return1Session ?? null,
    mom7: t?.return7Session ?? null,
    mom20: t?.return20Session ?? null,
    rsi: t?.rsi14 ?? null,
    atrPct: t?.atr14Pct ?? null,
    drawdownPct: t?.drawdownFromRecentHighPct ?? null,
    volumeStrengthPct: t?.volumeStrengthPct ?? null,
    supportBreak: t?.supportBreak === true,
    peerLift,
    analystSignal,
  };
}

// ---------- Action plan ----------

export type SellAction = "Exit candidate" | "Trim" | "Hold" | "Hold / add on strength";

export type SellIdea = {
  ticker: string;
  action: SellAction;
  probability: number;
  weightPct: number | null;
  unrealizedPLPct: number | null;
  horizon: string;
  reason: string;
  exitZone: string;
  riskLevel: string;
};

export type BuyIdea = {
  ticker: string;
  probability: number;
  horizon: string;
  entryZone: string;
  targetZone: string;
  stopLevel: string;
  reason: string;
  source: string;
};

export type ActionPlan = {
  sells: SellIdea[];
  buys: BuyIdea[];
  model: {
    name: string;
    calibrated: boolean;
    sampleSize: number;
    baseRate: number;
    horizonNote: string;
  };
};

function horizonFor(f: ModelFeatures): string {
  const m7 = f.mom7 ?? 0;
  const m20 = f.mom20 ?? 0;
  return m7 >= m20 ? "~2 weeks (10 sessions)" : "~1 month (20 sessions)";
}

const money = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : "$" + v.toFixed(2));

export function buildSellIdeas(
  inputs: Array<{
    ticker: string;
    features: ModelFeatures;
    technicals: Technicals | null;
    weightPct: number | null;
    unrealizedPLPct: number | null;
    concentrationLevel: string | null;
  }>,
  cal: Calibration,
): SellIdea[] {
  const out: SellIdea[] = [];
  for (const it of inputs) {
    const s = scoreFeatures(it.features, cal);
    const overweight = it.concentrationLevel !== null && /high|over|critical/i.test(it.concentrationLevel);
    let action: SellAction;
    if (s.probability < 0.38 || it.features.supportBreak) action = "Exit candidate";
    else if (s.probability < 0.50 || overweight) action = "Trim";
    else if (s.probability >= 0.62) action = "Hold / add on strength";
    else action = "Hold";

    const t = it.technicals;
    const exitZone = action === "Hold / add on strength"
      ? `Let it run; reassess near ${money(t?.resistance ?? null)}`
      : `Scale out between ${money(t?.price ?? null)} and ${money(t?.resistance ?? null)}; hard stop below ${money(t?.support ?? null)}`;

    const bits: string[] = [];
    if (s.detractors.length) bits.push(`weak signals: ${s.detractors.join(", ")}`);
    if (s.drivers.length) bits.push(`supportive: ${s.drivers.join(", ")}`);
    if (overweight) bits.push(`position weight ${it.weightPct?.toFixed(1) ?? "—"}% is above your concentration threshold`);

    out.push({
      ticker: it.ticker,
      action,
      probability: s.probability,
      weightPct: it.weightPct,
      unrealizedPLPct: it.unrealizedPLPct,
      horizon: horizonFor(it.features),
      reason: bits.join(" · ") || "Insufficient signal strength in either direction.",
      exitZone,
      riskLevel: it.features.atrPct === null ? "unknown" : it.features.atrPct > 8 ? "high" : it.features.atrPct > 4 ? "medium" : "low",
    });
  }
  // Weakest first — those are the ones to act on.
  out.sort((a, b) => a.probability - b.probability);
  return out;
}

export function buildBuyIdeas(
  candidates: Array<{ ticker: string; technicals: Technicals | null; source: string }>,
  cal: Calibration,
  excludeTickers: Set<string>,
  limit = 3,
): BuyIdea[] {
  const seen = new Set<string>();
  const scored: Array<BuyIdea & { _p: number }> = [];
  for (const c of candidates) {
    const sym = c.ticker.toUpperCase();
    if (excludeTickers.has(sym) || seen.has(sym) || !c.technicals) continue;
    seen.add(sym);
    const f = featuresFrom(c.technicals, null, null);
    const s = scoreFeatures(f, cal);
    if (s.probability < 0.55) continue;
    const t = c.technicals;
    const atrPct = t.atr14Pct ?? 3;
    const target = t.resistance && t.resistance > t.price ? t.resistance : t.price * (1 + Math.max(4, atrPct * 2) / 100);
    const stop = t.support && t.support < t.price ? t.support : t.price * (1 - Math.max(3, atrPct * 1.5) / 100);
    scored.push({
      _p: s.probability,
      ticker: sym,
      probability: s.probability,
      horizon: horizonFor(f),
      entryZone: `${money(t.price * 0.985)} – ${money(t.price * 1.01)}`,
      targetZone: money(target),
      stopLevel: money(stop),
      reason: s.drivers.length ? `Model drivers: ${s.drivers.join(", ")}` : "Balanced technical profile",
      source: c.source,
    });
  }
  scored.sort((a, b) => b._p - a._p || a.ticker.localeCompare(b.ticker));
  return scored.slice(0, limit).map(({ _p: _ignored, ...rest }) => rest);
}

export function modelMeta(cal: Calibration) {
  return {
    name: "Portfolio Action Model v1 (logistic, technical features)",
    calibrated: cal.calibrated,
    sampleSize: cal.sampleSize,
    baseRate: cal.baseRate,
    horizonNote: "Probabilities estimate a positive move over the next ~10 trading sessions, based on 10-session labelled outcomes from this app's own swing dataset.",
  };
}
