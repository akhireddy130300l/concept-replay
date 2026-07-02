// Stock ticker insight — public, on-demand, grounded latest-news lookup.
// Direct Gemini via GEMINI_API_KEY with Google Search grounding tool.
// Cached 30 minutes per ticker. Public access: anyone with a ticker link can
// view or generate. Refresh has a 10-minute cooldown per ticker.

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
const REFRESH_COOLDOWN_MIN = 10;

// Per-instance in-flight coalescing: if two callers ask for the same ticker at
// the same time (within one edge-function instance), share the same Gemini call.
const inflight = new Map<string, Promise<Response>>();

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handle(req: Request): Promise<Response> {
  const t0 = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "Stock insight is not configured." }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = (await req.json().catch(() => null)) as { ticker?: string; refresh?: boolean } | null;
  const rawTicker = String(body?.ticker || "").toUpperCase().trim();
  if (!TICKER_RE.test(rawTicker)) {
    return jsonResponse({ error: "Invalid ticker symbol." }, 400);
  }
  const refresh = body?.refresh === true;

  const { data: cached } = await admin
    .from("stock_ticker_insight_cache")
    .select("payload, grounded, generated_at, expires_at")
    .eq("ticker", rawTicker)
    .maybeSingle();

  const now = Date.now();
  const cacheFresh = cached && new Date(cached.expires_at).getTime() > now;
  const generatedMs = cached?.generated_at ? new Date(cached.generated_at).getTime() : 0;
  const withinCooldown = cached && (now - generatedMs) < REFRESH_COOLDOWN_MIN * 60_000;

  // Non-refresh + fresh cache → return cache.
  if (!refresh && cacheFresh) {
    console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, cache_hit: true, refresh: false, elapsed_ms: Date.now() - t0 }));
    return jsonResponse({
      insight: cached.payload,
      grounded: cached.grounded,
      cached: true,
      generated_at: cached.generated_at,
    });
  }

  // Refresh requested but within cooldown → return cache with a note.
  if (refresh && cached && withinCooldown) {
    console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, cache_hit: true, refresh: true, rate_limited: true, elapsed_ms: Date.now() - t0 }));
    return jsonResponse({
      insight: cached.payload,
      grounded: cached.grounded,
      cached: true,
      generated_at: cached.generated_at,
      notice: "Recently refreshed. Showing the latest cached insight.",
    });
  }

  // We need Gemini. Coalesce concurrent identical requests inside this instance.
  const key = `gen:${rawTicker}`;
  const existing = inflight.get(key);
  if (existing) {
    console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, coalesced: true }));
    // Return a clone since Response bodies can only be read once.
    const shared = await existing;
    return shared.clone();
  }

  const p = (async (): Promise<Response> => {
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
      // Fall back to stale cache if we have it.
      if (cached) {
        return jsonResponse({
          insight: cached.payload,
          grounded: cached.grounded,
          cached: true,
          generated_at: cached.generated_at,
          notice: "Recently refreshed. Showing the latest cached insight.",
        });
      }
      return jsonResponse({ error: "Rate limit reached. Please try again in a moment." }, 429);
    }
    if (!res.ok) {
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, failure_category: "gemini_http", http_status: res.status }));
      if (cached) {
        return jsonResponse({
          insight: cached.payload,
          grounded: cached.grounded,
          cached: true,
          generated_at: cached.generated_at,
          notice: "Latest refresh failed. Showing the previously cached insight.",
        });
      }
      return jsonResponse({ error: "Latest stock insight could not be generated right now. Please try again later." }, 502);
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
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, failure_category: "gemini_empty" }));
      if (cached) {
        return jsonResponse({
          insight: cached.payload,
          grounded: cached.grounded,
          cached: true,
          generated_at: cached.generated_at,
          notice: "Latest refresh failed. Showing the previously cached insight.",
        });
      }
      return jsonResponse({ error: "Latest stock insight could not be generated right now. Please try again later." }, 502);
    }

    let insight: any;
    try { insight = JSON.parse(extractJson(text)); } catch {
      console.log(JSON.stringify({ phase: "stock_insight", ticker: rawTicker, failure_category: "invalid_json" }));
      if (cached) {
        return jsonResponse({
          insight: cached.payload,
          grounded: cached.grounded,
          cached: true,
          generated_at: cached.generated_at,
          notice: "Latest refresh failed. Showing the previously cached insight.",
        });
      }
      return jsonResponse({ error: "Latest stock insight could not be generated right now. Please try again later." }, 502);
    }

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

    await admin
      .from("stock_ticker_insight_cache")
      .upsert({
        ticker: rawTicker,
        payload: insight,
        grounded,
        generated_at: generatedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        created_by: null,
      }, { onConflict: "ticker" });

    console.log(JSON.stringify({
      phase: "stock_insight", ticker: rawTicker, cache_hit: false, refresh, grounded, elapsed_ms: Date.now() - t0,
    }));

    return jsonResponse({
      insight, grounded, cached: false, generated_at: generatedAt.toISOString(),
    });
  })();

  inflight.set(key, p);
  try {
    const result = await p;
    return result.clone();
  } finally {
    inflight.delete(key);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    console.log(JSON.stringify({ phase: "stock_insight", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
