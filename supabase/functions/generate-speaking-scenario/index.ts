// Influence Speaking Gym — generate a fresh scenario via direct Google Gemini.
// JWT-required. Uses GEMINI_API_KEY. Does NOT use Lovable AI Gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { ALL_MODES, type SpeakingMode } from "../_shared/speaking-content.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Body = { mode: SpeakingMode; recentTitles?: string[]; recentIds?: string[] };

function isMode(s: unknown): s is SpeakingMode {
  return typeof s === "string" && (ALL_MODES as string[]).includes(s as SpeakingMode);
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

function systemPrompt(mode: SpeakingMode, recentTitles: string[]): string {
  return [
    `You are a scenario designer for the Influence Speaking Gym. Create ONE realistic, high-pressure speaking scenario for the mode: "${mode}".`,
    "The speaker is a fluent professional; scenarios should feel real and specific, not generic training exercises.",
    "Avoid the following recently-used titles (do not repeat or paraphrase them):",
    recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "- (none)",
    "",
    "Return STRICT JSON ONLY (no markdown, no code fences) matching this exact shape:",
    `{
      "id": string,
      "title": string,
      "mode": "${mode}",
      "scene": string,
      "your_role": string,
      "audience": string,
      "audience_mindset": string,
      "what_just_happened": string,
      "pressure": string,
      "objection_or_question": string,
      "your_goal": string,
      "speaking_structure": string,
      "your_task": string,
      "success_criteria": string,
      "round_1_prompt": string,
      "round_2_pressure_prompt": string,
      "round_3_close_prompt": string,
      "strong_example_round_1": string,
      "strong_example_round_2": string,
      "strong_example_round_3": string
    }`,
    "id must be a short kebab-case slug unique-looking (e.g. gen-<8-random-lowercase-alphanumeric>).",
    "Each string field under 500 characters. Strong examples must sound like a real person, not advice.",
  ].join("\n");
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
    if (!body || !isMode(body.mode)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recentTitles = Array.isArray(body.recentTitles) ? body.recentTitles.slice(0, 20) : [];
    const recentIds = Array.isArray(body.recentIds) ? body.recentIds.slice(0, 20) : [];

    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemPrompt(body.mode, recentTitles) }] },
        contents: [{ role: "user", parts: [{ text: `Generate a new "${body.mode}" scenario now. Avoid ids: ${recentIds.join(", ") || "(none)"}.` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.95 },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Gemini rate limit reached. Please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      console.log(JSON.stringify({ phase: "speaking_scenario", failure_category: "gemini_error", http_status: res.status }));
      return new Response(JSON.stringify({ error: "Scenario generation failed. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await res.json().catch(() => null);
    const parts = json?.candidates?.[0]?.content?.parts;
    const content: string | undefined = Array.isArray(parts)
      ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
      : undefined;
    if (!content) {
      return new Response(JSON.stringify({ error: "Scenario generation failed. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let scenario: any;
    try { scenario = JSON.parse(extractJson(content)); } catch {
      return new Response(JSON.stringify({ error: "Scenario generation returned invalid data. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Backfill legacy aliases so callers don't break.
    scenario.round2_pressure_prompt = scenario.round2_pressure_prompt ?? scenario.round_2_pressure_prompt;
    scenario.round3_close_prompt = scenario.round3_close_prompt ?? scenario.round_3_close_prompt;
    scenario.mode = body.mode;
    if (!scenario.id || typeof scenario.id !== "string") {
      scenario.id = `gen-${crypto.randomUUID().slice(0, 8)}`;
    }

    console.log(JSON.stringify({ phase: "speaking-scenario", mode: body.mode, source: "gemini", scenario_id: scenario.id, recent_avoided: recentIds.length }));

    return new Response(JSON.stringify({ scenario }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log(JSON.stringify({ phase: "speaking_scenario", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
