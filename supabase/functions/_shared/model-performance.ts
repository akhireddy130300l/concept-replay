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
  rank: number;
  isLeader: boolean;
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
  const items = versions.map((version) => {
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
      rank: 0,
      isLeader: false,
      testRocAuc: readTestRocAuc(version.metrics),
      predictions: rows.length,
      scored: scored.length,
      pending: rows.length - scored.length,
      winRate: scored.length > 0 ? round4(wins / scored.length) : null,
      avgReturnPct: returns.length > 0 ? round4(returns.reduce((a, b) => a + b, 0) / returns.length) : null,
    };
  });

  items.sort((a, b) => {
    const aScored = a.scored > 0 ? 1 : 0;
    const bScored = b.scored > 0 ? 1 : 0;
    if (bScored !== aScored) return bScored - aScored;
    const aWin = a.winRate ?? -Infinity;
    const bWin = b.winRate ?? -Infinity;
    if (bWin !== aWin) return bWin - aWin;
    const aRet = a.avgReturnPct ?? -Infinity;
    const bRet = b.avgReturnPct ?? -Infinity;
    if (bRet !== aRet) return bRet - aRet;
    const aAuc = a.testRocAuc ?? -Infinity;
    const bAuc = b.testRocAuc ?? -Infinity;
    if (bAuc !== aAuc) return bAuc - aAuc;
    return a.algorithm.localeCompare(b.algorithm);
  });

  return items.map((item, idx) => ({
    ...item,
    rank: idx + 1,
    isLeader: idx === 0 && (item.scored > 0 || item.testRocAuc !== null),
  }));
}
