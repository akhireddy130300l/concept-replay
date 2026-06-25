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

export type GenerateInterpretationResult =
  | { ok: true; data: Interpretation; attempts: number; elapsedMs: number; httpStatus: number }
  | {
      ok: false;
      reason: string;            // safe failure category (e.g. ai_gateway_timeout)
      attempts: number;
      elapsedMs: number;
      httpStatus: number | null;
      zodIssuePaths?: string[];
    };

// Normalize known safe label variants from any "loose" model output BEFORE Zod parsing.
function normalizeAssessmentType(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  const map: Record<string, string> = {
    "broad peer-group weakness": "broad-peer-weakness",
    "broad peer group weakness": "broad-peer-weakness",
    "peer-group weakness": "broad-peer-weakness",
    "stock-specific": "stock-specific",
    "stock specific": "stock-specific",
    "peer analysis unavailable": "peer-unavailable",
    "peer unavailable": "peer-unavailable",
    "mixed": "mixed",
    "insufficient data": "insufficient",
    "insufficient": "insufficient",
  };
  return map[s.toLowerCase()] ?? s;
}

// Extract a JSON object from a model response that may include a single ```json ... ``` fence.
function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  // Fenced ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) return fence[1].trim();
  return trimmed;
}

function safeParseInterpretation(content: string):
  | { ok: true; data: Interpretation }
  | { ok: false; reason: "ai_invalid_json" | "ai_schema_validation_failed"; zodIssuePaths?: string[] } {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonCandidate(content));
  } catch {
    return { ok: false, reason: "ai_invalid_json" };
  }
  if (parsed && typeof parsed === "object" && "assessment_type" in parsed) {
    parsed.assessment_type = normalizeAssessmentType(parsed.assessment_type);
  }
  const v = InterpretationSchema.safeParse(parsed);
  if (!v.success) {
    return {
      ok: false,
      reason: "ai_schema_validation_failed",
      zodIssuePaths: v.error.issues.slice(0, 5).map((i) => i.path.join(".")),
    };
  }
  return { ok: true, data: v.data };
}

async function callOnce(
  evidenceJson: unknown,
  lovableApiKey: string,
  timeoutMs: number,
): Promise<{ httpStatus: number | null; rawContent: string | null; reason?: string }> {
  const system = [
    "You are a research analyst assistant. You are given precomputed deterministic numeric evidence as JSON.",
    "Return STRICT JSON only matching the fields: status, confidence, assessment_type, interpretation.",
    "No prose outside the JSON. No markdown code fences.",
    "HARD RULES:",
    "- Do NOT invent numbers, prices, peer tickers, or analyst data.",
    "- Do NOT recommend Buy or Sell.",
    "- The peer set is a limited dynamic list of company peers, NOT a market sector.",
    "- When evidence.concentrationBasis === 'submitted_only', per-holding weight is a share of submitted holdings only.",
    "- Only treat concentration as account-level when evidence.accountConcentrationAvailable === true.",
    "- Do NOT describe RSI > 30 as 'oversold'. Use evidence.rsiCategory verbatim.",
    "- Refer to 'recommendation ratings', not 'unique analysts'.",
    "- assessment_type MUST equal evidence.deterministicAssessmentType (one of: stock-specific, broad-peer-weakness, mixed, peer-unavailable, insufficient).",
    "- status MUST be one of: Monitor, Position-size review, Concentration review, Sector-risk review, Thesis review required, Immediate manual review, Insufficient data.",
    "- confidence MUST be one of: Low, Medium, High.",
    "- If evidence is incomplete or contradictory, return status='Insufficient data' and confidence='Low'.",
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
      return { httpStatus: status, rawContent: null };
    }
    const content = bodyJson?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { httpStatus: status, rawContent: null, reason: "ai_empty_response" };
    }
    return { httpStatus: status, rawContent: content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (/abort|timeout/i.test(msg)) return { httpStatus: null, rawContent: null, reason: "ai_gateway_timeout" };
    return { httpStatus: null, rawContent: null, reason: `ai_gateway_network` };
  }
}

export async function generateInterpretation(
  evidenceJson: unknown,
  lovableApiKey: string,
  opts: { requestId?: string; timeoutMs?: number } = {},
): Promise<GenerateInterpretationResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const requestId = opts.requestId ?? "unknown";
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptStart = Date.now();
    const r = await callOnce(evidenceJson, lovableApiKey, timeoutMs);
    const elapsed = Date.now() - attemptStart;
    const status = r.httpStatus;

    // Permanent failures: do not retry.
    if (status !== null && status >= 400 && status < 500 && status !== 429) {
      console.log(JSON.stringify({
        phase: "ai_gateway", request_id: requestId, model: GEMINI_MODEL,
        attempt, http_status: status, elapsed_ms: elapsed, failure_category: "ai_gateway_4xx",
      }));
      return {
        ok: false, reason: "ai_gateway_4xx",
        attempts: attempt, elapsedMs: Date.now() - startedAt, httpStatus: status,
      };
    }

    // Retryable: timeout / 429 / 5xx / network. Allow ONE retry (attempt 1).
    const retryable =
      r.reason === "ai_gateway_timeout" ||
      r.reason === "ai_gateway_network" ||
      status === 429 ||
      (status !== null && status >= 500 && status < 600);

    if (r.rawContent === null) {
      let category: string;
      if (status === 429) category = "ai_gateway_429";
      else if (status !== null && status >= 500) category = "ai_gateway_5xx";
      else category = r.reason ?? "ai_gateway_unknown";

      console.log(JSON.stringify({
        phase: "ai_gateway", request_id: requestId, model: GEMINI_MODEL,
        attempt, http_status: status, elapsed_ms: elapsed, failure_category: category,
      }));

      if (retryable && attempt === 1) {
        await new Promise((res) => setTimeout(res, 600));
        continue;
      }
      return {
        ok: false, reason: category,
        attempts: attempt, elapsedMs: Date.now() - startedAt, httpStatus: status,
      };
    }

    // Try to parse + validate.
    const parsed = safeParseInterpretation(r.rawContent);
    if (parsed.ok) {
      console.log(JSON.stringify({
        phase: "ai_gateway", request_id: requestId, model: GEMINI_MODEL,
        attempt, http_status: status ?? 200, elapsed_ms: elapsed, failure_category: null,
        fallback_used: false,
      }));
      return { ok: true, data: parsed.data, attempts: attempt, elapsedMs: Date.now() - startedAt, httpStatus: status ?? 200 };
    }
    // ai_invalid_json or ai_schema_validation_failed -> permanent, do NOT retry.
    console.log(JSON.stringify({
      phase: "ai_gateway", request_id: requestId, model: GEMINI_MODEL,
      attempt, http_status: status ?? 200, elapsed_ms: elapsed,
      failure_category: parsed.reason,
      zod_issue_paths: parsed.zodIssuePaths,
    }));
    return {
      ok: false, reason: parsed.reason,
      attempts: attempt, elapsedMs: Date.now() - startedAt, httpStatus: status,
      zodIssuePaths: parsed.zodIssuePaths,
    };
  }

  return { ok: false, reason: "ai_gateway_unknown", attempts: 2, elapsedMs: Date.now() - startedAt, httpStatus: null };
}

export function fallbackInterpretation(): Interpretation {
  return {
    status: "Insufficient data",
    confidence: "Low",
    assessment_type: "insufficient",
    interpretation:
      "AI interpretation was unavailable. The factual report below was generated from verified market data.",
  };
}
