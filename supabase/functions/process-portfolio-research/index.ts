// process-portfolio-research
// JWT-disabled. Requires x-internal-dispatch header matching INTERNAL_DISPATCH_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { YahooRunCache } from "../_shared/yahoo-chart.ts";
import { fetchFinnhubRecommendation, fetchFinnhubPeers } from "../_shared/finnhub.ts";
import { classifySupport, classifyVolume, computeTechnicals, classifyRsi } from "../_shared/technicals.ts";
import {
  applyWeights,
  classifyPeerCondition,
  computeHoldingMetrics,
  computePeerAnalysis,
  computeTotals,
  DEFAULT_CONCENTRATION_THRESHOLDS,
  peerClassificationToAssessmentType,
  type AssessmentType,
} from "../_shared/portfolio-calc.ts";
import { fallbackInterpretation, generateInterpretation, GEMINI_MODEL } from "../_shared/ai-gateway.ts";
import { renderPrivateReportHtml, sendPrivateReport, type HoldingReportRow, type PeerDetail } from "../_shared/email-private.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-internal-dispatch",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const DISPATCH_SECRET = Deno.env.get("INTERNAL_DISPATCH_SECRET");
  const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY");
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !DISPATCH_SECRET) {
    return resp(500, { error: "server_misconfigured" });
  }

  const provided = req.headers.get("x-internal-dispatch");
  if (!provided || provided !== DISPATCH_SECRET) {
    return resp(403, { error: "forbidden" });
  }

  let body: any;
  try { body = await req.json(); } catch { return resp(400, { error: "invalid_json" }); }
  const requestId = body?.request_id;
  if (typeof requestId !== "string" || requestId.length < 8) {
    return resp(400, { error: "missing_request_id" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  try {

  const transition = await admin
    .from("portfolio_research_requests")
    .update({ status: "running", started_at: new Date().toISOString(), attempts: 1 })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, user_id, cash_balance, concentration_basis, created_at")
    .maybeSingle();
  if (transition.error) return resp(500, { error: "transition_failed" });
  if (!transition.data) return resp(200, { ok: true, noop: true });
  const reqRow = transition.data;
  const userId = reqRow.user_id as string;
  const requestedAtUtcIso = (reqRow.created_at as string) ?? new Date().toISOString();

  const userLookup = await admin.auth.admin.getUserById(userId);
  if (userLookup.error || !userLookup.data?.user) {
    await markFailed(admin, requestId, "user_lookup_failed");
    return resp(200, { ok: false, reason: "user_lookup_failed" });
  }
  const authUser = userLookup.data.user;
  const recipientEmail = authUser.email && authUser.email_confirmed_at ? authUser.email : null;
  if (!recipientEmail) {
    await markFailed(admin, requestId, "no_confirmed_recipient_email");
    return resp(200, { ok: false, reason: "no_confirmed_recipient_email" });
  }

  // User timezone (for local email timestamp).
  const prefRes = await admin.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle();
  const userTimezone = typeof prefRes.data?.timezone === "string" && prefRes.data.timezone.length > 0
    ? prefRes.data.timezone : null;

  const itemsRes = await admin
    .from("portfolio_research_request_items")
    .select("id, ticker, shares, average_cost, purchase_date")
    .eq("request_id", requestId);
  if (itemsRes.error || !itemsRes.data || itemsRes.data.length === 0) {
    await markFailed(admin, requestId, "items_load_failed");
    return resp(200, { ok: false, reason: "items_load_failed" });
  }
  const items = itemsRes.data;

  const settingsRes = await admin.from("user_portfolio_settings").select("concentration_thresholds").eq("user_id", userId).maybeSingle();
  const thresholds = (settingsRes.data?.concentration_thresholds as any) ?? DEFAULT_CONCENTRATION_THRESHOLDS;

  const startedRunAt = Date.now();
  const toolsAttempted: string[] = [];
  const toolsSucceeded: string[] = [];
  const missingDataSummary: Record<string, string[]> = {};

  // 1) Finnhub peers (dynamic, no hardcoded fallback).
  toolsAttempted.push("finnhub.peers");
  const peerMap = new Map<string, string[] | null>();
  if (FINNHUB_KEY) {
    await Promise.all(items.map(async (it) => {
      const r = await fetchFinnhubPeers(it.ticker, FINNHUB_KEY, 8);
      peerMap.set(it.ticker, r.ok ? r.peers : null);
    }));
    if ([...peerMap.values()].some((v) => v && v.length > 0)) toolsSucceeded.push("finnhub.peers");
  } else {
    for (const it of items) peerMap.set(it.ticker, null);
  }

  // 2) Build full Yahoo symbol set (holdings + peers).
  toolsAttempted.push("yahoo.chart");
  const allSymbols = new Set<string>();
  for (const it of items) allSymbols.add(it.ticker.toUpperCase());
  for (const peers of peerMap.values()) if (peers) for (const p of peers) allSymbols.add(p);

  const cache = new YahooRunCache();
  const yahooResults = await cache.getMany([...allSymbols], 8);
  if ([...yahooResults.values()].some((r) => r.ok)) toolsSucceeded.push("yahoo.chart");

  // 3) Analyst recommendation for owned holdings only.
  toolsAttempted.push("finnhub.recommendation");
  const analystMap = new Map<string, Awaited<ReturnType<typeof fetchFinnhubRecommendation>>>();
  if (FINNHUB_KEY) {
    await Promise.all(items.map(async (it) => {
      const r = await fetchFinnhubRecommendation(it.ticker, FINNHUB_KEY);
      analystMap.set(it.ticker, r);
    }));
    if ([...analystMap.values()].some((v) => v !== null)) toolsSucceeded.push("finnhub.recommendation");
  }

  // 4) Per-holding metrics + classifications.
  const holdingRows: HoldingReportRow[] = [];
  const baseMetricsList: ReturnType<typeof computeHoldingMetrics>[] = [];
  const evidenceHoldings: any[] = [];

  for (const it of items) {
    const missing: string[] = [];
    const ownYahoo = yahooResults.get(it.ticker.toUpperCase());
    if (!ownYahoo || !ownYahoo.ok) missing.push("market_price");
    const price = ownYahoo && ownYahoo.ok ? ownYahoo.chart.price : 0;
    const metrics = computeHoldingMetrics(
      { ticker: it.ticker, shares: Number(it.shares), averageCost: it.average_cost === null ? null : Number(it.average_cost), purchaseDate: it.purchase_date },
      price,
    );
    baseMetricsList.push(metrics);

    const technicals = ownYahoo && ownYahoo.ok ? computeTechnicals(ownYahoo.chart) : null;
    if (!technicals) missing.push("technicals");
    const supportCondition = technicals ? classifySupport(technicals) : null;
    const volumeCondition = technicals ? classifyVolume(technicals) : null;
    const rsiCategory = classifyRsi(technicals?.rsi14 ?? null);

    // Peer details (per-peer rows for the email).
    const finnhubReturned = peerMap.get(it.ticker)?.length ?? 0;
    const peerDetails: PeerDetail[] = [];
    const peersUnavailable: string[] = [];
    const peers = peerMap.get(it.ticker) ?? null;
    if (peers) {
      for (const sym of peers) {
        const r = yahooResults.get(sym.toUpperCase());
        if (!r || !r.ok) { peersUnavailable.push(sym); continue; }
        const t = computeTechnicals(r.chart);
        peerDetails.push({
          symbol: sym,
          available: true,
          price: t.price,
          return1Session: t.return1Session,
          return7Session: t.return7Session,
          condition: classifyPeerCondition(t.return1Session),
        });
      }
    }

    let peerAnalysis: ReturnType<typeof computePeerAnalysis>;
    if (!peers || peers.length === 0) {
      peerAnalysis = { available: false, reason: "no_peers" };
      missing.push("peer_analysis");
    } else {
      const peerReturns = peerDetails.map((p) => ({ symbol: p.symbol, return1Session: p.return1Session }));
      peerAnalysis = computePeerAnalysis(technicals?.return1Session ?? null, peerReturns);
      if (!peerAnalysis.available) missing.push("peer_analysis");
    }

    const analyst = analystMap.get(it.ticker) ?? null;
    if (!analyst) missing.push("analyst");

    if (missing.length > 0) missingDataSummary[it.ticker] = missing;

    holdingRows.push({
      metrics, technicals, supportCondition, volumeCondition, analyst, peerAnalysis,
      peerDetails, peersUnavailable, finnhubPeersReturned: finnhubReturned, missingData: missing,
    });

    const detAssess: AssessmentType = peerAnalysis.available
      ? peerClassificationToAssessmentType(peerAnalysis.classification)
      : "peer-unavailable";

    evidenceHoldings.push({
      ticker: it.ticker,
      hasPrice: !!(ownYahoo && ownYahoo.ok),
      return1Session: technicals?.return1Session ?? null,
      return7Session: technicals?.return7Session ?? null,
      return20Session: technicals?.return20Session ?? null,
      rsi14: technicals?.rsi14 ?? null,
      rsiCategory,
      atr14Pct: technicals?.atr14Pct ?? null,
      drawdownFromRecentHighPct: technicals?.drawdownFromRecentHighPct ?? null,
      supportCondition,
      volumeCondition,
      analystSignal: analyst?.signal ?? null,
      analystRecommendationRatings: analyst?.totalAnalysts ?? null,
      analystPeriod: analyst?.period ?? null,
      peer: peerAnalysis.available
        ? {
            classification: peerAnalysis.classification,
            peersFalling: peerAnalysis.peersFalling,
            peerCount: peerAnalysis.peerCount,
            peersFallingPct: peerAnalysis.peersFallingPct,
            peersFallingAtLeast5Pct: peerAnalysis.peersFallingAtLeast5Pct,
            median1S: peerAnalysis.medianPeerOneSessionReturn,
            peersAnalyzed: peerDetails.map((p) => ({ symbol: p.symbol, return1Session: p.return1Session })),
          }
        : { available: false, reason: (peerAnalysis as any).reason ?? "unavailable" },
      deterministicAssessmentTypeForHolding: detAssess,
      missingData: missing,
    });
  }

  // 5) Totals + weights.
  const cashBalance = reqRow.cash_balance === null || reqRow.cash_balance === undefined ? null : Number(reqRow.cash_balance);
  const declaredAccountTotal = reqRow.concentration_basis === "account_total";
  const totals = computeTotals(baseMetricsList, cashBalance, declaredAccountTotal);
  applyWeights(baseMetricsList, totals, thresholds);

  // 6) Portfolio-level deterministic assessment type.
  const types = evidenceHoldings.map((h: any) => h.deterministicAssessmentTypeForHolding as AssessmentType);
  const portfolioAssessment: AssessmentType = deriveDominantAssessment(types);

  // 7) Gemini.
  toolsAttempted.push("gemini");
  const evidence = {
    concentrationBasis: totals.basis,
    accountConcentrationAvailable: totals.accountConcentrationAvailable,
    weightLabel: totals.weightLabel,
    deterministicAssessmentType: portfolioAssessment,
    holdings: evidenceHoldings.map((h, idx) => ({
      ...h,
      weightPctOfBasis: baseMetricsList[idx].weightPct,
      accountConcentrationLevel: baseMetricsList[idx].concentrationLevel, // null if submitted_only
      unrealizedPLPct: baseMetricsList[idx].unrealizedPLPct,
      averageCostKnown: baseMetricsList[idx].averageCost !== null,
    })),
  };
  let interpretation = fallbackInterpretation();
  let geminiOk = false;
  if (LOVABLE_KEY) {
    const ai = await generateInterpretation(evidence, LOVABLE_KEY);
    if (ai.ok) {
      interpretation = ai.data;
      toolsSucceeded.push("gemini");
      geminiOk = true;
    }
  }

  // 8) Deterministic overrides on Gemini output.
  // Force assessment_type to deterministic value.
  if (interpretation.assessment_type !== portfolioAssessment) {
    interpretation = { ...interpretation, assessment_type: portfolioAssessment };
  }
  // Submitted-only: forbid Concentration review unless any holding has true account-level Very high/Critical.
  if (totals.basis === "submitted_only" && interpretation.status === "Concentration review") {
    interpretation = {
      ...interpretation,
      status: "Monitor",
      interpretation: interpretation.interpretation +
        " (Status downgraded: full-account concentration was not assessed because cash balance and full-account declaration were not provided.)",
    };
  }

  // 9) Render + send email.
  toolsAttempted.push("resend.email");
  const html = renderPrivateReportHtml({
    totals,
    holdings: holdingRows,
    interpretation,
    requestedAtUtcIso,
    userTimezone,
  });
  let emailSent = false;
  if (RESEND_KEY) {
    const sendRes = await sendPrivateReport(recipientEmail, html, RESEND_KEY);
    if (sendRes.ok) { emailSent = true; toolsSucceeded.push("resend.email"); }
  }

  // 10) Persist computed fields.
  for (let i = 0; i < items.length; i++) {
    const m = baseMetricsList[i];
    const row = holdingRows[i];
    await admin.from("portfolio_research_request_items")
      .update({
        market_price: m.marketPrice,
        market_value: m.marketValue,
        unrealized_pl: m.unrealizedPL,
        unrealized_pl_pct: m.unrealizedPLPct,
        weight_pct: m.weightPct,
        concentration_level: m.concentrationLevel, // null when submitted_only
        support_condition: row.supportCondition,
        peer_condition: row.peerAnalysis && row.peerAnalysis.available ? row.peerAnalysis.classification : "Peer analysis unavailable",
        price_condition: row.volumeCondition,
        position_status: interpretation.status,
        data_sources: {
          yahoo: yahooResults.get(items[i].ticker.toUpperCase())?.ok === true,
          finnhub_recommendation: !!analystMap.get(items[i].ticker),
          finnhub_peers: !!peerMap.get(items[i].ticker),
        },
        missing_data: { items: row.missingData, peers_market_data_unavailable: row.peersUnavailable },
      })
      .eq("id", items[i].id);
  }

  await admin.from("agent_runs").insert({
    request_id: requestId,
    user_id: userId,
    tools_attempted: toolsAttempted,
    tools_succeeded: toolsSucceeded,
    missing_data_summary: missingDataSummary,
    final_decision_status: interpretation.status,
    confidence: interpretation.confidence,
    email_sent: emailSent,
    started_at: new Date(startedRunAt).toISOString(),
    completed_at: new Date().toISOString(),
    safe_error_summary: geminiOk ? null : "gemini_fallback_used",
  });

  await admin.from("portfolio_research_requests").update({
    status: "completed",
    final_decision_status: interpretation.status,
    confidence: interpretation.confidence,
    email_sent: emailSent,
    peer_count: [...peerMap.values()].reduce((s, p) => s + (p?.length ?? 0), 0),
    completed_at: new Date().toISOString(),
  }).eq("id", requestId);

  return resp(200, { ok: true, request_id: requestId, gemini_model: GEMINI_MODEL, email_sent: emailSent });
  } catch (err) {
    console.error("process-portfolio-research unexpected error", err);
    try { await markFailed(admin, requestId, "unexpected_error"); } catch { /* swallow */ }
    return resp(200, { ok: false, reason: "unexpected_error" });
  }
});

function deriveDominantAssessment(types: AssessmentType[]): AssessmentType {
  if (types.length === 0) return "insufficient";
  const counts: Record<string, number> = {};
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1;
  // Priority for ties.
  const order: AssessmentType[] = ["broad-peer-weakness", "mixed", "stock-specific", "peer-unavailable", "insufficient"];
  let best: AssessmentType = types[0];
  let bestCount = counts[best];
  for (const t of order) {
    if ((counts[t] ?? 0) > bestCount) { best = t; bestCount = counts[t]; }
  }
  return best;
}

async function markFailed(admin: ReturnType<typeof createClient>, requestId: string, summary: string) {
  await admin.from("portfolio_research_requests").update({
    status: "failed",
    error_summary: summary,
    completed_at: new Date().toISOString(),
  }).eq("id", requestId);
}
