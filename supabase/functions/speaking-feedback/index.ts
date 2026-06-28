// Influence Speaking Gym — AI feedback endpoint.
// JWT-required. Calls Lovable AI Gateway (Gemini) for structured speaking feedback.
// Never logs full transcripts. Returns feedback JSON only — caller stores it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { ALL_MODES, type SpeakingMode } from "../_shared/speaking-content.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

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
      "corrected": string,        // small grammar/clarity fixes, preserves voice
      "natural": string,          // how a fluent native professional would phrase it
      "powerful": string,         // confident, persuasive, leader-like rewrite
      "role_style": string,       // rewritten in the selected mode's style
      "did_well": string[],       // 2-4 short bullets
      "weak_phrases": string[],   // 2-5 specific phrases from the transcript that weaken it
      "stronger_phrases": string[], // 2-5 direct replacements aligned by index with weak_phrases when possible
      "filler_issues": string,    // 1-2 sentences on filler words / hesitation patterns observed
      "scores": {
        "clarity": number,             // 0-10
        "confidence": number,          // 0-10
        "persuasion": number,          // 0-10
        "structure": number,           // 0-10
        "executive_presence": number   // 0-10
      },
      "tomorrows_drill": string   // one small, specific 2-minute drill for tomorrow
    }`,
    "Keep each text field under 600 characters. Be concrete. Quote phrases when useful.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
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

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Coaching is busy right now. Try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      // Do NOT log transcript on failure.
      console.log(JSON.stringify({ phase: "speaking_feedback", failure_category: "ai_gateway_error", http_status: res.status }));
      return new Response(JSON.stringify({ error: "Coaching is unavailable. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty coaching response." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let feedback: unknown;
    try {
      const stripped = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
      feedback = JSON.parse(stripped);
    } catch {
      return new Response(JSON.stringify({ error: "Coaching returned invalid JSON." }), {
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
