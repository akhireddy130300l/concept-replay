import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import ModelRegistryPanel from "@/components/ml/ModelRegistryPanel";

type Row = Record<string, any>;

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MLTraining() {
  const [examples, setExamples] = useState<Row[] | null>(null);
  const [runs, setRuns] = useState<Row[]>([]);
  const [dayLogs, setDayLogs] = useState<Row[]>([]);
  const [drift, setDrift] = useState<Row[]>([]);
  const [stats, setStats] = useState({ total: 0, live: 0, historical: 0, completed10: 0, win: 0, loss: 0, flat: 0, avgReturn: 0, avgDD: 0, historicalDays: 0 });

  const [startDate, setStartDate] = useState("2025-05-01");
  const [endDate, setEndDate] = useState(todayISO());
  const [batchSize, setBatchSize] = useState(1);
  const [topN, setTopN] = useState(60);
  const [starting, setStarting] = useState(false);

  async function loadAll() {
    const [{ data: dr }] = await Promise.all([
      supabase.from("ml_data_drift").select("*").order("measured_at", { ascending: false }).limit(10),
    ]);
    setExamples([]);
    setDrift(dr ?? []);
  }

  async function loadRuns() {
    const { data } = await supabase.functions.invoke("ml-training-control?action=status", { method: "GET" as any });
    if (data?.runs) setRuns(data.runs);
    if (data?.recent_day_logs) setDayLogs(data.recent_day_logs);
    const s = data?.committed_summary;
    if (s) {
      setStats({
        total: Number(s.total_examples ?? 0),
        live: Number(s.live_examples ?? 0),
        historical: Number(s.historical_examples ?? 0),
        completed10: Number(s.completed_10_session ?? 0),
        win: Number(s.win_count ?? 0),
        loss: Number(s.loss_count ?? 0),
        flat: Number(s.flat_count ?? 0),
        avgReturn: Number(s.avg_return_pct ?? 0),
        avgDD: Number(s.avg_max_drawdown_pct ?? 0),
        historicalDays: Number(s.historical_days_saved ?? 0),
      });
    }
  }

  useEffect(() => {
    loadAll();
    loadRuns();
    const t = setInterval(() => { loadRuns(); loadAll(); }, 5000);
    return () => clearInterval(t);
  }, []);

  async function startReplay() {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-training-control?action=start", {
        method: "POST" as any,
        body: { start_date: startDate, end_date: endDate, batch_size: batchSize, top_n: topN, resume: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Historical replay started", description: `${startDate} → ${endDate}` });
      loadRuns();
    } catch (e: any) {
      toast({ title: "Failed to start replay", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function cancelRun(runId: string) {
    await supabase.functions.invoke("ml-training-control?action=cancel", { method: "POST" as any, body: { run_id: runId } });
    loadRuns();
  }

  const readinessPct = Math.min(100, Math.round((stats.completed10 / 1000) * 100));
  const readinessLabel = readinessPct < 20 ? "Collecting data" : readinessPct < 60 ? "Good" : readinessPct < 90 ? "Excellent" : "Ready for first ML model";
  const activeRun = runs.find((r) => r.status === "running");

  if (examples === null) return <div className="p-8">Loading ML training data…</div>;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold">ML Training Data</h1>
        <p className="text-sm text-muted-foreground">Foundation dashboard — collecting labeled examples. No model deployed yet.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Historical Replay</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            <div><Label>Universe</Label><Input value="Russell 1000" disabled /></div>
            <div><Label>Batch Size (days)</Label><Input type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} /></div>
            <div><Label>Top N / day</Label><Input type="number" value={topN} onChange={(e) => setTopN(Number(e.target.value))} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={startReplay} disabled={starting || !!activeRun}>
              {activeRun ? "Run in progress…" : starting ? "Starting…" : "Start Historical Replay"}
            </Button>
            {activeRun && <Button variant="destructive" onClick={() => cancelRun(activeRun.id)}>Cancel</Button>}
          </div>
          {activeRun && (
            <div className="text-sm border rounded p-3 bg-muted/30 space-y-1">
              <div><b>Current day:</b> {activeRun.current_replay_date ?? "—"}</div>
              <div><b>Examples created:</b> {activeRun.examples_created ?? 0}</div>
              <div><b>Outcomes created:</b> {activeRun.outcomes_created ?? 0}</div>
              <div><b>Committed days:</b> {activeRun.days_committed ?? activeRun.processed_trading_days ?? 0} / {activeRun.total_trading_days ?? "—"}</div>
              <div><b>Tickers processed:</b> {activeRun.tickers_processed ?? 0}</div>
              <div><b>Heartbeat:</b> {activeRun.heartbeat_at ? new Date(activeRun.heartbeat_at).toLocaleString() : "—"}</div>
              <div className="text-xs text-muted-foreground">Started {new Date(activeRun.started_at).toLocaleString()}</div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Live daily collection also runs automatically with each stock email — no action needed.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Training Readiness</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>{stats.completed10.toLocaleString()} / 1,000 completed 10-session outcomes</span>
            <Badge variant={readinessPct >= 100 ? "default" : "secondary"}>{readinessLabel}</Badge>
          </div>
          <Progress value={readinessPct} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["Total examples", stats.total.toLocaleString()],
          ["Live", stats.live.toLocaleString()],
          ["Historical", stats.historical.toLocaleString()],
          ["Historical days", stats.historicalDays.toLocaleString()],
          ["Completed 10-session", stats.completed10.toLocaleString()],
          ["Win %", `${stats.completed10 ? Math.round((stats.win / stats.completed10) * 100) : 0}%`],
          ["Loss %", `${stats.completed10 ? Math.round((stats.loss / stats.completed10) * 100) : 0}%`],
          ["Avg return", `${stats.avgReturn.toFixed(2)}%`],
          ["Avg max DD", `${stats.avgDD.toFixed(2)}%`],
        ].map(([label, value]) => (
          <Card key={label as string}><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Historical Runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No historical replay runs yet. Use the form above to start one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Started</th><th>Range</th><th>Current</th><th>Committed</th><th>Examples</th><th>Outcomes</th><th>Heartbeat</th><th>Status</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.start_date} → {r.end_date}</td>
                  <td>{r.current_replay_date ?? "—"}</td>
                  <td>{r.days_committed ?? r.processed_trading_days ?? 0} / {r.total_trading_days ?? "—"}</td>
                  <td>{r.examples_created ?? 0}</td>
                  <td>{r.outcomes_created ?? 0}</td>
                  <td>{r.heartbeat_at ? new Date(r.heartbeat_at).toLocaleTimeString() : "—"}</td>
                  <td><Badge variant="outline">{r.status}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Replay Day Commits</CardTitle></CardHeader>
        <CardContent>
          {dayLogs.length === 0 ? <div className="text-sm text-muted-foreground">No day commits recorded yet.</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Status</th><th>Examples</th><th>Outcomes</th><th>Scored</th><th>Duration</th><th>Error</th></tr></thead>
              <tbody>{dayLogs.slice(0, 8).map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="py-2">{d.replay_date}</td>
                  <td><Badge variant="outline">{d.status}</Badge></td>
                  <td>{d.examples_created ?? 0}</td>
                  <td>{d.outcomes_created ?? 0}</td>
                  <td>{d.scored_count ?? 0}</td>
                  <td>{d.duration_ms ? `${Math.round(d.duration_ms / 1000)}s` : "—"}</td>
                  <td className="max-w-[240px] truncate">{d.error_message ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ModelRegistryPanel />

      <Card>
        <CardHeader><CardTitle>Drift Alerts</CardTitle></CardHeader>
        <CardContent>
          {drift.length === 0 ? <div className="text-sm text-muted-foreground">No drift measurements yet.</div> : (
            <ul className="text-sm space-y-1">{drift.map((d) => (
              <li key={d.id}>{d.feature_name}: PSI {Number(d.psi ?? 0).toFixed(3)} <Badge variant={d.drift_flag === "high" ? "destructive" : "secondary"}>{d.drift_flag ?? "ok"}</Badge></li>
            ))}</ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Not financial advice. This dashboard tracks data collection only.</p>
    </div>
  );
}
