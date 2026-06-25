import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Briefcase } from "lucide-react";
import { HoldingForm } from "@/components/portfolio/HoldingForm";
import { HoldingsTable, type HoldingRow } from "@/components/portfolio/HoldingsTable";
import { CashBalanceInput } from "@/components/portfolio/CashBalanceInput";
import { SaveToggle } from "@/components/portfolio/SaveToggle";
import { ResearchConfirmButton } from "@/components/portfolio/ResearchConfirmButton";
import { RequestStatusBadge } from "@/components/portfolio/RequestStatusBadge";
import { RequestHistoryList, type RequestHistoryRow } from "@/components/portfolio/RequestHistoryList";
import { MAX_HOLDINGS, type HoldingInput } from "@/lib/portfolio/schema";
import { payloadFromHoldings, submitPortfolioResearch } from "@/lib/portfolio/api";
import { fetchOwnPortfolioAccess, maskEmail } from "@/lib/portfolio/access";

const FEATURE_ENABLED = String(import.meta.env.VITE_FEATURE_PORTFOLIO_AGENT ?? "").toLowerCase() === "true";

interface SavedPosition {
  id: string;
  ticker: string;
  shares: number;
  average_cost: number | null;
  purchase_date: string | null;
}

interface ActiveRequest {
  id: string;
  status: string;
  created_at: string;
  holdings_count: number;
  final_decision_status: string | null;
  confidence: string | null;
  email_sent: boolean | null;
  error_summary: string | null;
}

export default function Portfolio() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);
  const [maskedReportEmail, setMaskedReportEmail] = useState<string>("");

  // Saved positions from DB.
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  // Working basket of holdings for this submission (mix of saved/one-time).
  const [basket, setBasket] = useState<HoldingRow[]>([]);
  const [saveHoldings, setSaveHoldings] = useState(false);

  // Portfolio settings.
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [accountTotalDeclared, setAccountTotalDeclared] = useState(false);

  // Forms.
  const [addOpen, setAddOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);

  // Request lifecycle.
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [history, setHistory] = useState<RequestHistoryRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const intended = location.pathname + (location.search ?? "");
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.user) {
        sessionStorage.setItem("post_login_redirect", intended);
        navigate("/auth", { replace: true });
        return;
      }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? "");
      const access = await fetchOwnPortfolioAccess();
      if (!mounted) return;
      if (!access || !access.enabled) {
        setAccessEnabled(false);
      } else {
        setAccessEnabled(true);
        setMaskedReportEmail(maskEmail(access.reportEmail));
      }
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate("/auth", { replace: true });
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [navigate, location.pathname, location.search]);

  // ── Load saved holdings ───────────────────────────────────────────────────
  const loadSaved = useCallback(async () => {
    if (!userId) return;
    setLoadingSaved(true);
    const { data, error } = await supabase
      .from("portfolio_positions")
      .select("id, ticker, shares, average_cost, purchase_date, deleted_at")
      .is("deleted_at", null)
      .order("ticker");
    setLoadingSaved(false);
    if (error) {
      toast.error("Could not load saved holdings");
      return;
    }
    setSaved((data ?? []) as SavedPosition[]);
  }, [userId]);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  // ── Load history + active request ─────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("portfolio_research_requests")
      .select("id, status, created_at, holdings_count, final_decision_status, confidence, email_sent, error_summary")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return;
    const rows = (data ?? []) as RequestHistoryRow[];
    setHistory(rows);
    const active = rows.find((r) => r.status === "pending" || r.status === "running") ?? null;
    setActiveRequest(active as ActiveRequest | null);
  }, [userId]);
  useEffect(() => { void loadRequests(); }, [loadRequests]);

  // Polling every 3 seconds when there is an active request.
  useEffect(() => {
    if (!activeRequest) return;
    const id = setInterval(() => { void loadRequests(); }, 3000);
    return () => clearInterval(id);
  }, [activeRequest?.id, loadRequests]);

  // ── Saved holding CRUD ────────────────────────────────────────────────────
  async function upsertSaved(h: HoldingInput, id?: string) {
    if (!userId) return;
    const payload = {
      user_id: userId,
      ticker: h.ticker,
      shares: h.shares,
      average_cost: h.average_cost_unknown ? null : h.average_cost,
      purchase_date: h.purchase_date ?? null,
      deleted_at: null,
    };
    let res;
    if (id) {
      res = await supabase.from("portfolio_positions").update(payload).eq("id", id);
    } else {
      res = await supabase.from("portfolio_positions").upsert(payload, { onConflict: "user_id,ticker" });
    }
    if (res.error) {
      toast.error("Could not save holding");
      return;
    }
    toast.success(id ? "Holding updated" : "Holding saved");
    await loadSaved();
  }

  async function softDeleteSaved(id: string) {
    const { error } = await supabase
      .from("portfolio_positions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Could not remove"); return; }
    toast.success("Holding removed");
    await loadSaved();
    setBasket((b) => b.filter((r) => r.id !== id));
  }

  // ── Basket helpers ────────────────────────────────────────────────────────
  function addToBasket(h: HoldingInput, opts: { saved?: boolean; id?: string }) {
    setBasket((prev) => {
      if (prev.length >= MAX_HOLDINGS && editingIdx === null) {
        toast.error(`Maximum ${MAX_HOLDINGS} holdings per request`);
        return prev;
      }
      if (prev.some((r, i) => r.ticker === h.ticker && i !== editingIdx)) {
        toast.error(`${h.ticker} already in this request`);
        return prev;
      }
      const row: HoldingRow = { ...h, id: opts.id, saved: opts.saved };
      if (editingIdx !== null) {
        const next = [...prev];
        next[editingIdx] = row;
        return next;
      }
      return [...prev, row];
    });
  }

  function addSavedToBasket(s: SavedPosition) {
    addToBasket(
      {
        ticker: s.ticker,
        shares: Number(s.shares),
        average_cost_unknown: s.average_cost === null,
        average_cost: s.average_cost === null ? null : Number(s.average_cost),
        purchase_date: s.purchase_date,
      },
      { saved: true, id: s.id },
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (basket.length === 0) return;
    if (accountTotalDeclared && cashBalance === null) {
      toast.error("Enter cash balance (use 0 if you have no cash) when declaring full account.");
      return;
    }
    setSubmitting(true);
    try {
      // If user opted to save: persist all unsaved basket items first.
      if (saveHoldings && userId) {
        for (const row of basket) {
          if (row.saved && row.id) continue;
          await supabase.from("portfolio_positions").upsert(
            {
              user_id: userId,
              ticker: row.ticker,
              shares: row.shares,
              average_cost: row.average_cost_unknown ? null : row.average_cost,
              purchase_date: row.purchase_date ?? null,
              deleted_at: null,
            },
            { onConflict: "user_id,ticker" },
          );
        }
        await loadSaved();
      }

      const payload = payloadFromHoldings(basket, cashBalance, accountTotalDeclared, saveHoldings);
      const result = await submitPortfolioResearch(payload);
      if (!result.ok) {
        if (result.status === 429 && result.error === "cooldown_active") {
          toast.error(`Please wait ${result.retry_after_seconds ?? 120}s before submitting again.`);
        } else if (result.status === 429) {
          toast.error("Daily request limit reached.");
        } else if (result.status === 409) {
          toast.error("An active request already exists.");
        } else if (result.status === 400) {
          toast.error(`Validation error: ${result.error ?? "invalid_payload"}`);
        } else {
          toast.error("Could not submit request.");
        }
        return;
      }
      toast.success("Request submitted. Processing…");
      await loadRequests();
    } finally {
      setSubmitting(false);
    }
  }

  const recentHistory = useMemo(
    () => history.filter((r) => !activeRequest || r.id !== activeRequest.id),
    [history, activeRequest],
  );

  if (!FEATURE_ENABLED) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Feature unavailable</CardTitle>
            <CardDescription>The portfolio research agent is not enabled.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (accessEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>Portfolio research is not enabled for this account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const submitDisabled =
    !!activeRequest ||
    submitting ||
    basket.length === 0 ||
    (accountTotalDeclared && cashBalance === null);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Briefcase className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Portfolio Research</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {activeRequest && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>Current request</span>
                <RequestStatusBadge status={activeRequest.status} />
              </CardTitle>
              <CardDescription>
                {new Date(activeRequest.created_at).toLocaleString()} · {activeRequest.holdings_count} holding(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your private portfolio report will be emailed to the configured report address <b className="text-foreground">{maskedReportEmail || "configured address"}</b> when ready. You can refresh this page; status updates every 3 seconds.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Saved holdings library */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved holdings</CardTitle>
            <CardDescription>Your library of holdings. Add to this request, edit, or remove.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSaved ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : saved.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No saved holdings yet.</p>
            ) : (
              <ul className="space-y-2">
                {saved.map((s) => {
                  const inBasket = basket.some((b) => b.id === s.id);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="text-sm">
                        <div className="font-medium">{s.ticker}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.shares} shares · avg{" "}
                          {s.average_cost === null ? <em>unknown</em> : `$${Number(s.average_cost).toFixed(2)}`}
                          {s.purchase_date ? ` · ${s.purchase_date}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={inBasket || basket.length >= MAX_HOLDINGS}
                          onClick={() => addSavedToBasket(s)}
                        >
                          {inBasket ? "Added" : "Add"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingSavedId(s.id); }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void softDeleteSaved(s.id)}>
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Edit saved dialog */}
        <Dialog open={editingSavedId !== null} onOpenChange={(o) => { if (!o) setEditingSavedId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit saved holding</DialogTitle></DialogHeader>
            {editingSavedId && (() => {
              const s = saved.find((x) => x.id === editingSavedId);
              if (!s) return null;
              return (
                <HoldingForm
                  initial={{
                    ticker: s.ticker,
                    shares: Number(s.shares),
                    average_cost_unknown: s.average_cost === null,
                    average_cost: s.average_cost === null ? null : Number(s.average_cost),
                    purchase_date: s.purchase_date ?? undefined,
                  }}
                  submitLabel="Save changes"
                  onCancel={() => setEditingSavedId(null)}
                  onSubmit={async (h) => {
                    await upsertSaved(h, editingSavedId);
                    setEditingSavedId(null);
                  }}
                />
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* This-request basket */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Holdings in this request</span>
              <span className="text-xs text-muted-foreground">{basket.length}/{MAX_HOLDINGS}</span>
            </CardTitle>
            <CardDescription>Pick from saved holdings above or add one below. Max {MAX_HOLDINGS}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HoldingsTable
              rows={basket}
              showSavedBadge
              onEdit={(i) => { setEditingIdx(i); setAddOpen(true); }}
              onRemove={(i) => setBasket((b) => b.filter((_, idx) => idx !== i))}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setEditingIdx(null); setAddOpen(true); }}
              disabled={basket.length >= MAX_HOLDINGS}
            >
              <Plus className="h-4 w-4 mr-1" /> Add holding
            </Button>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingIdx !== null ? "Edit holding" : "Add holding"}</DialogTitle>
                </DialogHeader>
                <HoldingForm
                  initial={editingIdx !== null ? basket[editingIdx] : undefined}
                  submitLabel={editingIdx !== null ? "Save" : "Add"}
                  onCancel={() => { setAddOpen(false); setEditingIdx(null); }}
                  onSubmit={(h) => {
                    addToBasket(h, { saved: editingIdx !== null ? basket[editingIdx]?.saved : false, id: editingIdx !== null ? basket[editingIdx]?.id : undefined });
                    setAddOpen(false);
                    setEditingIdx(null);
                  }}
                />
              </DialogContent>
            </Dialog>

            <SaveToggle value={saveHoldings} onChange={setSaveHoldings} />
            <CashBalanceInput
              cashBalance={cashBalance}
              setCashBalance={setCashBalance}
              accountTotalDeclared={accountTotalDeclared}
              setAccountTotalDeclared={setAccountTotalDeclared}
            />
          </CardContent>
        </Card>

        <ResearchConfirmButton
          holdings={basket}
          saveHoldings={saveHoldings}
          cashBalance={cashBalance}
          accountTotalDeclared={accountTotalDeclared}
          recipientEmail={maskedReportEmail || "configured report address"}
          disabled={submitDisabled}
          busy={submitting || !!activeRequest}
          onConfirm={() => void handleSubmit()}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request history</CardTitle>
            <CardDescription>Last 20 requests</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestHistoryList rows={recentHistory} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
