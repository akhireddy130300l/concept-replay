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
  return (
    <section aria-labelledby="model-performance-heading" className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground" id="model-performance-heading">
          <BarChart3 className="h-4 w-4 text-primary" />
          Model Performance
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl"
          aria-label="Refresh model performance"
          title="Refresh model performance"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {query.isPending ? (
        <div className="surface-panel p-5 text-sm text-muted-foreground">Loading model results…</div>
      ) : query.isError ? (
        <div role="alert" className="surface-panel p-5 text-sm text-destructive">Model performance unavailable. Your schedules are unchanged.</div>
      ) : !models?.length ? (
        <div className="surface-panel p-5 text-sm text-muted-foreground">No trained models registered yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {models.map(m => (
            <article key={m.modelVersionId} className="surface-panel p-4 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <h3 className="break-words text-sm font-semibold capitalize leading-snug">
                  <span className="mr-1.5 text-xs font-normal text-muted-foreground">#{m.rank}</span>
                  {m.algorithm.replace(/_/g, " ")}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                  {m.isLeader && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Leader</span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{m.status}</span>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Win rate</dt><dd className="font-semibold text-foreground">{pct(m.winRate)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Avg return (10 sessions)</dt><dd className="font-semibold text-foreground">{ret(m.avgReturnPct)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Test ROC AUC</dt><dd className="font-semibold text-foreground">{m.testRocAuc === null ? "Not recorded" : m.testRocAuc.toFixed(3)}</dd></div>
              </dl>
              <p className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground">
                {m.scored} scored · {m.pending} pending of {m.predictions} predictions
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
