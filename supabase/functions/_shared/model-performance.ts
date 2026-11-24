export interface ModelVersionRow {
  id: string;
  algorithm: string | null;
  version: string;
  status: string;
  metrics: unknown;
}

export interface PredictionOutcomeRow {
  model_version_id: string | null;
  actual_label: string | null;
  actual_return: number | null;
}

export interface ModelPerformanceSummary {
  modelVersionId: string;
  algorithm: string;
  version: string;
  status: string;
  testRocAuc: number | null;
  predictions: number;
  scored: number;
  pending: number;
  winRate: number | null;
  avgReturnPct: number | null;
}

function readTestRocAuc(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== "object") return null;
  const test = (metrics as Record<string, unknown>).test;
  if (!test || typeof test !== "object") return null;
  const auc = (test as Record<string, unknown>).roc_auc;
  return typeof auc === "number" && Number.isFinite(auc) ? auc : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function summarizeModelPerformance(
  versions: ModelVersionRow[],
  predictions: PredictionOutcomeRow[],
): ModelPerformanceSummary[] {
  return versions.map((version) => {
    const rows = predictions.filter((p) => p.model_version_id === version.id);
    const scored = rows.filter((p) => p.actual_label !== null);
    const wins = scored.filter((p) => p.actual_label === "positive").length;
    const returns = scored
      .map((p) => p.actual_return)
      .filter((r): r is number => typeof r === "number" && Number.isFinite(r));
    return {
      modelVersionId: version.id,
      algorithm: version.algorithm ?? "unknown",
      version: version.version,
      status: version.status,
      testRocAuc: readTestRocAuc(version.metrics),
      predictions: rows.length,
      scored: scored.length,
      pending: rows.length - scored.length,
      winRate: scored.length > 0 ? round4(wins / scored.length) : null,
      avgReturnPct: returns.length > 0 ? round4(returns.reduce((a, b) => a + b, 0) / returns.length) : null,
    };
  });
}
