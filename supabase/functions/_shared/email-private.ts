// Private portfolio report email renderer + sender via Resend.
// Inline CSS only. Never log monetary values. Never store rendered HTML.

import type { HoldingMetrics, PeerAnalysis, PortfolioTotals } from "./portfolio-calc.ts";
import type { Technicals, SupportCondition, VolumeCondition } from "./technicals.ts";
import type { AnalystRecommendation } from "./finnhub.ts";
import type { Interpretation } from "./ai-gateway.ts";

export type HoldingReportRow = {
  metrics: HoldingMetrics;
  technicals: Technicals | null;
  supportCondition: SupportCondition | null;
  volumeCondition: VolumeCondition | null;
  analyst: AnalystRecommendation | null;
  peerAnalysis: PeerAnalysis | null;
  missingData: string[];
};

export type ReportInput = {
  totals: PortfolioTotals;
  holdings: HoldingReportRow[];
  interpretation: Interpretation;
  requestedAt: string; // ISO
};

const fmtMoney = (v: number | null) =>
  v === null ? "<span style=\"color:#9ca3af\">Average cost unavailable</span>" :
  (v >= 0 ? "" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (v: number | null) =>
  v === null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function holdingCard(h: HoldingReportRow, weightLabel: string): string {
  const m = h.metrics;
  const t = h.technicals;
  const peer = h.peerAnalysis;
  const peerLine = !peer ? "Peer analysis unavailable"
    : !peer.available ? "Peer analysis unavailable"
    : `${peer.classification} — ${peer.peersFalling}/${peer.peerCount} peers down, ${peer.peersFallingAtLeast5Pct} down ≥5%, median ${fmtPct(peer.medianPeerOneSessionReturn)}`;
  const analyst = h.analyst ? `${h.analyst.signal} (${h.analyst.totalAnalysts} analysts, ${esc(h.analyst.period)})` : "No coverage";

  return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 14px 0;background:#ffffff;">
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;">${esc(m.ticker)} · ${fmtPrice(m.marketPrice)}</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#1f2937;">
        <tr><td style="padding:3px 0;width:55%;">Shares</td><td style="padding:3px 0;text-align:right;">${m.shares}</td></tr>
        <tr><td style="padding:3px 0;">Average cost</td><td style="padding:3px 0;text-align:right;">${m.averageCost === null ? "<span style=\"color:#9ca3af\">unavailable</span>" : fmtPrice(m.averageCost)}</td></tr>
        <tr><td style="padding:3px 0;">Market value</td><td style="padding:3px 0;text-align:right;">${fmtPrice(m.marketValue)}</td></tr>
        <tr><td style="padding:3px 0;">Unrealized P/L</td><td style="padding:3px 0;text-align:right;">${m.unrealizedPL === null ? "<span style=\"color:#9ca3af\">Average cost unavailable</span>" : fmtMoney(m.unrealizedPL) + " (" + fmtPct(m.unrealizedPLPct) + ")"}</td></tr>
        <tr><td style="padding:3px 0;">${esc(weightLabel)}</td><td style="padding:3px 0;text-align:right;">${fmtPct(m.weightPct)} · ${esc(m.concentrationLevel ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;">1-session / 7-session / 20-session</td><td style="padding:3px 0;text-align:right;">${fmtPct(t?.return1Session ?? null)} / ${fmtPct(t?.return7Session ?? null)} / ${fmtPct(t?.return20Session ?? null)}</td></tr>
        <tr><td style="padding:3px 0;">Support / drawdown from recent high</td><td style="padding:3px 0;text-align:right;">${esc(h.supportCondition ?? "—")} · ${fmtPct(t?.drawdownFromRecentHighPct ?? null)}</td></tr>
        <tr><td style="padding:3px 0;">Volume condition</td><td style="padding:3px 0;text-align:right;">${esc(h.volumeCondition ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;">Analyst signal</td><td style="padding:3px 0;text-align:right;">${esc(analyst)}</td></tr>
        <tr><td style="padding:3px 0;">Peer analysis</td><td style="padding:3px 0;text-align:right;">${esc(peerLine)}</td></tr>
      </table>
      ${h.missingData.length > 0 ? `<div style="margin-top:10px;font-size:12px;color:#92400e;background:#fef3c7;padding:8px 10px;border-radius:8px;">Missing data: ${esc(h.missingData.join(", "))}</div>` : ""}
    </div>
  `;
}

export function renderPrivateReportHtml(input: ReportInput): string {
  const { totals, holdings, interpretation, requestedAt } = input;
  const rows = holdings.map((h) => holdingCard(h, totals.weightLabel)).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Portfolio Research Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;padding:24px;">
        <tr><td>
          <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Private · Decision support only</div>
          <h1 style="margin:6px 0 4px 0;font-size:22px;color:#111827;">Portfolio Research Report</h1>
          <div style="font-size:13px;color:#6b7280;margin-bottom:14px;">Requested ${esc(requestedAt)}</div>

          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px;margin-bottom:18px;">
            <div style="font-size:13px;color:#4338ca;font-weight:700;">Status: ${esc(interpretation.status)} · Confidence: ${esc(interpretation.confidence)}</div>
            <div style="font-size:13px;color:#1f2937;margin-top:6px;">${esc(interpretation.interpretation)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:8px;">Assessment type: ${esc(interpretation.assessment_type)}</div>
          </div>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 14px 0;font-size:13px;color:#1f2937;">
            <tr><td style="padding:4px 0;">Holdings value</td><td style="padding:4px 0;text-align:right;">${fmtPrice(totals.totalHoldingValue)}</td></tr>
            <tr><td style="padding:4px 0;">Cash balance</td><td style="padding:4px 0;text-align:right;">${totals.cashBalance === null ? "<span style=\"color:#9ca3af\">not provided</span>" : fmtPrice(totals.cashBalance)}</td></tr>
            <tr><td style="padding:4px 0;font-weight:700;">Total (${esc(totals.basis === "account_total" ? "account total" : "submitted only")})</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmtPrice(totals.totalPortfolioValue)}</td></tr>
          </table>

          ${rows}

          <div style="font-size:12px;color:#6b7280;background:#f9fafb;border-radius:8px;padding:12px;margin-top:8px;">
            This report uses the latest available regular-session data and is decision support only. It does not automatically buy or sell securities.
            Concentration thresholds shown here are configurable application risk settings, not universal investment rules.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type SendResult = { ok: true; messageId: string } | { ok: false; reason: string; status: number | null };

export async function sendPrivateReport(
  recipientEmail: string,
  html: string,
  resendApiKey: string,
  fromAddress = "LearnLoop Research <onboarding@resend.dev>",
): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipientEmail],
        subject: "[PRIVATE] Portfolio Research Report",
        html,
      }),
    });
    const status = res.status;
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (status >= 200 && status < 300 && json?.id) {
      return { ok: true, messageId: json.id };
    }
    return { ok: false, reason: `resend_status_${status}`, status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "unknown_error", status: null };
  }
}
