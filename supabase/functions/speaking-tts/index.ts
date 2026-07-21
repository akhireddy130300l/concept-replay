// Speaking Gym — TTS proxy. Auth-required. Uses Lovable AI Gateway (LOVABLE_API_KEY).
// POST { text, voice? } -> audio/mpeg bytes (mp3).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "fable",
  "onyx", "nova", "sage", "shimmer", "verse",
]);

type Body = { text?: string; voice?: string; instructions?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "TTS is not configured." }), {
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
    const text = (body?.text ?? "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 2000) {
      return new Response(JSON.stringify({ error: "Text too long (max 2000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const voice = body?.voice && ALLOWED_VOICES.has(body.voice) ? body.voice : "alloy";
    const instructions = typeof body?.instructions === "string"
      ? body.instructions.slice(0, 400)
      : "Speak like a confident, warm executive coach. Clear articulation, natural pauses, deliberate emphasis on the key words.";

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice,
        instructions,
        response_format: "mp3",
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.log(JSON.stringify({ phase: "speaking_tts", failure_category: "upstream_error", http_status: upstream.status, detail: detail.slice(0, 300) }));
      const status = upstream.status === 429 ? 429 : upstream.status === 402 ? 402 : 502;
      return new Response(JSON.stringify({ error: status === 429 ? "TTS rate limit reached. Try again shortly." : status === 402 ? "TTS credits exhausted." : "TTS generation failed." }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audio = await upstream.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.log(JSON.stringify({ phase: "speaking_tts", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
