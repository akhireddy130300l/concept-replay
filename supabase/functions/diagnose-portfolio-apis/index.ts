// Phase 0 diagnostic — read-only. No DB writes, no emails, no portfolio records.
// Tests: Yahoo (ARM, WDC, invalid symbol), Finnhub (recommendation + peers for ARM),
// and Gemini structured JSON via Lovable AI Gateway using the currently verified model.
//
// Security:
//   - Requires Supabase JWT (verify_jwt = true via config.toml)
//   - Additionally requires header `x-diag-key` matching DIAG_KEY secret
//
// Returns an array of { endpoint, http_status, available, required_fields_found,
// fallback_required, safe_error_summary } items. Never logs secrets or PII.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-diag-key",
};

const GEMINI_MODEL = "google/gemini-2.5-flash"; // matches send-revision-reminders

type DiagResult = {
  endpoint: string;
  http_status: number | null;
  available: boolean;
  required_fields_found: string[];
  fallback_required: boolean;
  safe_error_summary: string | null;
};

function safeErr(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 240);
  try {
    return String(e).slice(0, 240);
  } catch {
    return "unknown_error";
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout_${ms}ms`)), ms),
    ),
  ]);
}

async function testYahooChart(symbol: string, label: string): Promise<DiagResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=3mo`;
  try {
    const res = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      }),
      8000,
    );
    const status = res.status;
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore parse error
    }
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const ts = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    const errObj = json?.chart?.error;

    const fields: string[] = [];
    if (meta?.symbol) fields.push("meta.symbol");
    if (typeof meta?.regularMarketPrice === "number")
      fields.push("meta.regularMarketPrice");
    if (Array.isArray(ts) && ts.length > 0) fields.push("timestamp[]");
    if (Array.isArray(closes) && closes.length > 0) fields.push("indicators.close[]");

    const available = status === 200 && fields.length >= 3;
    return {
      endpoint: `yahoo.chart(${label})`,
      http_status: status,
      available,
      required_fields_found: fields,
      fallback_required: !available,
      safe_error_summary: errObj
        ? `yahoo_error:${errObj?.code ?? "unknown"}`
        : available
          ? null
          : `unexpected_payload_status_${status}`,
    };
  } catch (e) {
    return {
      endpoint: `yahoo.chart(${label})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: safeErr(e),
    };
  }
}

async function testFinnhubRecommendation(symbol: string): Promise<DiagResult> {
  const key = Deno.env.get("FINNHUB_API_KEY");
  if (!key) {
    return {
      endpoint: `finnhub.recommendation(${symbol})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: "missing_FINNHUB_API_KEY",
    };
  }
  const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(
    symbol,
  )}&token=${key}`;
  try {
    const res = await withTimeout(fetch(url), 8000);
    const status = res.status;
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    const arr = Array.isArray(json) ? json : [];
    const first = arr[0] ?? null;
    const fields: string[] = [];
    if (first) {
      for (const k of ["symbol", "period", "buy", "hold", "sell", "strongBuy", "strongSell"]) {
        if (first[k] !== undefined) fields.push(k);
      }
    }
    const available = status === 200 && arr.length > 0 && fields.length >= 4;
    return {
      endpoint: `finnhub.recommendation(${symbol})`,
      http_status: status,
      available,
      required_fields_found: fields,
      fallback_required: !available,
      safe_error_summary: available
        ? null
        : arr.length === 0
          ? "empty_array"
          : `status_${status}`,
    };
  } catch (e) {
    return {
      endpoint: `finnhub.recommendation(${symbol})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: safeErr(e),
    };
  }
}

async function testFinnhubPeers(symbol: string): Promise<DiagResult> {
  const key = Deno.env.get("FINNHUB_API_KEY");
  if (!key) {
    return {
      endpoint: `finnhub.peers(${symbol})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: "missing_FINNHUB_API_KEY",
    };
  }
  const url = `https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(
    symbol,
  )}&token=${key}`;
  try {
    const res = await withTimeout(fetch(url), 8000);
    const status = res.status;
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    const peers = Array.isArray(json) ? json.filter((s) => typeof s === "string") : [];
    const filtered = peers.filter((s) => s.toUpperCase() !== symbol.toUpperCase());
    const fields: string[] = [];
    if (peers.length > 0) fields.push("peers[]");
    if (filtered.length > 0) fields.push("peers_excluding_self[]");
    const available = status === 200 && filtered.length > 0;
    return {
      endpoint: `finnhub.peers(${symbol})`,
      http_status: status,
      available,
      required_fields_found: fields,
      fallback_required: !available,
      safe_error_summary: available
        ? null
        : peers.length === 0
          ? "peer_analysis_unavailable_empty"
          : `status_${status}`,
    };
  } catch (e) {
    return {
      endpoint: `finnhub.peers(${symbol})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: safeErr(e),
    };
  }
}

async function testGeminiStructured(): Promise<DiagResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return {
      endpoint: `gemini.structured_json(${GEMINI_MODEL})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: "missing_LOVABLE_API_KEY",
    };
  }
  try {
    const res = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [
            {
              role: "system",
              content:
                'Return JSON only. Schema: {"ok": boolean, "note": string}. No prose.',
            },
            {
              role: "user",
              content:
                'Return exactly {"ok": true, "note": "diagnostic"} as strict JSON.',
            },
          ],
          response_format: { type: "json_object" },
        }),
      }),
      15000,
    );
    const status = res.status;
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    const content = json?.choices?.[0]?.message?.content;
    let parsed: any = null;
    if (typeof content === "string") {
      try {
        parsed = JSON.parse(content);
      } catch {
        /* ignore */
      }
    }
    const fields: string[] = [];
    if (parsed && typeof parsed === "object") {
      if ("ok" in parsed) fields.push("ok");
      if ("note" in parsed) fields.push("note");
    }
    const available = status === 200 && parsed?.ok === true;
    return {
      endpoint: `gemini.structured_json(${GEMINI_MODEL})`,
      http_status: status,
      available,
      required_fields_found: fields,
      fallback_required: !available,
      safe_error_summary: available
        ? null
        : status === 429
          ? "rate_limited"
          : status === 402
            ? "credits_exhausted"
            : `status_${status}_or_parse_failed`,
    };
  } catch (e) {
    return {
      endpoint: `gemini.structured_json(${GEMINI_MODEL})`,
      http_status: null,
      available: false,
      required_fields_found: [],
      fallback_required: true,
      safe_error_summary: safeErr(e),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // JWT is verified by the platform via verify_jwt=true in config.toml.
  // Additionally require diagnostic key header to prevent casual invocation.
  const expectedDiagKey = Deno.env.get("DIAG_KEY");
  const providedDiagKey = req.headers.get("x-diag-key");
  if (!expectedDiagKey || providedDiagKey !== expectedDiagKey) {
    return new Response(
      JSON.stringify({ error: "forbidden", reason: "invalid_diag_key" }),
      {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }

  const started = Date.now();
  const results = await Promise.all([
    testYahooChart("ARM", "ARM"),
    testYahooChart("WDC", "WDC"),
    testYahooChart("ZZZZINVALIDXYZ", "invalid_symbol"),
    testFinnhubRecommendation("ARM"),
    testFinnhubPeers("ARM"),
    testGeminiStructured(),
  ]);

  const summary = {
    started_at: new Date(started).toISOString(),
    duration_ms: Date.now() - started,
    overall_ready:
      results.filter((r) => r.endpoint.startsWith("yahoo.chart(ARM)") || r.endpoint.startsWith("yahoo.chart(WDC)"))
        .every((r) => r.available) &&
      results.find((r) => r.endpoint.startsWith("yahoo.chart(invalid_symbol)"))?.available === false &&
      results.find((r) => r.endpoint.startsWith("finnhub.recommendation"))?.available === true &&
      results.find((r) => r.endpoint.startsWith("finnhub.peers"))?.available === true &&
      results.find((r) => r.endpoint.startsWith("gemini"))?.available === true,
    results,
  };

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
