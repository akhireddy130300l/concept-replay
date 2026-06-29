// Influence Speaking Gym — AI feedback endpoint.
// JWT-required. Calls Google Gemini API DIRECTLY using a server-side GEMINI_API_KEY secret.
// Lovable AI Gateway is intentionally NOT used by this function.
// Never logs full transcripts, raw Gemini responses, or the API key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { ALL_MODES, type SpeakingMode } from "../_shared/speaking-content.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Body = {
  mode: SpeakingMode;
  scenarioTitle: string;
  scenarioPrompt: string;
  transcript: string;
};

function isMode(s: unknown): s is SpeakingMode {
  return typeof s === "string" && (ALL_MODES as string[]).includes(s);
}

function buildSystemPrompt(): string {
  return [
    "You are an elite communication coach for professionals: sales leaders, tech leads, marketers, public speakers, and executives.",
    "This is NOT beginner English. The speaker is already fluent. Your job is to sharpen confidence, clarity, persuasion, structure, and executive presence.",
    "Be direct, useful, and motivating. Never harsh. Never preachy. No moralizing.",
    "Return STRICT JSON ONLY matching this shape (no markdown, no code fences):",
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
        "clarity": number,
        "confidence": number,
        "persuasion": number,
        "structure": number,
        "executive_presence": number
      },
      "tomorrows_drill": string
    }`,
    "Keep each text field under 600 characters. Be concrete. Quote phrases when useful.",
  ].join("\n");
}

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) return fence[1].trim();
  // Fallback: find first { ... last }
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
        typeof body.scenarioTitle !== "string" || typeof body.scenarioPrompt !== "string") {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = body.transcript.trim();
    if (transcript.length < 20) {
      return new Response(JSON.stringify({ error: "Transcript is too short. Speak or type at least a few sentences." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (transcript.length > 6000) {
      return new Response(JSON.stringify({ error: "Transcript is too long. Keep it under 6000 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPayload = {
      mode: body.mode,
      scenario_title: body.scenarioTitle,
      scenario_prompt: body.scenarioPrompt,
      transcript,
    };

    const systemPrompt = buildSystemPrompt();

    // Google Gemini direct API call (generateContent)
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
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

    let feedback: unknown;
    try {
      feedback = JSON.parse(extractJson(content));
    } catch {
      console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "invalid_json" }));
      return new Response(JSON.stringify({ error: "Feedback could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
