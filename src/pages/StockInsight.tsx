import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ExternalLink, RefreshCw, AlertTriangle, ShieldAlert } from "lucide-react";

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

const StockInsight = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const rawTicker = (params.get("ticker") || "").toUpperCase().trim();
  const ticker = TICKER_RE.test(rawTicker) ? rawTicker : "";

  const [authChecked, setAuthChecked] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [grounded, setGrounded] = useState<boolean>(false);
  const [cached, setCached] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async (refresh = false) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("stock-ticker-insight", {
        body: { ticker, refresh },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setInsight(data.insight as Insight);
      setGrounded(!!data.grounded);
      setCached(!!data.cached);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load insight.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate(`/auth?post_login_redirect=${encodeURIComponent(`/stock-insight?ticker=${ticker}&source=stock-email`)}`);
        return;
      }
      setAuthChecked(true);
      if (!ticker) {
        setError("Invalid ticker symbol.");
        setLoading(false);
        return;
      }
      fetchInsight(false);
    })();
  }, [navigate, ticker, fetchInsight]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[image:var(--gradient-hero)]">
        <p className="text-muted-foreground">Checking your access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)] pb-20">
      <header className="glass-card sticky top-0 z-10 border-b border-border/30">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Stock Insight</div>
              <div className="text-lg font-semibold">{ticker || "—"}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchInsight(true)} disabled={loading || !ticker} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh latest news
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {error && (
          <Card className="border-red-300">
            <CardContent className="pt-5 pb-5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <div className="font-semibold text-red-900">{error}</div>
                <p className="text-sm text-muted-foreground mt-1">Try again in a moment or return to the dashboard.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!loading && insight && (
          <>
            {!grounded && (
              <Card className="border-amber-300">
                <CardContent className="pt-4 pb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-amber-900">Fresh news may be unavailable</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Google Search grounding didn't return live sources for this request. Treat the content below as a general overview, not breaking news.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  {insight.company_name || ticker} <span className="text-muted-foreground font-normal">({ticker})</span>
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  {cached ? "Cached" : "Live"} · Generated {insight.generated_at ? new Date(insight.generated_at).toLocaleString() : "just now"}
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

            <p className="text-xs text-muted-foreground italic">
              {insight.disclaimer || "This is informational only and not investment advice."}
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default StockInsight;
