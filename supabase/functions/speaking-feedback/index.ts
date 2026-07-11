// Influence Speaking Gym — AI feedback endpoint.
// JWT-required. Direct Gemini via GEMINI_API_KEY. No Lovable AI Gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { ALL_MODES, type SpeakingMode } from "../_shared/speaking-content.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Body = {
  mode: SpeakingMode;
  scenarioTitle: string;
  scenarioContext: string; // full deep context for the model
  improvementTarget: string;
  rounds: { opening: string; pressure: string; close: string };
  transcript: string;
};

function isMode(s: unknown): s is SpeakingMode {
  return typeof s === "string" && (ALL_MODES as string[]).includes(s);
}

function isGibberish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 50) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length < 12) return true;
  const unique = new Set(tokens);
  const diversity = unique.size / tokens.length;
  if (diversity < 0.35) return true;
  // Single token dominance
  const counts = new Map<string, number>();
  for (const tk of tokens) counts.set(tk, (counts.get(tk) ?? 0) + 1);
  for (const [, c] of counts) if (c / tokens.length > 0.25) return true;
  return false;
}

function buildSystemPrompt(): string {
  return [
    "You are an elite communication coach for professionals: sales leaders, tech leads, marketers, public speakers, executives, and confident social speakers.",
    "This is NOT beginner English. The speaker is already fluent. Sharpen confidence, clarity, persuasion, structure, humor timing (when the mode calls for it), and executive presence.",
    "You will receive a deep scenario, the speaker's improvement target for today, and a transcript split into 3 rounds (opening, pressure, close).",
    "",
    "SCORING DISCIPLINE (strict):",
    " - Scores are 0–10. Do NOT default to 7+. Reserve 8+ for genuinely strong reps.",
    " - If the transcript is short, generic, filler-heavy, or fails the scenario's success criteria, most scores must be under 6.",
    " - If any single score is 5 or below, improvement_target_met must be 'missed' or 'partial' — never 'met'.",
    " - If average of the 5 scores is under 5.0, improvement_target_met must be 'missed'.",
    "",
    "IMPROVEMENT TARGET: judge it strictly. A high overall score does NOT automatically mean the target was met. Explain in target_evaluated exactly what was measured.",
    "",
    "role_style MUST be a full REWRITE of the speaker's own words in the target mode's voice — not advice, not description, not a bullet list. It should read like a native line the speaker could say tomorrow.",
    "",
    "hard_truth MUST be the single most direct criticism a great coach would give — blunt, specific, under 200 characters. No sugar-coating, no 'consider' / 'you might want to'. Example: 'You sound rehearsed and unsure. Nobody buys a pitch that opens with a disclaimer.'",
    "what_to_fix MUST be 1–3 concrete, imperative fixes for the NEXT rep. Each item under 140 characters, starting with a verb: 'Cut the first 8 words.', 'Name the outcome in the first sentence.', 'Drop 'basically'.'",
    "",
    "Return STRICT JSON ONLY (no markdown, no code fences) matching this exact shape:",
    `{
      "corrected": string,
      "natural": string,
      "powerful": string,
      "role_style": string,
      "did_well": string[],
      "weak_phrases": string[],
      "stronger_phrases": string[],
      "filler_issues": string,
      "scores": {
        "clarity": number, "confidence": number, "persuasion": number,
        "structure": number, "executive_presence": number
      },
      "main_weakness": string,
      "hard_truth": string,
      "what_to_fix": string[],
      "improvement_target_met": "met" | "partial" | "missed",
      "target_evaluated": string,
      "meaningful_attempt": boolean,
      "tomorrows_drill": string
    }`,
    "Keep each text field under 600 characters. Quote phrases when useful.",
    "meaningful_attempt = false ONLY if the transcript is gibberish, off-topic, or clearly not a real rep.",
    "tomorrows_drill must be a concrete, single-sentence improvement target for the NEXT session, derived from today's main_weakness.",
  ].join("\n");
}


function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) return fence[1].trim();
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) return t.slice(i, j + 1);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Gemini API key is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !isMode(body.mode) || typeof body.transcript !== "string" ||
        typeof body.scenarioTitle !== "string" || typeof body.scenarioContext !== "string" ||
        typeof body.improvementTarget !== "string" || !body.rounds ||
        typeof body.rounds.opening !== "string" ||
        typeof body.rounds.pressure !== "string" ||
        typeof body.rounds.close !== "string") {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = body.transcript.trim();
    if (transcript.length > 8000) {
      return new Response(JSON.stringify({ error: "Transcript is too long. Keep it under 8000 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Each round must have substance
    const r = body.rounds;
    if (r.opening.trim().length < 40 || r.pressure.trim().length < 40 || r.close.trim().length < 40) {
      return new Response(JSON.stringify({
        error: "This does not look like a complete speaking rep. Try again with clearer, fuller responses.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (isGibberish(transcript)) {
      return new Response(JSON.stringify({
        error: "This does not look like a complete speaking rep. Try again with clearer, fuller responses.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userPayload = {
      mode: body.mode,
      scenario_title: body.scenarioTitle,
      scenario_context: body.scenarioContext,
      improvement_target: body.improvementTarget,
      rounds: r,
      transcript,
    };

    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Gemini rate limit reached. Please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "gemini_error", http_status: res.status }));
      return new Response(JSON.stringify({ error: "Feedback could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let json: any;
    try { json = await res.json(); } catch {
      return new Response(JSON.stringify({ error: "Feedback could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts = json?.candidates?.[0]?.content?.parts;
    const content: string | undefined = Array.isArray(parts)
      ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
      : undefined;

    if (!content) {
      console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "gemini_empty" }));
      return new Response(JSON.stringify({ error: "Feedback could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let feedback: any;
    try { feedback = JSON.parse(extractJson(content)); } catch {
      console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "invalid_json" }));
      return new Response(JSON.stringify({ error: "Feedback could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize target verdict.
    const m = String(feedback.improvement_target_met ?? "").toLowerCase();
    if (m !== "met" && m !== "partial" && m !== "missed") {
      feedback.improvement_target_met = "partial";
    } else {
      feedback.improvement_target_met = m;
    }
    if (typeof feedback.meaningful_attempt !== "boolean") feedback.meaningful_attempt = true;
    if (typeof feedback.main_weakness !== "string") feedback.main_weakness = "";
    if (typeof feedback.target_evaluated !== "string") feedback.target_evaluated = body.improvementTarget;
    if (typeof feedback.hard_truth !== "string") feedback.hard_truth = "";
    if (!Array.isArray(feedback.what_to_fix)) feedback.what_to_fix = [];

    // Deterministic score-based downgrade: overrides any inflated LLM verdict.
    const s = feedback.scores || {};
    const values = [s.clarity, s.confidence, s.persuasion, s.structure, s.executive_presence]
      .map((n: any) => (typeof n === "number" ? n : 0));
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const minScore = Math.min(...values);
    if (avg < 5.0 || minScore <= 3) {
      feedback.improvement_target_met = "missed";
    } else if (minScore <= 5 && feedback.improvement_target_met === "met") {
      feedback.improvement_target_met = "partial";
    }
    console.log(JSON.stringify({
      phase: "speaking_feedback", event: "score_gate",
      avg: Number(avg.toFixed(2)), min: minScore, verdict: feedback.improvement_target_met,
    }));


    return new Response(JSON.stringify({ feedback }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
