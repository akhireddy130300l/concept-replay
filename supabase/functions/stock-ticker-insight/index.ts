// Stock ticker insight — on-demand, grounded latest-news lookup.
// Direct Gemini via GEMINI_API_KEY with Google Search grounding tool.
// Cached 30 minutes per ticker. Only authorized users (portfolio_feature_access).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const CACHE_TTL_MIN = 30;

function extractJson(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i !== -1 && j !== -1 && j > i) return t.slice(i, j + 1);
  return t;
}

function buildPrompt(ticker: string): string {
  return [
    `You are a financial research assistant. Use Google Search to fetch CURRENT public information about US stock ticker "${ticker}".`,
    "Return ONLY valid JSON (no markdown, no commentary) matching this exact shape:",
    `{
      "ticker": "${ticker}",
      "company_name": string,
      "generated_at": ISO timestamp string (use right-now),
      "summary": string,
      "market_status": {
        "recent_movement": string,
        "technical_context": string
      },
      "key_catalysts": [
        { "title": string, "details": string, "source_name": string, "source_url": string }
      ],
      "financial_health": {
        "summary": string,
        "notable_metrics": string[]
      },
      "analyst_consensus": {
        "summary": string,
        "notable_points": string[]
      },
      "risk_flags": string[],
      "sources": [ { "name": string, "url": string } ],
      "disclaimer": "This is informational only and not investment advice."
    }`,
    "Rules:",
    "- Every claim about recent news, numbers, or analyst views MUST be grounded in a real search result with a real URL.",
    "- If no fresh news (past 14 days) is found, set key_catalysts to [] and put a clear note in summary like 'No fresh catalysts found in the last 14 days.'",
    "- Never invent revenue, EPS, price targets, contracts, or M&A. If unknown, omit or say 'not available'.",
    "- Keep each text field under 600 characters.",
    "- sources must list the actual URLs used.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Stock insight is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to identify the caller (optional for cached reads).
    let userId: string | null = null;
    let authorized = false;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        userId = userData.user.id;
        const { data: access } = await admin
          .from("portfolio_feature_access")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        authorized = !!access;
      }
    }

    const body = (await req.json().catch(() => null)) as { ticker?: string; refresh?: boolean } | null;
    const rawTicker = String(body?.ticker || "").toUpperCase().trim();
    if (!TICKER_RE.test(rawTicker)) {
      return new Response(JSON.stringify({ error: "Invalid ticker symbol." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const refresh = body?.refresh === true;

    // Cache lookup — anyone (even anonymous) can read a cached insight.
    // Refresh always bypasses cache and requires authorization.
    if (!refresh) {
      const { data: cached } = await admin
        .from("stock_ticker_insight_cache")
        .select("payload, grounded, generated_at, expires_at")
        .eq("ticker", rawTicker)
        .maybeSingle();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, user_id: userId, cache_hit: true, elapsed_ms: Date.now() - t0 }));
        return new Response(JSON.stringify({
          insight: cached.payload,
          grounded: cached.grounded,
          cached: true,
          generated_at: cached.generated_at,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Beyond this point, we must call Gemini — that requires an authorized user.
    if (!userId) {
      return new Response(JSON.stringify({ error: "Sign in to generate the latest stock insight." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!authorized) {
      return new Response(JSON.stringify({
        error: refresh
          ? "Refreshing latest news is available only to authorized users."
          : "Stock insight is not enabled for this account.",
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Direct Gemini call with Google Search grounding.
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(rawTicker) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.4 },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const safeStatus = res.status;
      let errBody = "";
      try { errBody = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, user_id: userId, failure_category: "gemini_http", http_status: safeStatus, body_preview: errBody }));
      return new Response(JSON.stringify({ error: "Insight could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json: any = await res.json().catch(() => null);
    const cand = json?.candidates?.[0];
    const parts = cand?.content?.parts;
    const text: string = Array.isArray(parts)
      ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
      : "";
    const groundingMeta = cand?.groundingMetadata;
    const grounded = !!groundingMeta && (
      (Array.isArray(groundingMeta.groundingChunks) && groundingMeta.groundingChunks.length > 0) ||
      (Array.isArray(groundingMeta.webSearchQueries) && groundingMeta.webSearchQueries.length > 0)
    );

    if (!text) {
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, user_id: userId, failure_category: "gemini_empty" }));
      return new Response(JSON.stringify({ error: "Insight could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insight: any;
    try { insight = JSON.parse(extractJson(text)); } catch {
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, user_id: userId, failure_category: "invalid_json" }));
      return new Response(JSON.stringify({ error: "Insight could not be generated right now. Please try again later." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge grounding chunk URLs into sources so users always see real citations.
    if (grounded && Array.isArray(groundingMeta.groundingChunks)) {
      const chunkSources = groundingMeta.groundingChunks
        .map((c: any) => c?.web ? { name: String(c.web.title || c.web.uri || "source"), url: String(c.web.uri || "") } : null)
        .filter((x: any) => x && x.url);
      if (!Array.isArray(insight.sources)) insight.sources = [];
      const seen = new Set(insight.sources.map((s: any) => s?.url).filter(Boolean));
      for (const s of chunkSources) {
        if (!seen.has(s.url)) { insight.sources.push(s); seen.add(s.url); }
      }
    }
    if (!insight.disclaimer) insight.disclaimer = "This is informational only and not investment advice.";
    if (!insight.ticker) insight.ticker = rawTicker;

    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + CACHE_TTL_MIN * 60_000);

    // Upsert cache.
    await admin
      .from("stock_ticker_insight_cache")
      .upsert({
        ticker: rawTicker,
        payload: insight,
        grounded,
        generated_at: generatedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: userId,
      }, { onConflict: "ticker" });

    console.log(JSON.stringify({
      phase: "stock_insight", ticker: rawTicker, user_id: userId,
      cache_hit: false, grounded, elapsed_ms: Date.now() - t0,
    }));

    return new Response(JSON.stringify({
      insight, grounded, cached: false, generated_at: generatedAt.toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.log(JSON.stringify({ phase: "stock_insight", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
