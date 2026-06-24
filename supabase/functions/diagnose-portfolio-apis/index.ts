// Phase 0 diagnostic — read-only. No DB writes, no emails, no portfolio records.
//
// Security:
//   - Requires Supabase JWT (verify_jwt = true via config.toml)
//   - STRICTLY requires header `x-diag-key` matching DIAG_KEY secret. Missing
//     or mismatched header => 403. No optional bypass.
//
// Returns:
//   - Yahoo OHLCV readiness for ARM and WDC (no raw arrays returned).
//   - Yahoo invalid-symbol behavior.
//   - Finnhub recommendation availability for ARM (counts only).
//   - Finnhub dynamic peers for ARM (counts + checks, no peer list returned).
//   - Gemini structured JSON via google/gemini-2.5-flash.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-diag-key",
};

const GEMINI_MODEL = "google/gemini-2.5-flash";
const MIN_SESSIONS_REQUIRED = 20;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function safeErr(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 240);
  try { return String(e).slice(0, 240); } catch { return "unknown_error"; }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout_${ms}ms`)), ms),
    ),
  ]);
}

function arrayStats(a: unknown): { exists: boolean; length: number; nonNull: number } {
  if (!Array.isArray(a)) return { exists: false, length: 0, nonNull: 0 };
  let nn = 0;
  for (const v of a) if (v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v))) nn++;
  return { exists: true, length: a.length, nonNull: nn };
}

async function fetchYahooChart(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const res = await withTimeout(fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  }), 8000);
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function testYahooOhlcv(symbol: string) {
  try {
    const { status, json } = await fetchYahooChart(symbol);
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];

    const metaSymbolOk = typeof meta?.symbol === "string" && meta.symbol.length > 0;
    const metaPriceOk = typeof meta?.regularMarketPrice === "number";
    const ts = arrayStats(result?.timestamp);
    const close = arrayStats(quote?.close);
    const high = arrayStats(quote?.high);
    const low = arrayStats(quote?.low);
    const vol = arrayStats(quote?.volume);

    const closeReady = close.nonNull >= MIN_SESSIONS_REQUIRED;
    const highReady = high.nonNull >= MIN_SESSIONS_REQUIRED;
    const lowReady = low.nonNull >= MIN_SESSIONS_REQUIRED;
    const volReady = vol.nonNull >= MIN_SESSIONS_REQUIRED;
    const tsReady = ts.nonNull >= MIN_SESSIONS_REQUIRED;

    const returnsReady = closeReady && close.nonNull >= 21;
    const volumeReady = volReady;
    const rsiReady = closeReady && close.nonNull >= 15;
    const atrReady = closeReady && highReady && lowReady && close.nonNull >= 15;
    const supportResistanceReady = closeReady && highReady && lowReady;
    const movingAveragesReady = close.nonNull >= 20;
    const drawdownReady = closeReady && highReady;

    return {
      symbol,
      endpoint: `yahoo.chart(${symbol})`,
      http_status: status,
      ohlcv: {
        "meta.symbol": { exists: metaSymbolOk },
        "meta.regularMarketPrice": { exists: metaPriceOk },
        "timestamp[]": { ...ts, hasMin20: ts.nonNull >= MIN_SESSIONS_REQUIRED },
        "indicators.quote[0].close[]": { ...close, hasMin20: closeReady },
        "indicators.quote[0].high[]": { ...high, hasMin20: highReady },
        "indicators.quote[0].low[]": { ...low, hasMin20: lowReady },
        "indicators.quote[0].volume[]": { ...vol, hasMin20: volReady },
      },
      calculation_readiness: {
        validCloseSessions: close.nonNull,
        validHighSessions: high.nonNull,
        validLowSessions: low.nonNull,
        validVolumeSessions: vol.nonNull,
        oneSessionReturnReady: close.nonNull >= 2,
        sevenSessionReturnReady: close.nonNull >= 8,
        twentySessionReturnReady: close.nonNull >= 21,
        averageVolumeReady: vol.nonNull >= 20,
        volumeStrengthReady: vol.nonNull >= 20,
        rsi14Ready: rsiReady,
        atr14Ready: atrReady,
        supportResistanceReady,
        movingAveragesReady,
        drawdownFromRecentHighReady: drawdownReady,
        returnsReady,
        volumeReady,
        rsiReady,
        atrReady,
      },
      ready: metaSymbolOk && metaPriceOk && returnsReady && volumeReady && rsiReady && atrReady && supportResistanceReady,
      safe_error_summary: status === 200 ? null : `status_${status}`,
    };
  } catch (e) {
    return {
      symbol,
      endpoint: `yahoo.chart(${symbol})`,
      http_status: null,
      ohlcv: null,
      calculation_readiness: null,
      ready: false,
      safe_error_summary: safeErr(e),
    };
  }
}

async function testYahooInvalid() {
  try {
    const { status, json } = await fetchYahooChart("ZZZZINVALIDXYZ");
    const code = json?.chart?.error?.code ?? null;
    const description = json?.chart?.error?.description ? "present" : "absent";
    const cleanFailure = status === 404 || code === "Not Found";
    return {
      endpoint: "yahoo.chart(invalid_symbol)",
      http_status: status,
      clean_failure: cleanFailure,
      error_code: code,
      error_description_field: description,
      safe_error_summary: cleanFailure ? "clean_404_or_not_found" : `unexpected_status_${status}`,
    };
  } catch (e) {
    return {
      endpoint: "yahoo.chart(invalid_symbol)",
      http_status: null,
      clean_failure: false,
      safe_error_summary: safeErr(e),
    };
  }
}

async function testFinnhubRecommendation(symbol: string) {
  const key = Deno.env.get("FINNHUB_API_KEY");
  if (!key) {
    return { endpoint: `finnhub.recommendation(${symbol})`, http_status: null, available: false, safe_error_summary: "missing_FINNHUB_API_KEY" };
  }
  try {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const res = await withTimeout(fetch(url), 8000);
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    const arr = Array.isArray(json) ? json : [];
    const first = arr[0] ?? null;
    const requiredFields = ["symbol", "period", "buy", "hold", "sell", "strongBuy", "strongSell"];
    const fieldsPresent = first ? requiredFields.filter((k) => first[k] !== undefined) : [];
    const available = res.status === 200 && arr.length > 0 && fieldsPresent.length === requiredFields.length;
    return {
      endpoint: `finnhub.recommendation(${symbol})`,
      http_status: res.status,
      available,
      record_count: arr.length,
      required_fields_present_count: fieldsPresent.length,
      required_fields_expected_count: requiredFields.length,
      safe_error_summary: available ? null : (arr.length === 0 ? "empty_array" : `status_${res.status}`),
    };
  } catch (e) {
    return { endpoint: `finnhub.recommendation(${symbol})`, http_status: null, available: false, safe_error_summary: safeErr(e) };
  }
}

async function testFinnhubPeers(symbol: string) {
  const key = Deno.env.get("FINNHUB_API_KEY");
  if (!key) {
    return { endpoint: `finnhub.peers(${symbol})`, http_status: null, available: false, safe_error_summary: "missing_FINNHUB_API_KEY" };
  }
  try {
    const url = `https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const res = await withTimeout(fetch(url), 8000);
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    const raw = Array.isArray(json) ? json : [];
    const stringPeers = raw.filter((s): s is string => typeof s === "string");
    const allValidTickerLike = stringPeers.length > 0 && stringPeers.every((s) => TICKER_RE.test(s.toUpperCase()));
    const selfExcluded = !stringPeers.some((s) => s.toUpperCase() === symbol.toUpperCase());
    const peerCountExcludingSelf = stringPeers.filter((s) => s.toUpperCase() !== symbol.toUpperCase()).length;
    const available = res.status === 200 && peerCountExcludingSelf > 0;
    return {
      endpoint: `finnhub.peers(${symbol})`,
      http_status: res.status,
      available,
      peer_count: peerCountExcludingSelf,
      self_symbol_excluded: selfExcluded,
      all_returned_values_valid_ticker_like: allValidTickerLike,
      safe_error_summary: available ? null : (peerCountExcludingSelf === 0 ? "peer_analysis_unavailable_empty" : `status_${res.status}`),
    };
  } catch (e) {
    return { endpoint: `finnhub.peers(${symbol})`, http_status: null, available: false, safe_error_summary: safeErr(e) };
  }
}

async function testGeminiStructured() {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return { endpoint: `gemini.structured_json(${GEMINI_MODEL})`, http_status: null, available: false, safe_error_summary: "missing_LOVABLE_API_KEY" };
  }
  try {
    const res = await withTimeout(fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: 'Return JSON only. Schema: {"ok": boolean, "note": string}. No prose.' },
          { role: "user", content: 'Return exactly {"ok": true, "note": "diagnostic"} as strict JSON.' },
        ],
        response_format: { type: "json_object" },
      }),
    }), 15000);
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    const content = json?.choices?.[0]?.message?.content;
    let parsed: any = null;
    if (typeof content === "string") { try { parsed = JSON.parse(content); } catch { /* ignore */ } }
    const okField = parsed && typeof parsed === "object" && "ok" in parsed;
    const noteField = parsed && typeof parsed === "object" && "note" in parsed;
    const available = res.status === 200 && parsed?.ok === true;
    return {
      endpoint: `gemini.structured_json(${GEMINI_MODEL})`,
      http_status: res.status,
      available,
      ok_field_present: okField,
      note_field_present: noteField,
      safe_error_summary: available ? null : (res.status === 429 ? "rate_limited" : res.status === 402 ? "credits_exhausted" : `status_${res.status}_or_parse_failed`),
    };
  } catch (e) {
    return { endpoint: `gemini.structured_json(${GEMINI_MODEL})`, http_status: null, available: false, safe_error_summary: safeErr(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Strict: JWT verified by platform AND x-diag-key required and must match.
  const expectedDiagKey = Deno.env.get("DIAG_KEY");
  const providedDiagKey = req.headers.get("x-diag-key");
  if (!expectedDiagKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured", reason: "DIAG_KEY_not_set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!providedDiagKey || providedDiagKey !== expectedDiagKey) {
    return new Response(JSON.stringify({ error: "forbidden", reason: "missing_or_invalid_diag_key" }), {
      status: 403, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const started = Date.now();
  const [arm, wdc, invalid, rec, peers, gem] = await Promise.all([
    testYahooOhlcv("ARM"),
    testYahooOhlcv("WDC"),
    testYahooInvalid(),
    testFinnhubRecommendation("ARM"),
    testFinnhubPeers("ARM"),
    testGeminiStructured(),
  ]);

  const blockers: string[] = [];
  if (!arm.ready) blockers.push("ARM_OHLCV_not_ready");
  if (!wdc.ready) blockers.push("WDC_OHLCV_not_ready");
  if (!invalid.clean_failure) blockers.push("yahoo_invalid_symbol_not_clean");
  if (!rec.available) blockers.push("finnhub_recommendation_unavailable");
  if (!peers.available) blockers.push("finnhub_peers_unavailable");
  if (!gem.available) blockers.push("gemini_structured_json_unavailable");

  const summary = {
    strict_diag_key_enforced: true,
    started_at: new Date(started).toISOString(),
    duration_ms: Date.now() - started,
    overall_ready: blockers.length === 0,
    blockers,
    yahoo_arm: arm,
    yahoo_wdc: wdc,
    yahoo_invalid: invalid,
    finnhub_recommendation_arm: rec,
    finnhub_peers_arm: peers,
    gemini: gem,
  };

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});
