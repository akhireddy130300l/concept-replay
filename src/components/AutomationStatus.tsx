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
  const testButton = (kind: "stock" | "english") => <Button variant="outline" size="sm" className="mt-4 gap-2" disabled={!d?.enabled || Boolean(busy) || (cooldowns[kind] ?? 0) > 0} onClick={() => testSend(kind)}>{busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy === kind ? "Sending…" : (cooldowns[kind] ?? 0) > 0 ? `Test in ${Math.ceil(cooldowns[kind] / 60)} min` : `Test ${kind === "stock" ? "stock" : "English"} email`}</Button>;
  return <section aria-labelledby="automation-heading" className="mb-8 border-y border-border/60 py-6">
    <div className="mb-5 flex items-center justify-between gap-3"><h3 id="automation-heading" className="flex items-center gap-2 text-xl font-semibold"><Activity className="h-5 w-5 text-primary" />Automation Status</h3><Button variant="ghost" size="icon" aria-label="Refresh automation status" title="Refresh automation status" disabled={status.isFetching} onClick={() => status.refetch()}><RefreshCw className={`h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} /></Button></div>
    {status.isPending ? <p className="text-sm text-muted-foreground">Checking today’s activity…</p> : status.isError ? <p role="alert" className="text-sm text-destructive">Status unavailable. Your schedules are unchanged.</p> : d && <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
      <div className="min-w-0"><h4 className="mb-2 flex items-center gap-2 font-medium"><Mail className="h-4 w-4 text-primary" />English Hourly Emails</h4>{d.english ? <><p className="text-2xl font-semibold">{d.english.sent}<span className="text-base font-normal text-muted-foreground"> / 9 sent</span></p><p className="mt-1 text-sm text-muted-foreground">{d.english.remaining} remaining today</p><p className="mt-2 break-words text-sm">Last phrase: {d.english.lastWord ?? "None today"}</p><p className="text-sm text-muted-foreground">Audio: {d.english.audio === null ? "Not recorded yet" : d.english.audio ? "Ready" : "Unavailable"}</p></> : <p className="text-sm text-muted-foreground">Not enabled for this account</p>}{testButton("english")}</div>
      <div className="min-w-0"><h4 className="mb-2 flex items-center gap-2 font-medium"><Mic className="h-4 w-4 text-primary" />Speaking Gym Gate</h4><div className="flex items-center justify-between gap-3"><label htmlFor="automation-speaking" className="text-sm">Require speaking for stock emails</label><Switch id="automation-speaking" aria-label="Require speaking for stock emails" checked={d.speaking.required} disabled={saving} onCheckedChange={toggle} /></div><p className="mt-3 text-sm font-medium">{d.speaking.gate === "inactive" ? "Inactive" : d.speaking.gate === "paused" ? "Paused" : d.speaking.gate === "warning" ? "Active · warning day" : "Active"}</p><p className="mt-1 text-sm text-muted-foreground">Today’s session: {d.speaking.completedToday ? "Completed" : "Not completed"}</p></div>
      <div className="min-w-0"><h4 className="mb-2 flex items-center gap-2 font-medium"><TrendingUp className="h-4 w-4 text-primary" />Stock & Swing Watch</h4><p className="text-sm">Last sent: {timestamp(d.stock.lastSent)}</p><p className="mt-1 text-sm text-muted-foreground">Next: {timestamp(d.stock.nextRun)}</p><p className="mt-2 text-sm">Today’s rule pick: <strong>{d.stock.topPick ?? "No pick recorded"}</strong></p>{testButton("stock")}</div>
      <div className="min-w-0"><h4 className="mb-2 flex items-center gap-2 font-medium"><Cpu className="h-4 w-4 text-primary" />ML Shadow Training</h4><p className="text-sm">Last run: {timestamp(d.ml.training?.finished_at ?? d.ml.training?.started_at)}</p><p className="text-sm text-muted-foreground">{d.ml.training?.status ?? "No run recorded"}</p><p className="mt-2 break-words text-sm">Model: {d.ml.model?.algorithm?.replace(/_/g, " ") ?? "Not registered"}</p><p className="text-xs text-muted-foreground">{d.ml.model?.status ?? "Shadow only"} · shadow-only</p><p className="mt-2 text-sm">Top model estimate: {d.ml.prediction ? `${d.ml.prediction.ticker} · ${(Number(d.ml.prediction.predicted_probability) * 100).toFixed(1)}%` : "No fresh prediction"}</p></div>
    </div>}
    {d?.lastTests?.length ? <p className="mt-5 text-xs text-muted-foreground">Latest test: {d.lastTests[0].kind} · {d.lastTests[0].status} · {timestamp(d.lastTests[0].sent_at)}</p> : null}
  </section>;
}