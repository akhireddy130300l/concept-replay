// Read-only shadow ML model view for the stock email.
// Displays the latest registered model's top picks and probabilities alongside
// the rule-based Swing Trader Watch pick without altering selection or prices.

export interface ModelViewPick {
  ticker: string;
  probability: number;
  label: string;
}

export interface ModelViewData {
  modelVersion: string;
  algorithm: string;
  status: string;
  labelHorizon: string;
  predictionDate: string;
  testPrecisionAt3?: number | null;
  testWinRate?: number | null;
  picks: ModelViewPick[];
  ruleSelectedTicker?: string | null;
  ruleSelectedProbability?: number | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tickerLink(base: string, ticker: string): string {
  if (!base) return esc(ticker);
  return `<a href="${base.replace(/\/+$/, "")}/stock-insight?ticker=${encodeURIComponent(ticker)}&source=stock-email" style="color:#4f46e5;text-decoration:none;font-weight:700;">${esc(ticker)}</a>`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function buildModelViewHTML(data: ModelViewData | null, appBaseUrl: string): string {
  if (!data || data.picks.length === 0) return "";

  const metricsParts: string[] = [];
  if (typeof data.testPrecisionAt3 === "number" && Number.isFinite(data.testPrecisionAt3)) {
    metricsParts.push(`Test Top-3 precision: ${pct(data.testPrecisionAt3)}`);
  }
  if (typeof data.testWinRate === "number" && Number.isFinite(data.testWinRate)) {
    metricsParts.push(`Test win rate: ${pct(data.testWinRate)}`);
  }
  const metricsLine = metricsParts.length > 0 ? ` · ${metricsParts.join(" · ")}` : "";

  const rows = data.picks.map((p, idx) => {
    const isPositive = p.label.toLowerCase() === "positive";
    const badgeBg = isPositive ? "#dcfce7" : "#f1f5f9";
    const badgeFg = isPositive ? "#166534" : "#475569";
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;">#${idx + 1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${tickerLink(appBaseUrl, p.ticker)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a;">${pct(p.probability)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;"><span style="display:inline-block;padding:2px 7px;border-radius:999px;background:${badgeBg};color:${badgeFg};font-weight:600;">${esc(p.label)}</span></td>
    </tr>`;
  }).join("");

  const ruleNote = data.ruleSelectedTicker && typeof data.ruleSelectedProbability === "number"
    ? `<p style="margin:8px 0 0 0;font-size:12px;color:#312e81;">Today's rule-based pick <strong>${esc(data.ruleSelectedTicker)}</strong> scored <strong>${pct(data.ruleSelectedProbability)}</strong> in this model batch.</p>`
    : "";

  return `
    <h3 style="margin:28px 0 10px 0;color:#0f172a;font-size:16px;">🤖 Model View <span style="font-weight:400;color:#64748b;font-size:13px;">(shadow · read-only)</span></h3>
    <div style="padding:14px 16px;background:#eef2ff;border:1px solid #c7d2fe;border-left:4px solid #4f46e5;border-radius:10px;">
      <p style="margin:0 0 10px 0;font-size:12px;color:#312e81;">
        <strong>${esc(data.algorithm)}</strong> (${esc(data.modelVersion)}) · ${esc(data.labelHorizon)} horizon · predictions for <strong>${esc(data.predictionDate)}</strong>${esc(metricsLine)}
      </p>
      <div style="overflow-x:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">RANK</th>
              <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">TICKER</th>
              <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">PROBABILITY</th>
              <th style="text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">SIGNAL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${ruleNote}
      <p style="margin:8px 0 0 0;font-size:11px;color:#4338ca;">Shadow mode only — this does not change the rule-based pick, entry, target, or stop-loss above.</p>
    </div>`;
}

// deno-lint-ignore no-explicit-any
export async function fetchLatestModelView(admin: any, ruleSelectedTicker?: string | null, topN = 5): Promise<ModelViewData | null> {
  const { data: latest, error: latestErr } = await admin
    .from("prediction_history")
    .select("prediction_date, model_version_id, model_version")
    .not("model_version_id", "is", null)
    .order("prediction_date", { ascending: false })
    .order("predicted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latest?.model_version_id || !latest?.prediction_date) return null;

  const [{ data: mv }, { data: preds }] = await Promise.all([
    admin
      .from("model_versions")
      .select("version, algorithm, status, label_horizon, metrics")
      .eq("id", latest.model_version_id)
      .maybeSingle(),
    admin
      .from("prediction_history")
      .select("ticker, predicted_probability, probability, predicted_label")
      .eq("model_version_id", latest.model_version_id)
      .eq("prediction_date", latest.prediction_date)
      .order("predicted_probability", { ascending: false, nullsFirst: false })
      .limit(Math.max(topN * 4, 20)),
  ]);

  if (!mv || !Array.isArray(preds) || preds.length === 0) return null;

  const seen = new Set<string>();
  const picks: ModelViewPick[] = [];
  for (const row of preds) {
    const ticker = String(row.ticker ?? "").trim().toUpperCase();
    const prob = Number(row.predicted_probability ?? row.probability);
    if (!ticker || !Number.isFinite(prob) || seen.has(ticker)) continue;
    seen.add(ticker);
    picks.push({
      ticker,
      probability: prob,
      label: String(row.predicted_label ?? (prob >= 0.5 ? "positive" : "negative")),
    });
    if (picks.length >= topN) break;
  }
  if (picks.length === 0) return null;

  let ruleSelectedProbability: number | null = null;
  const cleanRuleTicker = ruleSelectedTicker?.trim().toUpperCase() || null;
  if (cleanRuleTicker) {
    const inTop = picks.find((p) => p.ticker === cleanRuleTicker);
    if (inTop) {
      ruleSelectedProbability = inTop.probability;
    } else {
      const { data: match } = await admin
        .from("prediction_history")
        .select("predicted_probability, probability")
        .eq("model_version_id", latest.model_version_id)
        .eq("prediction_date", latest.prediction_date)
        .eq("ticker", cleanRuleTicker)
        .limit(1)
        .maybeSingle();
      const p = Number(match?.predicted_probability ?? match?.probability);
      if (Number.isFinite(p)) ruleSelectedProbability = p;
    }
  }

  const testMetrics = mv.metrics?.test ?? null;
  return {
    modelVersion: String(mv.version ?? latest.model_version ?? "unknown"),
    algorithm: String(mv.algorithm ?? "model"),
    status: String(mv.status ?? "shadow"),
    labelHorizon: String(mv.label_horizon ?? "10_session"),
    predictionDate: String(latest.prediction_date),
    testPrecisionAt3: typeof testMetrics?.precision_at_3 === "number" ? testMetrics.precision_at_3 : null,
    testWinRate: typeof testMetrics?.ev_win_rate === "number" ? testMetrics.ev_win_rate : null,
    picks,
    ruleSelectedTicker: cleanRuleTicker,
    ruleSelectedProbability,
  };
}