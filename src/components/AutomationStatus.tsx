import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Mail, Mic, TrendingUp, Cpu, RefreshCw, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Status {
  enabled: boolean;
  english: { sent: number; remaining: number; lastWord: string | null; audio: boolean | null; day: string } | null;
  speaking: { required: boolean; completedToday: boolean; gate: string };
  stock: { lastSent: string | null; nextRun: string | null; topPick: string | null };
  ml: { training: { status: string; started_at: string; finished_at: string | null } | null; model: { algorithm: string; status: string; version: string } | null; prediction: { ticker: string; predicted_probability: number } | null };
  cooldowns: Record<string, number>;
  lastTests: { kind: string; status: string; sent_at: string | null }[];
}
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not recorded yet";

export function AutomationStatus({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const status = useQuery({
    queryKey: ["automation-status", userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("automation-control", { body: { action: "status", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      if (error || data?.error) throw new Error(data?.error ?? "Automation status is unavailable");
      return data as Status;
    },
    refetchInterval: 60000,
  });
  useEffect(() => { if (status.data) setCooldowns(status.data.cooldowns); }, [status.data]);
  useEffect(() => {
    const timer = window.setInterval(() => setCooldowns(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.max(0, v - 1)]))), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const testSend = useCallback(async (kind: "stock" | "english") => {
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke("automation-control", { body: { action: "test", kind, request_id: crypto.randomUUID() } });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? "Test could not finish. Check status before retrying.");
      }
      if (!data?.ok) throw new Error(data?.error ?? "Test was not sent");
      toast({ title: `${kind === "stock" ? "Stock" : "English"} test email sent`, description: "Your regular schedule is unchanged." });
      setCooldowns(c => ({ ...c, [kind]: 300 }));
    } catch (e) { toast({ title: "Test not sent", description: e instanceof Error ? e.message : "Please try again later", variant: "destructive" }); }
    finally { setBusy(null); await status.refetch(); }
  }, [toast, status.refetch]);
  const toggle = async (required: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("speaking_user_state").upsert({ user_id: userId, require_speaking_for_stock: required }, { onConflict: "user_id" });
    if (error) toast({ title: "Could not save speaking requirement", variant: "destructive" });
    await status.refetch(); setSaving(false);
  };
  const d = status.data;
  const dot = (tone: "success" | "warning" | "muted") => (
    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground/40"}`} />
  );
  const testButton = (kind: "stock" | "english") => (
    <Button
      variant="outline"
      size="sm"
      className="mt-3 h-8 rounded-xl border-border/60 bg-background/60 text-xs gap-1.5"
      disabled={!d?.enabled || Boolean(busy) || (cooldowns[kind] ?? 0) > 0}
      onClick={() => testSend(kind)}
    >
      {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      {busy === kind ? "Sending…" : (cooldowns[kind] ?? 0) > 0 ? `Test in ${Math.ceil(cooldowns[kind] / 60)} min` : `Test ${kind === "stock" ? "stock" : "English"} email`}
    </Button>
  );
  return (
    <section aria-labelledby="automation-heading" className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="automation-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-4 w-4 text-primary" />
          Automation Status
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl"
          aria-label="Refresh automation status"
          title="Refresh automation status"
          disabled={status.isFetching}
          onClick={() => status.refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${status.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {status.isPending ? (
        <div className="surface-panel p-5 text-sm text-muted-foreground">Checking today’s activity…</div>
      ) : status.isError ? (
        <div role="alert" className="surface-panel p-5 text-sm text-destructive">Status unavailable. Your schedules are unchanged.</div>
      ) : d && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="surface-panel p-4 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" />English Hourly Emails</h3>
                {dot(d.english ? (d.english.sent > 0 ? "success" : "warning") : "muted")}
              </div>
              {d.english ? (
                <>
                  <p className="text-2xl font-semibold tracking-tight">{d.english.sent}<span className="text-sm font-normal text-muted-foreground"> / 9 sent</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{d.english.remaining} remaining · Audio: {d.english.audio === null ? "Not recorded" : d.english.audio ? "Ready" : "Unavailable"}</p>
                  <p className="mt-1.5 break-words text-xs text-foreground/90">Last phrase: <span className="font-medium">{d.english.lastWord ?? "None today"}</span></p>
                </>
              ) : <p className="text-xs text-muted-foreground">Not enabled for this account</p>}
            </div>
            <div>{testButton("english")}</div>
          </div>

          <div className="surface-panel p-4 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Mic className="h-4 w-4 text-primary" />Speaking Gym Gate</h3>
                {dot(d.speaking.completedToday ? "success" : d.speaking.required ? "warning" : "muted")}
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <label htmlFor="automation-speaking" className="text-xs text-foreground/90">Require speaking for stock emails</label>
                <Switch id="automation-speaking" aria-label="Require speaking for stock emails" checked={d.speaking.required} disabled={saving} onCheckedChange={toggle} />
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">{d.speaking.gate === "inactive" ? "Inactive" : d.speaking.gate === "paused" ? "Paused" : d.speaking.gate === "warning" ? "Active · warning day" : "Active"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Today’s session: {d.speaking.completedToday ? "Completed" : "Not completed"}</p>
            </div>
          </div>

          <div className="surface-panel p-4 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" />Stock & Swing Watch</h3>
                {dot(d.stock.topPick ? "success" : "muted")}
              </div>
              <p className="text-xs text-foreground/90">Last sent: <span className="font-medium">{timestamp(d.stock.lastSent)}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">Next: {timestamp(d.stock.nextRun)}</p>
              <p className="mt-2 text-xs text-foreground/90">Today’s rule pick: <strong className="font-semibold">{d.stock.topPick ?? "No pick recorded"}</strong></p>
            </div>
            <div>{testButton("stock")}</div>
          </div>

          <div className="surface-panel p-4 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-primary" />ML Shadow Training</h3>
                {dot(d.ml.training?.status === "completed" ? "success" : d.ml.training ? "warning" : "muted")}
              </div>
              <p className="text-xs text-foreground/90">Last run: <span className="font-medium">{timestamp(d.ml.training?.finished_at ?? d.ml.training?.started_at)}</span> · <span className="text-muted-foreground">{d.ml.training?.status ?? "No run"}</span></p>
              <p className="mt-1.5 break-words text-xs text-foreground/90 capitalize">Model: <span className="font-medium">{d.ml.model?.algorithm?.replace(/_/g, " ") ?? "Not registered"}</span> <span className="text-muted-foreground">({d.ml.model?.status ?? "shadow-only"})</span></p>
              <p className="mt-1.5 text-xs text-foreground/90">Top estimate: <span className="font-semibold">{d.ml.prediction ? `${d.ml.prediction.ticker} · ${(Number(d.ml.prediction.predicted_probability) * 100).toFixed(1)}%` : "No fresh prediction"}</span></p>
            </div>
          </div>
        </div>
      )}
      {d?.lastTests?.length ? (
        <p className="mt-2.5 text-xs text-muted-foreground px-1">
          Latest test: {d.lastTests[0].kind} · {d.lastTests[0].status} · {timestamp(d.lastTests[0].sent_at)}
        </p>
      ) : null}
    </section>
  );
}