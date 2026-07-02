import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink, RefreshCw, AlertTriangle, ShieldAlert, CheckCircle2, Loader2, Circle,
  LineChart, Info,
} from "lucide-react";

import { StockResearchLayout } from "@/components/layouts/StockResearchLayout";

type Insight = {
  ticker: string;
  company_name?: string;
  generated_at?: string;
  summary?: string;
  market_status?: { recent_movement?: string; technical_context?: string };
  key_catalysts?: Array<{ title: string; details: string; source_name?: string; source_url?: string }>;
  financial_health?: { summary?: string; notable_metrics?: string[] };
  analyst_consensus?: { summary?: string; notable_points?: string[] };
  risk_flags?: string[];
  sources?: Array<{ name?: string; url?: string }>;
  disclaimer?: string;
};

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

const STEP_LABELS = [
  "Checking cached insight",
  "Searching latest news",
  "Analyzing catalysts",
  "Building summary",
  "Preparing sources",
];

const StockInsight = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const rawTicker = (params.get("ticker") || "").toUpperCase().trim();
  const ticker = TICKER_RE.test(rawTicker) ? rawTicker : "";
  const source = params.get("source") || "";

  const [insight, setInsight] = useState<Insight | null>(null);
  const [grounded, setGrounded] = useState<boolean>(false);
  const [cached, setCached] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);

  const [stepIdx, setStepIdx] = useState(0);
  const [slow, setSlow] = useState<"none" | "wait" | "very">("none");
  const inflight = useRef(false);

  const fetchInsight = useCallback(async (refresh: boolean) => {
    if (!ticker || inflight.current) return;
    inflight.current = true;

    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    setErrorCode(null);
    setStepIdx(0);
    setSlow("none");

    // Visual step progression — advances every ~5s up to the final "preparing sources" step.
    const stepTimers: number[] = [];
    for (let i = 1; i < STEP_LABELS.length; i++) {
      stepTimers.push(window.setTimeout(() => setStepIdx((s) => Math.max(s, i)), i * 5000));
    }
    const slowT = window.setTimeout(() => setSlow("wait"), 15000);
    const verySlowT = window.setTimeout(() => setSlow("very"), 45000);

    try {
      const { data, error: err } = await supabase.functions.invoke("stock-ticker-insight", {
        body: { ticker, refresh },
      });
      if (err) {
        // supabase-js wraps HTTP errors — try to pull status
        const status = (err as { context?: { status?: number } })?.context?.status ?? null;
        setErrorCode(status);
        // Attempt to read the JSON body for a friendly message
        let msg = err.message || "Could not load insight.";
        try {
          const ctx = (err as { context?: { text?: () => Promise<string> } })?.context;
          if (ctx?.text) {
            const body = await ctx.text();
            const parsed = JSON.parse(body);
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        setError(mapError(msg, status));
        return;
      }
      if (data?.error) {
        setError(mapError(data.error, null));
        return;
      }
      setInsight(data.insight as Insight);
      setGrounded(!!data.grounded);
      setCached(!!data.cached);
      setStepIdx(STEP_LABELS.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load insight.";
      setError(mapError(msg, null));
    } finally {
      stepTimers.forEach(clearTimeout);
      clearTimeout(slowT);
      clearTimeout(verySlowT);
      setLoading(false);
      setRefreshing(false);
      inflight.current = false;
    }
  }, [ticker]);

  // Single fetch on mount — no auth-gate. Cached insights are available anonymously.
  useEffect(() => {
    if (!ticker) {
      setError("Invalid ticker symbol.");
      setLoading(false);
      return;
    }
    void fetchInsight(false);
  }, [ticker, fetchInsight]);

  const handleRefresh = () => {
    if (refreshing || loading || inflight.current) return;
    void fetchInsight(true);
  };

  const handleSignInToGenerate = () => {
    const target = `/stock-insight?ticker=${ticker}${source ? `&source=${encodeURIComponent(source)}` : ""}`;
    sessionStorage.setItem("post_login_redirect", target);
    navigate(`/auth?post_login_redirect=${encodeURIComponent(target)}&context=stock`);
  };

  const busy = loading || refreshing;

  return (
    <StockResearchLayout
      subtitle={ticker || "Ticker Insight"}
      backTo="/dashboard"
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-xs text-muted-foreground">
          {source === "stock-email" ? "From your stock email" : "Ticker Insight"}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={busy || !ticker}
          className="gap-2"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshing ? "Refreshing latest news…" : busy ? "Please wait…" : "Refresh latest news"}
        </Button>
      </div>

      <div className="space-y-4">
        {busy && (
          <LoadingCard ticker={ticker} stepIdx={stepIdx} slow={slow} refreshing={refreshing} />
        )}

        {error && !busy && (
          <Card className="border-red-300">
            <CardContent className="pt-5 pb-5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-red-900">{error}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {errorCode === 401 && (
                    <Button size="sm" onClick={handleSignInToGenerate}>Sign in to continue</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => fetchInsight(false)}>
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate("/dashboard")}>
                    Back
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!busy && !error && insight && (
          <>
            {!grounded && (
              <Card className="border-amber-300">
                <CardContent className="pt-4 pb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-amber-900">Fresh grounded news was unavailable</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try refreshing later. The overview below is general context, not breaking news.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  {insight.company_name || ticker}{" "}
                  <span className="text-muted-foreground font-normal">({ticker})</span>
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  {cached ? "Cached insight" : "Live"} · generated{" "}
                  {insight.generated_at ? new Date(insight.generated_at).toLocaleString() : "just now"}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{insight.summary || "No summary available."}</p>
              </CardContent>
            </Card>

            {insight.market_status && (
              <Card>
                <CardHeader><CardTitle className="text-base">Market status</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  {insight.market_status.recent_movement && (
                    <div><span className="text-muted-foreground">Recent movement: </span>{insight.market_status.recent_movement}</div>
                  )}
                  {insight.market_status.technical_context && (
                    <div><span className="text-muted-foreground">Technical context: </span>{insight.market_status.technical_context}</div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Key catalysts</CardTitle></CardHeader>
              <CardContent>
                {!insight.key_catalysts || insight.key_catalysts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No fresh catalysts found.</p>
                ) : (
                  <ul className="space-y-3">
                    {insight.key_catalysts.map((c, i) => (
                      <li key={i} className="text-sm">
                        <div className="font-semibold">{c.title}</div>
                        <div className="text-muted-foreground">{c.details}</div>
                        {c.source_url && (
                          <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                            {c.source_name || c.source_url} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {insight.financial_health && (
              <Card>
                <CardHeader><CardTitle className="text-base">Financial health</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {insight.financial_health.summary && <p className="mb-2">{insight.financial_health.summary}</p>}
                  {insight.financial_health.notable_metrics && insight.financial_health.notable_metrics.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1">
                      {insight.financial_health.notable_metrics.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {insight.analyst_consensus && (insight.analyst_consensus.summary || (insight.analyst_consensus.notable_points || []).length > 0) && (
              <Card>
                <CardHeader><CardTitle className="text-base">Analyst consensus</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {insight.analyst_consensus.summary && <p className="mb-2">{insight.analyst_consensus.summary}</p>}
                  {insight.analyst_consensus.notable_points && insight.analyst_consensus.notable_points.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1">
                      {insight.analyst_consensus.notable_points.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {insight.risk_flags && insight.risk_flags.length > 0 && (
              <Card className="border-amber-300">
                <CardHeader><CardTitle className="text-base">Risk flags</CardTitle></CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {insight.risk_flags.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}

            {insight.sources && insight.sources.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Sources</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {insight.sources.filter((s) => s?.url).map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">
                          {s.name || s.url} <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </StockResearchLayout>
  );
};

function mapError(raw: string, status: number | null): string {
  const s = (raw || "").toLowerCase();
  if (status === 403 || s.includes("not enabled") || s.includes("authorized users")) {
    return "Stock insight is not enabled for this account.";
  }
  if (status === 401 || s.includes("sign in")) {
    return "Sign in or verify access to generate the latest stock insight.";
  }
  if (status === 429 || s.includes("rate limit") || s.includes("too many")) {
    return "Too many stock insight requests. Please wait and try again.";
  }
  if (status === 400 || s.includes("invalid ticker")) {
    return "Invalid ticker symbol.";
  }
  return "Latest news could not be generated right now. Please try again later.";
}

function LoadingCard({
  ticker, stepIdx, slow, refreshing,
}: {
  ticker: string; stepIdx: number; slow: "none" | "wait" | "very"; refreshing: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          {refreshing ? `Refreshing latest news for ${ticker}` : `Loading ${ticker} stock insight`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Searching latest news and market catalysts. This can take 20–45 seconds on the first request.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {STEP_LABELS.map((label, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <li key={label} className="flex items-center gap-2 text-sm">
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/40" />
                )}
                <span className={done ? "text-muted-foreground line-through" : active ? "font-medium" : "text-muted-foreground"}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {slow === "wait" && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Still working — grounded news searches can take a little longer.
          </div>
        )}
        {slow === "very" && (
          <div className="rounded-md border border-amber-400 bg-amber-100 p-3 text-sm text-amber-900">
            This is taking longer than usual. You can keep waiting or try again later.
          </div>
        )}

        <div className="grid gap-2 pt-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}

export default StockInsight;
