import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Row = Record<string, any>;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  candidate: "secondary",
  shadow: "outline",
  production: "default",
  archived: "outline",
  rejected: "destructive",
};

const METRIC_KEYS = [
  ["pr_auc", "PR-AUC"],
  ["roc_auc", "ROC-AUC"],
  ["precision_at_3", "P@3"],
  ["precision_at_5", "P@5"],
  ["balanced_accuracy", "Bal. acc"],
  ["brier", "Brier"],
  ["expected_return_pct", "Exp. return %"],
] as const;

function num(v: unknown, digits = 3) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

type Props = {
  /** Bumped by the parent dashboard on each shared refresh cycle. */
  refreshToken?: number;
  /** Ask the parent to refresh everything (single shared backend cycle). */
  onRefresh?: () => void;
};

export default function ModelRegistryPanel({ refreshToken = 0, onRefresh }: Props) {
  const [versions, setVersions] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [promotions, setPromotions] = useState<Row[]>([]);
  const [shadowCount, setShadowCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("ml-training-control?action=models", {
      method: "GET" as any,
    });
    if (error) return;
    setVersions(data?.versions ?? []);
    setJobs(data?.jobs ?? []);
    setPromotions(data?.promotions ?? []);
    setShadowCount(Number(data?.shadow_prediction_count ?? 0));
  }, []);

  // COST GUARD: no independent timer here. The parent dashboard owns one
  // visibility-aware 60s cycle and bumps refreshToken; this panel just follows.
  useEffect(() => {
    load();
  }, [load, refreshToken]);

  async function act(path: string, body: Row, okMsg: string) {
    setBusy(JSON.stringify(body));
    try {
      const { data, error } = await supabase.functions.invoke(`ml-training-control?action=${path}`, {
        method: "POST" as any,
        body,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: okMsg });
      load();
      onRefresh?.();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const latestJob = jobs[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Automated Training Runs</CardTitle>
          <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => (onRefresh ? onRefresh() : load())}>Refresh</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => act("trigger_training", {}, "Training workflow dispatched")}
            disabled={busy !== null}
          >
            Trigger training run
          </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No automated training jobs yet. Runs are executed by GitHub Actions and register models here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th>Started</th><th>Status</th><th>Train</th><th>Val</th><th>Test</th>
                    <th>Rows</th><th>Pos rate</th><th>Best</th><th>Run</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t align-top">
                      <td className="py-2">{j.started_at ? new Date(j.started_at).toLocaleString() : "—"}</td>
                      <td><Badge variant={j.status === "failed" ? "destructive" : "outline"}>{j.status}</Badge></td>
                      <td className="text-xs">{j.train_start ?? "—"} → {j.train_end ?? "—"}<div>{j.train_rows ?? 0} rows</div></td>
                      <td className="text-xs">{j.val_start ?? "—"} → {j.val_end ?? "—"}<div>{j.val_rows ?? 0} rows</div></td>
                      <td className="text-xs">{j.test_start ?? "—"} → {j.test_end ?? "—"}<div>{j.test_rows ?? 0} rows</div></td>
                      <td>{j.matured_rows ?? j.total_rows ?? 0}</td>
                      <td>{j.positive_rate != null ? `${(Number(j.positive_rate) * 100).toFixed(1)}%` : "—"}</td>
                      <td>{j.best_model ?? "—"}</td>
                      <td>{j.github_run_url ? <a className="underline" href={j.github_run_url} target="_blank" rel="noreferrer">open</a> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {latestJob?.error_message && (
            <div className="text-xs text-destructive break-words">Last error: {latestJob.error_message}</div>
          )}
          <p className="text-xs text-muted-foreground">
            Shadow predictions logged: {shadowCount.toLocaleString()}. Models are registered as candidates only —
            promotion is always a manual action here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Model Registry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {versions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No model versions registered yet.</div>
          ) : versions.map((v) => {
            const val = v.metrics?.val ?? {};
            const test = v.metrics?.test ?? {};
            const rule = v.baseline_comparison?.rule_engine ?? {};
            const isOpen = expanded === v.id;
            return (
              <div key={v.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <div className="font-medium">{v.algorithm}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.version} · {v.label_horizon} · {v.dataset_version ?? "—"} ·{" "}
                      {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[v.status] ?? "outline"}>{v.status}</Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {METRIC_KEYS.map(([k, label]) => (
                    <div key={k} className="rounded border p-2">
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div>val {num(val[k])}</div>
                      <div className="text-muted-foreground">test {num(test[k])}</div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground">
                  Rule-engine baseline (test): PR-AUC {num(rule.pr_auc)} · P@3 {num(rule.precision_at_3)} ·
                  {" "}Artifact: {v.artifact?.stored ? `stored (${Math.round((v.artifact.bytes ?? 0) / 1024)} KB)` : v.artifact ? `not stored — ${v.artifact.reason ?? "unknown"}` : "none"}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : v.id)}>
                    {isOpen ? "Hide details" : "Details"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={v.status !== "candidate" || busy !== null}
                    onClick={() => act("promote", { model_version_id: v.id, to_status: "shadow" }, "Moved to shadow")}
                  >
                    Promote to shadow
                  </Button>
                  <Button
                    size="sm"
                    disabled={v.status !== "shadow" || busy !== null}
                    onClick={() => {
                      if (!window.confirm("Promote this model to PRODUCTION? This is a live change.")) return;
                      act("promote", { model_version_id: v.id, to_status: "production", confirm_production: true }, "Promoted to production");
                    }}
                  >
                    Promote to production
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={v.status === "archived" || busy !== null}
                    onClick={() => act("rollback", { model_version_id: v.id }, "Rolled back / archived")}
                  >
                    Rollback
                  </Button>
                </div>

                {isOpen && (
                  <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <div className="text-xs font-medium mb-1">Top feature importance</div>
                      <ul className="text-xs space-y-0.5">
                        {(v.feature_importance?.top ?? []).slice(0, 12).map((f: Row) => (
                          <li key={f.feature} className="flex justify-between gap-2">
                            <span className="truncate">{f.feature}</span>
                            <span className="text-muted-foreground">{num(f.value, 4)}</span>
                          </li>
                        ))}
                        {!(v.feature_importance?.top ?? []).length && <li className="text-muted-foreground">Not available</li>}
                      </ul>
                    </div>
                    <div className="text-xs space-y-1">
                      <div><b>Train window:</b> {v.train_window ?? "—"}</div>
                      <div><b>Test window:</b> {v.test_window ?? "—"}</div>
                      <div><b>Features:</b> {(v.feature_order ?? []).length}</div>
                      <div className="text-muted-foreground break-words">{v.notes ?? ""}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Promotion History</CardTitle></CardHeader>
        <CardContent>
          {promotions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No lifecycle changes recorded yet.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {promotions.slice(0, 12).map((p) => (
                <li key={p.id} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
                  <span>{p.from_status ?? "new"} → <b>{p.to_status}</b></span>
                  <span className="text-muted-foreground">{p.reason ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
