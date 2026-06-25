// Yahoo daily chart fetcher with per-run cache, bounded retries, safe timeouts.
// Regular-session data only — no pre/post-market.

export type YahooChart = {
  symbol: string;
  price: number;          // regularMarketPrice
  previousClose: number | null;
  currency: string | null; // Yahoo meta.currency (e.g. USD, GBP, GBp, EUR)
  timestamps: number[];   // unix seconds (filtered to valid sessions)
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
};

export type YahooFetchResult =
  | { ok: true; chart: YahooChart }
  | { ok: false; reason: string; httpStatus: number | null };

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RANGE = "3mo";
const DEFAULT_INTERVAL = "1d";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`yahoo_timeout_${ms}ms`)), ms)),
  ]);
}

function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function alignArrays(
  ts: unknown,
  close: unknown,
  high: unknown,
  low: unknown,
  vol: unknown,
): { timestamps: number[]; closes: number[]; highs: number[]; lows: number[]; volumes: number[] } {
  const a = Array.isArray(ts) ? ts : [];
  const c = Array.isArray(close) ? close : [];
  const h = Array.isArray(high) ? high : [];
  const l = Array.isArray(low) ? low : [];
  const v = Array.isArray(vol) ? vol : [];
  const out = { timestamps: [] as number[], closes: [] as number[], highs: [] as number[], lows: [] as number[], volumes: [] as number[] };
  const n = Math.min(a.length, c.length, h.length, l.length, v.length);
  for (let i = 0; i < n; i++) {
    if (isValidNumber(a[i]) && isValidNumber(c[i]) && isValidNumber(h[i]) && isValidNumber(l[i]) && isValidNumber(v[i])) {
      out.timestamps.push(a[i] as number);
      out.closes.push(c[i] as number);
      out.highs.push(h[i] as number);
      out.lows.push(l[i] as number);
      out.volumes.push(v[i] as number);
    }
  }
  return out;
}

async function fetchOnce(symbol: string): Promise<YahooFetchResult> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=${DEFAULT_INTERVAL}&range=${DEFAULT_RANGE}`;
  try {
    const res = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      }),
      DEFAULT_TIMEOUT_MS,
    );
    const status = res.status;
    let json: any = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (status !== 200) return { ok: false, reason: `status_${status}`, httpStatus: status };
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    if (!meta || typeof meta.regularMarketPrice !== "number") {
      return { ok: false, reason: "missing_meta", httpStatus: status };
    }
    const aligned = alignArrays(result?.timestamp, quote?.close, quote?.high, quote?.low, quote?.volume);
    if (aligned.closes.length < 2) {
      return { ok: false, reason: "insufficient_sessions", httpStatus: status };
    }
    return {
      ok: true,
      chart: {
        symbol: meta.symbol ?? symbol,
        price: meta.regularMarketPrice,
        previousClose: isValidNumber(meta.chartPreviousClose)
          ? meta.chartPreviousClose
          : isValidNumber(meta.previousClose) ? meta.previousClose : null,
        currency: typeof meta.currency === "string" && meta.currency.length > 0 ? meta.currency : null,
        timestamps: aligned.timestamps,
        closes: aligned.closes,
        highs: aligned.highs,
        lows: aligned.lows,
        volumes: aligned.volumes,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return { ok: false, reason: msg.slice(0, 120), httpStatus: null };
  }
}

export async function fetchYahooChartWithRetry(symbol: string, retries = 2): Promise<YahooFetchResult> {
  let last: YahooFetchResult = { ok: false, reason: "not_attempted", httpStatus: null };
  for (let i = 0; i <= retries; i++) {
    last = await fetchOnce(symbol);
    if (last.ok) return last;
    if (last.httpStatus === 404) return last; // permanent
    if (i < retries) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return last;
}

// Run-level cache: fetch each symbol at most once per request.
export class YahooRunCache {
  private store = new Map<string, YahooFetchResult>();
  private inflight = new Map<string, Promise<YahooFetchResult>>();

  async get(symbol: string): Promise<YahooFetchResult> {
    const key = symbol.toUpperCase();
    const cached = this.store.get(key);
    if (cached) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = fetchYahooChartWithRetry(key).then((res) => {
      this.store.set(key, res);
      this.inflight.delete(key);
      return res;
    });
    this.inflight.set(key, p);
    return p;
  }

  async getMany(symbols: string[], concurrency = 8): Promise<Map<string, YahooFetchResult>> {
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
    const out = new Map<string, YahooFetchResult>();
    let i = 0;
    async function worker(self: YahooRunCache) {
      while (i < unique.length) {
        const idx = i++;
        const sym = unique[idx];
        out.set(sym, await self.get(sym));
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker(this)));
    return out;
  }
}
