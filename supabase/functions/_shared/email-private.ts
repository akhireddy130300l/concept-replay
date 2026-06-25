// Private portfolio report email renderer + sender via Resend.
// Inline CSS only. Never log monetary values. Never store rendered HTML.

import type { HoldingMetrics, PeerAnalysis, PortfolioTotals, PeerCondition } from "./portfolio-calc.ts";
import { classifyPeerCondition } from "./portfolio-calc.ts";
import type { Technicals, SupportCondition, VolumeCondition, RsiCategory } from "./technicals.ts";
import { classifyRsi, rsiWording } from "./technicals.ts";
import type { AnalystRecommendation } from "./finnhub.ts";
import type { Interpretation } from "./ai-gateway.ts";

export type PeerDetail = {
  symbol: string;
  available: boolean; // valid Yahoo data
  price: number | null;
  return1Session: number | null;
  return7Session: number | null;
  condition: PeerCondition;
};

export type HoldingReportRow = {
  metrics: HoldingMetrics;
  technicals: Technicals | null;
  supportCondition: SupportCondition | null;
  volumeCondition: VolumeCondition | null;
  analyst: AnalystRecommendation | null;
  peerAnalysis: PeerAnalysis | null;
  peerDetails: PeerDetail[];           // peers with valid market data (deduped, excludes self)
  peersUnavailable: string[];          // returned by Finnhub but Yahoo failed
  finnhubPeersReturned: number;        // raw count from Finnhub (before Yahoo validation)
  missingData: string[];
};

export type ReportInput = {
  totals: PortfolioTotals;
  holdings: HoldingReportRow[];
  interpretation: Interpretation;
  requestedAtUtcIso: string;
  userTimezone: string | null;
};

const fmtMoney = (v: number | null) =>
  v === null ? "<span style=\"color:#9ca3af\">Average cost unavailable</span>" :
  (v >= 0 ? "" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (v: number | null) =>
  v === null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatLocalTimestamp(utcIso: string, timezone: string | null): string {
  const d = new Date(utcIso);
  if (timezone) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
        timeZoneName: "short",
      });
      return fmt.format(d);
    } catch { /* fall through to UTC */ }
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  return `${fmt.format(d)} UTC`;
}

function peerConditionColor(c: PeerCondition): string {
  switch (c) {
    case "Rising": return "#047857";
    case "Stable": return "#374151";
    case "Falling": return "#b45309";
    case "Sharp decline": return "#b91c1c";
    case "Data unavailable": return "#9ca3af";
  }
}

function peerTable(h: HoldingReportRow): string {
  if (h.peerDetails.length === 0 && h.peersUnavailable.length === 0) {
    return `<div style="font-size:13px;color:#6b7280;margin:8px 0 0 0;">Peer analysis unavailable — Finnhub returned no valid company peers.</div>`;
  }
  if (h.peerDetails.length === 0) {
    return `<div style="font-size:13px;color:#6b7280;margin:8px 0 0 0;">Peer analysis unavailable — market data could not be retrieved for the returned peers.</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Market data unavailable for: ${esc(h.peersUnavailable.join(", "))}</div>`;
  }
  const rows = h.peerDetails.map((p) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">${esc(p.symbol)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtPrice(p.price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtPct(p.return1Session)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtPct(p.return7Session)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:${peerConditionColor(p.condition)};">${esc(p.condition)}</td>
    </tr>
  `).join("");
  const summary = h.peerAnalysis && h.peerAnalysis.available
    ? `<div style="font-size:12px;color:#374151;margin-top:8px;">
        ${esc(h.peerAnalysis.classification)}: ${h.peerAnalysis.peersFalling} of ${h.peerAnalysis.peerCount} analyzed peers declined.
        ${h.peerAnalysis.peersFallingAtLeast5Pct > 0 ? `${h.peerAnalysis.peersFallingAtLeast5Pct} declined by at least 5%. ` : ""}
        Median peer one-session return: ${fmtPct(h.peerAnalysis.medianPeerOneSessionReturn)}.
        Peers falling: ${h.peerAnalysis.peersFallingPct.toFixed(1)}%.
      </div>`
    : "";
  const unavail = h.peersUnavailable.length > 0
    ? `<div style="font-size:12px;color:#6b7280;margin-top:6px;">Market data unavailable for: ${esc(h.peersUnavailable.join(", "))}</div>`
    : "";
  const source = `<div style="font-size:11px;color:#9ca3af;margin-top:6px;">Peers: Finnhub company peers. Market performance: Yahoo Finance regular-session data.</div>`;
  return `
    <div style="margin-top:14px;">
      <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px;">Peer comparison</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;color:#1f2937;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">Peer</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">Price</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">1-session</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">7-session</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;">Condition</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${summary}
      ${unavail}
      ${source}
    </div>
  `;
}

function holdingCard(h: HoldingReportRow, weightLabel: string, basis: "submitted_only" | "account_total"): string {
  const m = h.metrics;
  const t = h.technicals;
  const rsiCat: RsiCategory = classifyRsi(t?.rsi14 ?? null);
  const analyst = h.analyst
    ? `${h.analyst.signal} — ${h.analyst.totalAnalysts} recommendation ratings (${esc(h.analyst.period)})`
    : "No coverage";

  // Weight wording differs by basis.
  const weightCell = m.weightPct === null ? "—"
    : basis === "account_total"
      ? `${fmtPct(m.weightPct)} · ${esc(m.concentrationLevel ?? "—")}`
      : `${fmtPct(m.weightPct)} of submitted holdings — full-account concentration was not assessed`;

  return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 14px 0;background:#ffffff;">
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;">${esc(m.ticker)} · ${fmtPrice(m.marketPrice)}</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#1f2937;">
        <tr><td style="padding:3px 0;width:55%;">Shares</td><td style="padding:3px 0;text-align:right;">${m.shares}</td></tr>
        <tr><td style="padding:3px 0;">Average cost</td><td style="padding:3px 0;text-align:right;">${m.averageCost === null ? "<span style=\"color:#9ca3af\">unavailable</span>" : fmtPrice(m.averageCost)}</td></tr>
        <tr><td style="padding:3px 0;">Market value</td><td style="padding:3px 0;text-align:right;">${fmtPrice(m.marketValue)}</td></tr>
        <tr><td style="padding:3px 0;">Unrealized P/L</td><td style="padding:3px 0;text-align:right;">${m.unrealizedPL === null ? "<span style=\"color:#9ca3af\">Average cost unavailable</span>" : fmtMoney(m.unrealizedPL) + " (" + fmtPct(m.unrealizedPLPct) + ")"}</td></tr>
        <tr><td style="padding:3px 0;">${esc(weightLabel)}</td><td style="padding:3px 0;text-align:right;">${weightCell}</td></tr>
        <tr><td style="padding:3px 0;">1-session / 7-session / 20-session</td><td style="padding:3px 0;text-align:right;">${fmtPct(t?.return1Session ?? null)} / ${fmtPct(t?.return7Session ?? null)} / ${fmtPct(t?.return20Session ?? null)}</td></tr>
        <tr><td style="padding:3px 0;">RSI(14)</td><td style="padding:3px 0;text-align:right;">${t?.rsi14 !== null && t?.rsi14 !== undefined ? t.rsi14.toFixed(2) : "—"} · ${esc(rsiCat)}</td></tr>
        <tr><td style="padding:3px 0;">Support / drawdown from recent high</td><td style="padding:3px 0;text-align:right;">${esc(h.supportCondition ?? "—")} · ${fmtPct(t?.drawdownFromRecentHighPct ?? null)}</td></tr>
        <tr><td style="padding:3px 0;">Volume condition</td><td style="padding:3px 0;text-align:right;">${esc(h.volumeCondition ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;">Analyst signal</td><td style="padding:3px 0;text-align:right;">${esc(analyst)}</td></tr>
      </table>
      <div style="margin-top:8px;font-size:12px;color:#4b5563;">${esc(rsiWording(t?.rsi14 ?? null))}</div>
      ${peerTable(h)}
      ${h.missingData.length > 0 ? `<div style="margin-top:10px;font-size:12px;color:#92400e;background:#fef3c7;padding:8px 10px;border-radius:8px;">Missing data: ${esc(h.missingData.join(", "))}</div>` : ""}
    </div>
  `;
}

export function renderPrivateReportHtml(input: ReportInput): string {
  const { totals, holdings, interpretation, requestedAtUtcIso, userTimezone } = input;
  const localTs = formatLocalTimestamp(requestedAtUtcIso, userTimezone);
  const rows = holdings.map((h) => holdingCard(h, totals.weightLabel, totals.basis)).join("");
  const submittedOnlyBanner = totals.basis === "submitted_only" ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 14px;margin:0 0 14px 0;color:#78350f;font-size:13px;">
      This analysis covers only the holdings submitted in this request. Full-account concentration was not assessed. Submit all holdings and your cash balance with "this represents my full account" to evaluate account-level concentration.
    </div>` : "";

  const basisExplanation = totals.basis === "account_total"
    ? "Concentration basis: account total (submitted holdings + cash balance you declared as your full account)."
    : "Concentration basis: submitted holdings only. Weight figures show each holding's share of the submitted subset, not your real account.";

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Portfolio Research Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;padding:24px;">
        <tr><td>
          <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">Private · Decision support only</div>
          <h1 style="margin:6px 0 4px 0;font-size:22px;color:#111827;">Portfolio Research Report</h1>
          <div style="font-size:13px;color:#6b7280;margin-bottom:14px;">Requested ${esc(localTs)}</div>

          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-size:13px;color:#4338ca;font-weight:700;">Status: ${esc(interpretation.status)} · Confidence: ${esc(interpretation.confidence)}</div>
            <div style="font-size:13px;color:#1f2937;margin-top:6px;">${esc(interpretation.interpretation)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:8px;">Assessment type: ${esc(interpretation.assessment_type)}</div>
          </div>

          ${submittedOnlyBanner}

          <div style="font-size:12px;color:#374151;margin:0 0 12px 0;">${esc(basisExplanation)}</div>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 14px 0;font-size:13px;color:#1f2937;">
            <tr><td style="padding:4px 0;">Holdings value</td><td style="padding:4px 0;text-align:right;">${fmtPrice(totals.totalHoldingValue)}</td></tr>
            <tr><td style="padding:4px 0;">Cash balance</td><td style="padding:4px 0;text-align:right;">${totals.cashBalance === null ? "<span style=\"color:#9ca3af\">not provided</span>" : fmtPrice(totals.cashBalance)}</td></tr>
            <tr><td style="padding:4px 0;font-weight:700;">Total (${esc(totals.basis === "account_total" ? "account total" : "submitted only")})</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmtPrice(totals.totalPortfolioValue)}</td></tr>
          </table>

          ${rows}

          <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Data sources — Market prices and OHLCV: Yahoo Finance (regular session). Analyst recommendation ratings and company peers: Finnhub.</div>
          <div style="font-size:12px;color:#6b7280;background:#f9fafb;border-radius:8px;padding:12px;margin-top:10px;">
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
