import { useQuery } from "@tanstack/react-query";
import { BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface ModelSummary {
  modelVersionId: string;
  algorithm: string;
  version: string;
  status: string;
  rank: number;
  isLeader: boolean;
  testRocAuc: number | null;
  predictions: number;
  scored: number;
  pending: number;
  winRate: number | null;
  avgReturnPct: number | null;
}

const pct = (value: number | null, digits = 1) => value === null ? "Not scored yet" : `${(value * 100).toFixed(digits)}%`;
const ret = (value: number | null) => value === null ? "Not scored yet" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export function ModelPerformanceCard() {
  const query = useQuery({
    queryKey: ["model-performance"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("automation-control", { body: { action: "model-performance" } });
      if (error || data?.error) throw new Error(data?.error ?? "Model performance is unavailable");
      return (data.models ?? []) as ModelSummary[];
    },
    refetchInterval: 300000,
  });
  const models = query.data;
  return <section aria-labelledby="model-performance-heading" className="mb-8 border-b border-border/60 pb-6">
    <div className="mb-5 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-xl font-semibold" id="model-performance-heading"><BarChart3 className="h-5 w-5 text-primary" />Model Performance</h3><Button variant="ghost" size="icon" aria-label="Refresh model performance" title="Refresh model performance" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button></div>
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading model results…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">Model performance unavailable. Your schedules are unchanged.</p> : !models?.length ? <p className="text-sm text-muted-foreground">No trained models registered yet.</p> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {models.map(m => <article key={m.modelVersionId} className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <h4 className="break-words font-medium capitalize"><span className="mr-1.5 text-xs text-muted-foreground">#{m.rank}</span>{m.algorithm.replace(/_/g, " ")}</h4>
          <div className="flex shrink-0 items-center gap-1.5">
            {m.isLeader && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Leader</span>}
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">{m.status}</span>
          </div>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Win rate</dt><dd className="font-medium">{pct(m.winRate)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Avg return (10 sessions)</dt><dd className="font-medium">{ret(m.avgReturnPct)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Test ROC AUC</dt><dd className="font-medium">{m.testRocAuc === null ? "Not recorded" : m.testRocAuc.toFixed(3)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{m.scored} scored · {m.pending} pending of {m.predictions} shadow predictions</p>
      </article>)}
    </div>}
  </section>;
}
