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
  assessment_type: z.enum(["stock-specific", "sector-wide", "mixed", "insufficient"]),
  interpretation: z.string().min(1).max(800),
});

export type Interpretation = z.infer<typeof InterpretationSchema>;

export async function generateInterpretation(
  evidenceJson: unknown,
  lovableApiKey: string,
  timeoutMs = 20000,
): Promise<{ ok: true; data: Interpretation } | { ok: false; reason: string; status: number | null }> {
  const system = [
    "You are a research analyst assistant. You will be given precomputed numeric evidence as JSON.",
    "Return STRICT JSON only with this schema:",
    `{"status": one of ["Monitor","Position-size review","Concentration review","Sector-risk review","Thesis review required","Immediate manual review","Insufficient data"],`,
    `"confidence": one of ["Low","Medium","High"],`,
    `"assessment_type": one of ["stock-specific","sector-wide","mixed","insufficient"],`,
    `"interpretation": string (concise, plain English, max 600 chars).}`,
    "Rules: Do NOT invent numbers, prices, peers, or analyst data. Do NOT recommend Buy/Sell. Do NOT execute trades.",
    "If evidence is incomplete or contradictory, return status=Insufficient data and confidence=Low.",
    "Only describe what the provided numbers imply. This is decision support, not a trading instruction.",
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
