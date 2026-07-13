import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Row = Record<string, any>;

export default function MLTraining() {
  const [examples, setExamples] = useState<Row[] | null>(null);
  const [runs, setRuns] = useState<Row[]>([]);
  const [drift, setDrift] = useState<Row[]>([]);
  const [stats, setStats] = useState<{ total: number; live: number; historical: number; completed10: number; win: number; loss: number; flat: number; avgReturn: number; avgDD: number }>({
    total: 0, live: 0, historical: 0, completed10: 0, win: 0, loss: 0, flat: 0, avgReturn: 0, avgDD: 0,
  });

  useEffect(() => {
    (async () => {
      const { data: ex } = await supabase.from("swing_training_examples").select("id, training_source, split_bucket").limit(10000);
      const { data: out } = await supabase.from("swing_training_outcomes").select("label_10_session, return_pct_current, max_drawdown_pct").limit(10000);
      const { data: hr } = await supabase.from("historical_training_runs").select("*").order("started_at", { ascending: false }).limit(10);
      const { data: dr } = await supabase.from("ml_data_drift").select("*").order("measured_at", { ascending: false }).limit(10);
      setExamples(ex ?? []);
      setRuns(hr ?? []);
      setDrift(dr ?? []);
      const total = ex?.length ?? 0;
      const live = ex?.filter((r) => r.training_source === "live").length ?? 0;
      const historical = ex?.filter((r) => r.training_source === "historical").length ?? 0;
      const completed10 = out?.filter((r) => r.label_10_session && r.label_10_session !== "pending").length ?? 0;
      const win = out?.filter((r) => r.label_10_session === "positive").length ?? 0;
      const loss = out?.filter((r) => r.label_10_session === "negative").length ?? 0;
      const flat = out?.filter((r) => r.label_10_session === "flat").length ?? 0;
      const finished = out?.filter((r) => typeof r.return_pct_current === "number") ?? [];
      const avgReturn = finished.length ? finished.reduce((a, r) => a + r.return_pct_current, 0) / finished.length : 0;
      const avgDD = finished.length ? finished.reduce((a, r) => a + (r.max_drawdown_pct ?? 0), 0) / finished.length : 0;
      setStats({ total, live, historical, completed10, win, loss, flat, avgReturn, avgDD });
    })();
  }, []);

  const readinessPct = Math.min(100, Math.round((stats.completed10 / 1000) * 100));
  const readinessLabel = readinessPct < 20 ? "Collecting data" : readinessPct < 60 ? "Good" : readinessPct < 90 ? "Excellent" : "Ready for first ML model";

  if (examples === null) return <div className="p-8">Loading ML training data…</div>;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">ML Training Data</h1>
        <p className="text-sm text-muted-foreground">Foundation dashboard — no model trained yet. Collecting labeled examples.</p>
      </header>

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
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total examples</div><div className="text-2xl font-semibold">{stats.total.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Live</div><div className="text-2xl font-semibold">{stats.live.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Historical</div><div className="text-2xl font-semibold">{stats.historical.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Completed 10-session</div><div className="text-2xl font-semibold">{stats.completed10.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Win %</div><div className="text-2xl font-semibold">{stats.completed10 ? Math.round((stats.win / stats.completed10) * 100) : 0}%</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Loss %</div><div className="text-2xl font-semibold">{stats.completed10 ? Math.round((stats.loss / stats.completed10) * 100) : 0}%</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Avg return</div><div className="text-2xl font-semibold">{stats.avgReturn.toFixed(2)}%</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Avg max DD</div><div className="text-2xl font-semibold">{stats.avgDD.toFixed(2)}%</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Historical Runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? <div className="text-sm text-muted-foreground">No historical replay runs yet. Invoke <code>historical-swing-trainer</code> to backfill.</div> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Started</th><th>Range</th><th>Progress</th><th>Examples</th><th>Status</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id} className="border-t"><td className="py-2">{new Date(r.started_at).toLocaleString()}</td><td>{r.start_date} → {r.end_date}</td><td>{r.current_replay_date ?? "—"}</td><td>{r.examples_created}</td><td><Badge variant="outline">{r.status}</Badge></td></tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Drift Alerts (Top Features)</CardTitle></CardHeader>
        <CardContent>
          {drift.length === 0 ? <div className="text-sm text-muted-foreground">No drift measurements yet.</div> : (
            <ul className="text-sm space-y-1">{drift.map((d) => (
              <li key={d.id}>{d.feature_name}: PSI {Number(d.psi ?? 0).toFixed(3)} <Badge variant={d.drift_flag === "high" ? "destructive" : "secondary"}>{d.drift_flag ?? "ok"}</Badge></li>
            ))}</ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Not financial advice. This dashboard tracks data collection only — no model is deployed.</p>
    </div>
  );
}
