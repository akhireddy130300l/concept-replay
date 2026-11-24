export interface PromotionThresholds {
  minScoredPredictions: number;
  minWinRate: number;
  minAvgReturnPct: number;
  minTestRocAuc: number;
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  minScoredPredictions: 30,
  minWinRate: 0.55,
  minAvgReturnPct: 1.5,
  minTestRocAuc: 0.52,
};

export interface PromotionEvaluation {
  eligible: boolean;
  scoredCount: number;
  winRate: number;
  avgReturnPct: number;
  testRocAuc: number | null;
  reasons: string[];
}

export function evaluatePromotionGate(input: {
  scoredCount: number;
  positiveCount: number;
  avgReturnPct: number;
  testRocAuc: number | null;
  thresholds?: Partial<PromotionThresholds>;
}): PromotionEvaluation {
  const t: PromotionThresholds = {
    ...DEFAULT_PROMOTION_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const scoredCount = Math.max(0, Math.floor(input.scoredCount));
  const winRate = scoredCount > 0 ? input.positiveCount / scoredCount : 0;
  const avgReturnPct = Number.isFinite(input.avgReturnPct) ? input.avgReturnPct : 0;
  const reasons: string[] = [];

  if (scoredCount < t.minScoredPredictions) {
    reasons.push(`scored_count ${scoredCount} < ${t.minScoredPredictions}`);
  }
  if (winRate < t.minWinRate) {
    reasons.push(`win_rate ${(winRate * 100).toFixed(1)}% < ${(t.minWinRate * 100).toFixed(1)}%`);
  }
  if (avgReturnPct < t.minAvgReturnPct) {
    reasons.push(`avg_return ${avgReturnPct.toFixed(2)}% < ${t.minAvgReturnPct.toFixed(2)}%`);
  }
  if (input.testRocAuc === null || !Number.isFinite(input.testRocAuc) || input.testRocAuc < t.minTestRocAuc) {
    const aucText = input.testRocAuc === null ? "null" : input.testRocAuc.toFixed(3);
    reasons.push(`test_roc_auc ${aucText} < ${t.minTestRocAuc.toFixed(2)}`);
  }

  return {
    eligible: reasons.length === 0,
    scoredCount,
    winRate: Math.round(winRate * 10000) / 10000,
    avgReturnPct: Math.round(avgReturnPct * 10000) / 10000,
    testRocAuc: input.testRocAuc,
    reasons,
  };
}