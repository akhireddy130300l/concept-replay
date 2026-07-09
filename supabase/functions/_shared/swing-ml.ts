// Swing Trader Watch — ML training data pipeline.
// - saveTrainingExamples: one row per checked ticker per run.
// - updateOutcomes: refresh outcome rows for examples from the last 40 sessions.
// - getMLTrainingStats: counts for the ML Training Data email section.
// All operations are best-effort; failures are logged and never block email delivery.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CheckedTicker, SwingResult, SwingTickerInput } from "./swing-watch.ts";
import { fetchYahooChartWithRetry } from "./yahoo-chart.ts";

export type MLTrainingStats = {
  savedToday: number;
  pending: number;
  completed: number;
  totalRows: number;
  totalOutcomes: number;
};

const KEYWORD_SIGNAL_KEYS: Record<string, string> = {
  "revenue growth": "has_revenue_growth_signal",
  "raised outlook": "has_raised_outlook_signal",
  "beat earnings": "has_earnings_beat_signal",
  "upgraded": "has_analyst_upgrade_signal",
  "price target raised": "has_price_target_raise_signal",
  "FDA approval": "has_fda_approval_signal",
  "contract win": "has_contract_win_signal",
  "partnership": "has_partnership_signal",
  "lawsuit": "has_lawsuit_signal",
  "investigation": "has_investigation_signal",
  "downgrade": "has_downgrade_signal",
  "earnings miss": "has_earnings_miss_signal",
  "guidance cut": "has_guidance_cut_signal",
  "insider selling": "has_insider_selling_signal",
  "cash burn": "has_cash_burn_signal",
  "margin pressure": "has_margin_pressure_signal",
};

export async function saveTrainingExamples(
  admin: SupabaseClient,
  result: SwingResult,
  inputs: SwingTickerInput[],
  userId: string | null,
  runId: string | null,
): Promise<number> {
  try {
    const inputByTicker = new Map(inputs.map((i) => [i.ticker, i]));
    const rows: any[] = [];
    const checkedDateEt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    for (const r of result.all) {
      const inp = inputByTicker.get(r.ticker);
      const d = r.deep;
      const positives = new Set(d?.positive_factors || []);
      const negatives = new Set(d?.key_risks || []);
      const signalFlags: Record<string, boolean> = {};
      for (const [kw, key] of Object.entries(KEYWORD_SIGNAL_KEYS)) {
        signalFlags[key] = positives.has(kw) || negatives.has(kw);
      }
      const lawsuit = negatives.has("lawsuit");
      const material = lawsuit && (d?.red_flags || []).includes("lawsuit") && (d?.positive_factors?.length || 0) === 0 === false;

      rows.push({
        user_id: userId,
        run_id: runId,
        ticker: r.ticker,
        company: r.company,
        checked_date_et: checkedDateEt,
        provider: r.modelUsed,
        was_selected: r.status === "selected",
        status_at_check: r.status,
        best_window: r.bestWindow,
        selected_window: r.status === "selected" ? r.bestWindow : null,
        current_price: inp?.price ?? null,
        market_cap: inp?.marketCap ?? null,
        analyst_signal: inp?.analystLabel ?? null,

        one_session_return_pct: inp?.oneDayPct ?? null,
        seven_session_return_pct: inp?.sevenDayPct ?? null,
        twenty_session_return_pct: inp?.twentyDayPct ?? null,
        volume_strength: inp?.volumeRatio ?? null,
        volume_confirmation: null,
        momentum_status: null,
        lower_watch_area: inp?.lowerWatch ?? null,
        upper_watch_area: inp?.upperWatch ?? null,
        upside_vs_risk: inp?.riskRewardRaw ?? null,
        entry_status: inp?.entryStatus ?? null,
        technical_score: r.technicalScore,
        risk_reward: inp?.riskRewardRaw ?? null,
        volatility_score: null,
        distance_from_support_pct: null,
        distance_to_resistance_pct: null,
        overbought_flag: typeof inp?.oneDayPct === "number" ? inp.oneDayPct > 15 : null,
        weak_volume_flag: typeof inp?.volumeRatio === "number" ? inp.volumeRatio < 0.7 : null,
        high_volatility_flag: typeof inp?.oneDayPct === "number" ? Math.abs(inp.oneDayPct) > 20 : null,
        near_resistance_flag: null,
        extended_flag: typeof inp?.sevenDayPct === "number" ? inp.sevenDayPct > 40 : null,

        exa_query: null,
        exa_result_count: d?.sources?.length ?? null,
        exa_positive_signal_count: d?.positive_factors?.length ?? null,
        exa_negative_signal_count: d?.key_risks?.length ?? null,
        exa_neutral_signal_count: null,
        exa_source_quality_score: null,
        catalyst_summary: d?.latest_catalyst ?? null,
        key_risks: d?.key_risks ?? null,
        ...signalFlags,
        has_material_lawsuit_signal: (d as any)?.legal_classification === "material_company_lawsuit",
        has_generic_lawsuit_noise: (d as any)?.legal_classification === "generic_law_firm_noise",
        has_high_valuation_signal: null,

        finnhub_available: (r as any).finnhub?.available ?? null,
        sector: (r as any).finnhub?.sector ?? null,
        industry: (r as any).finnhub?.industry ?? null,
        peer_count: (r as any).finnhub?.peerCount ?? null,
        peer_confirmation_score: (r as any).finnhub?.peerScore ?? null,
        analyst_buy_count: (r as any).finnhub?.buyCount ?? null,
        analyst_hold_count: (r as any).finnhub?.holdCount ?? null,
        analyst_sell_count: (r as any).finnhub?.sellCount ?? null,
        analyst_score: (r as any).finnhub?.analystScore ?? null,
        target_mean: (r as any).finnhub?.targetMean ?? null,
        target_upside_pct: (r as any).finnhub?.targetUpsidePct ?? null,
        target_supports_trade: (r as any).finnhub?.targetSupportsTrade ?? null,

        rule_based_final_score: r.finalScore,
        confidence: d?.confidence ?? null,
        rejection_reason: r.rejectionReason ?? null,
        learning_bonus: null,
        learning_penalty: null,
        final_swing_score: r.finalScore,
      });
    }
    if (rows.length === 0) return 0;
    const { data: inserted, error } = await admin
      .from("swing_training_examples")
      .insert(rows)
      .select("id, ticker, checked_at, current_price, upper_watch_area, lower_watch_area");
    if (error) {
      console.log(`[ml-training] insert_failed reason=${error.message}`);
      return 0;
    }
    const insertedCount = inserted?.length ?? 0;
    console.log(`[ml-training] examples_inserted count=${insertedCount} run_id=${runId ?? "null"}`);

    // Immediately create one pending outcome row per new training example
    // so the ML pipeline is easy to verify. Best-effort.
    if (inserted && inserted.length > 0) {
      const pendingRows = inserted.map((ex: any) => ({
        training_example_id: ex.id,
        ticker: ex.ticker,
        checked_at: ex.checked_at,
        sessions_elapsed: 0,
        price_at_check: ex.current_price ?? null,
        current_price: ex.current_price ?? null,
        target_hit: false,
        stop_hit: false,
        label_3_session: "pending",
        label_10_session: "pending",
        label_20_session: "pending",
        label_40_session: "pending",
        final_label: "pending",
      }));
      const { error: outErr } = await admin
        .from("swing_training_outcomes")
        .upsert(pendingRows, { onConflict: "training_example_id" });
      if (outErr) {
        console.log(`[ml-training] pending_outcomes_failed reason=${outErr.message}`);
      } else {
        console.log(`[ml-training] pending_outcomes_created count=${pendingRows.length}`);
      }
    }
    return insertedCount;
  } catch (e) {
    console.log(`[ml-training] insert_threw reason=${(e as Error).message}`);
    return 0;
  }
}

function labelFor(returnPct: number | null, targetHit: boolean, stopHit: boolean, maxGain: number, maxDD: number, sessionsElapsed: number, requiredSessions: number): string {
  if (sessionsElapsed < requiredSessions) return "pending";
  if (targetHit && !stopHit) return "positive";
  if (stopHit && !targetHit) return "negative";
  if (typeof returnPct === "number") {
    if (returnPct > 2 || maxGain >= 3) return "positive";
    if (returnPct < -2 || maxDD <= -3) return "negative";
    return "flat";
  }
  return "pending";
}

export async function updateOutcomes(admin: SupabaseClient): Promise<{ updated: number; failed: number }> {
  console.log("[ml-training] outcome_update_started");
  let updated = 0;
  let failed = 0;
  try {
    const fortyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: examples } = await admin
      .from("swing_training_examples")
      .select("id, ticker, checked_at, current_price, upper_watch_area, lower_watch_area")
      .gte("checked_at", fortyDaysAgo)
      .limit(500);
    if (!examples || examples.length === 0) {
      console.log("[ml-training] outcome_update_done examples=0");
      return { updated: 0, failed: 0 };
    }

    // Group unique tickers to avoid duplicate Yahoo fetches.
    const tickers = Array.from(new Set(examples.map((e: any) => e.ticker)));
    const chartByTicker = new Map<string, any>();
    for (const t of tickers) {
      const res = await fetchYahooChartWithRetry(t, 1);
      if (res.ok) chartByTicker.set(t, res.chart);
    }

    for (const ex of examples as any[]) {
      try {
        const chart = chartByTicker.get(ex.ticker);
        if (!chart) { failed++; continue; }
        const checkedTs = new Date(ex.checked_at).getTime() / 1000;
        const sinceIdx = chart.timestamps.findIndex((ts: number) => ts >= checkedTs);
        if (sinceIdx < 0) { failed++; continue; }
        const priceAtCheck = ex.current_price ?? chart.closes[sinceIdx] ?? null;
        const currentPrice = chart.closes[chart.closes.length - 1];
        const slice = {
          highs: chart.highs.slice(sinceIdx),
          lows: chart.lows.slice(sinceIdx),
          closes: chart.closes.slice(sinceIdx),
        };
        const sessionsElapsed = slice.closes.length - 1;
        const maxHigh = Math.max(...slice.highs);
        const minLow = Math.min(...slice.lows);
        const returnPct = priceAtCheck ? ((currentPrice - priceAtCheck) / priceAtCheck) * 100 : null;
        const maxGain = priceAtCheck ? ((maxHigh - priceAtCheck) / priceAtCheck) * 100 : 0;
        const maxDD = priceAtCheck ? ((minLow - priceAtCheck) / priceAtCheck) * 100 : 0;
        const target = ex.upper_watch_area;
        const stop = ex.lower_watch_area;
        const targetHit = typeof target === "number" && target > 0 ? maxHigh >= target : false;
        const stopHit = typeof stop === "number" && stop > 0 ? minLow <= stop : false;

        const label3 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 3);
        const label10 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 10);
        const label20 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 20);
        const label40 = labelFor(returnPct, targetHit, stopHit, maxGain, maxDD, sessionsElapsed, 40);
        const finalLabel = label40 !== "pending" ? label40
          : label20 !== "pending" ? label20
          : label10 !== "pending" ? label10
          : label3;

        await admin.from("swing_training_outcomes").upsert({
          training_example_id: ex.id,
          ticker: ex.ticker,
          checked_at: ex.checked_at,
          outcome_checked_at: new Date().toISOString(),
          sessions_elapsed: sessionsElapsed,
          price_at_check: priceAtCheck,
          current_price: currentPrice,
          max_high_since_check: maxHigh,
          min_low_since_check: minLow,
          return_pct_current: returnPct,
          max_gain_pct: maxGain,
          max_drawdown_pct: maxDD,
          target_hit: targetHit,
          stop_hit: stopHit,
          outcome_3_session: label3 !== "pending" ? returnPct : null,
          outcome_10_session: sessionsElapsed >= 10 ? returnPct : null,
          outcome_20_session: sessionsElapsed >= 20 ? returnPct : null,
          outcome_40_session: sessionsElapsed >= 40 ? returnPct : null,
          label_3_session: label3,
          label_10_session: label10,
          label_20_session: label20,
          label_40_session: label40,
          final_label: finalLabel,
        }, { onConflict: "training_example_id" });
        console.log(`[ml-training] outcome_updated ticker=${ex.ticker} sessions=${sessionsElapsed} label=${finalLabel}`);
        updated++;
      } catch (e) {
        failed++;
        console.log(`[ml-training] outcome_update_failed reason=${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.log(`[ml-training] outcome_update_failed reason=${(e as Error).message}`);
  }
  console.log(`[ml-training] outcome_update_done updated=${updated} failed=${failed}`);
  return { updated, failed };
}

export async function getMLTrainingStats(admin: SupabaseClient): Promise<MLTrainingStats> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [savedToday, totalRows, completed, pending] = await Promise.all([
      admin.from("swing_training_examples").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
      admin.from("swing_training_examples").select("id", { count: "exact", head: true }),
      admin.from("swing_training_outcomes").select("id", { count: "exact", head: true }).neq("final_label", "pending"),
      admin.from("swing_training_outcomes").select("id", { count: "exact", head: true }).eq("final_label", "pending"),
    ]);
    return {
      savedToday: savedToday.count || 0,
      totalRows: totalRows.count || 0,
      completed: completed.count || 0,
      pending: pending.count || 0,
    };
  } catch {
    return { savedToday: 0, totalRows: 0, completed: 0, pending: 0 };
  }
}

export function buildMLTrainingSectionHTML(stats: MLTrainingStats): string {
  const warning = stats.completed < 1000
    ? ` Model training will become useful after about 1,000+ completed examples.`
    : "";
  return `
    <h3 style="margin:20px 0 6px 0;color:#0f172a;font-size:14px;">🧠 ML Training Data</h3>
    <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
      ${stats.savedToday} examples saved today · ${stats.pending} pending outcomes · ${stats.completed} completed outcomes · ${stats.totalRows} total rows.${warning}
      <br><em style="color:#94a3b8;">This is not financial advice. Model output will be an AI probability estimate, not a guaranteed prediction.</em>
    </p>`;
}
