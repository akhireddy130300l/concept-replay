// Lovable AI Gateway wrapper for Gemini structured-JSON calls.
// Uses the verified model: google/gemini-2.5-flash.

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

export const GEMINI_MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const InterpretationSchema = z.object({
  status: z.enum([
    "Monitor",
    "Position-size review",
    "Concentration review",
    "Sector-risk review",
    "Thesis review required",
    "Immediate manual review",
    "Insufficient data",
  ]),
  confidence: z.enum(["Low", "Medium", "High"]),
  assessment_type: z.enum([
    "stock-specific",
    "broad-peer-weakness",
    "mixed",
    "peer-unavailable",
    "insufficient",
  ]),
  interpretation: z.string().min(1).max(800),
});

export type Interpretation = z.infer<typeof InterpretationSchema>;

export async function generateInterpretation(
  evidenceJson: unknown,
  lovableApiKey: string,
  timeoutMs = 20000,
): Promise<{ ok: true; data: Interpretation } | { ok: false; reason: string; status: number | null }> {
  const system = [
    "You are a research analyst assistant. You are given precomputed deterministic numeric evidence as JSON.",
    "Return STRICT JSON only matching the provided schema fields: status, confidence, assessment_type, interpretation.",
    "HARD RULES:",
    "- Do NOT invent numbers, prices, peer tickers, or analyst data.",
    "- Do NOT recommend Buy or Sell. Do NOT issue trading instructions.",
    "- The peer set is a limited dynamic list of company peers, NOT a full market sector. Never call it 'sector-wide'.",
    "- When evidence.concentrationBasis === 'submitted_only', the per-holding weight is a share of submitted holdings ONLY and does NOT prove full-account concentration. Do NOT assign status='Concentration review' based solely on submitted-only weight.",
    "- Only treat concentration as account-level when evidence.accountConcentrationAvailable === true.",
    "- Do NOT describe RSI > 30 as 'oversold'. Use the provided rsiCategory verbatim.",
    "- Do NOT claim recommendation counts are 'unique analysts'. Refer to 'recommendation ratings'.",
    "- The deterministic assessment_type is supplied in evidence.deterministicAssessmentType. You MUST return exactly that value for assessment_type.",
    "- If evidence is incomplete or contradictory, return status='Insufficient data' and confidence='Low'.",
    "- This is decision support, not a trading instruction.",
    "Keep interpretation under 600 characters, plain English, factual.",
  ].join(" ");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(evidenceJson) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(t);
    const status = res.status;
    let bodyJson: any = null;
    try { bodyJson = await res.json(); } catch { /* ignore */ }
    if (status !== 200) {
      return { ok: false, reason: status === 429 ? "rate_limited" : status === 402 ? "credits_exhausted" : `status_${status}`, status };
    }
    const content = bodyJson?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, reason: "no_content", status };
    let parsed: unknown = null;
    try { parsed = JSON.parse(content); } catch { return { ok: false, reason: "invalid_json", status }; }
    const v = InterpretationSchema.safeParse(parsed);
    if (!v.success) return { ok: false, reason: "schema_validation_failed", status };
    return { ok: true, data: v.data };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : "unknown_error", status: null };
  }
}

export function fallbackInterpretation(): Interpretation {
  return {
    status: "Insufficient data",
    confidence: "Low",
    assessment_type: "insufficient",
    interpretation:
      "AI interpretation was unavailable. The factual numerical report below is generated deterministically from market data and is decision support only.",
  };
}
