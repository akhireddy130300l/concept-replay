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

export const DEFAULT_CHALLENGER_WIN_RATE_MARGIN = 0.02;

export interface PromotionCandidateInput {
  modelVersionId: string;
  version: string;
  algorithm: string | null;
  status: string;
  evaluation: PromotionEvaluation;
}

export interface LiveModelBenchmark {
  modelVersionId: string;
  winRate: number;
  avgReturnPct: number;
}

export interface PromotionSelectionResult {
  winner: PromotionCandidateInput | null;
  reason: string;
}

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

export function selectPromotionWinner(
  candidates: PromotionCandidateInput[],
  currentLive: LiveModelBenchmark | null,
  minChallengerMargin = DEFAULT_CHALLENGER_WIN_RATE_MARGIN,
): PromotionSelectionResult {
  const eligible = candidates
    .filter((c) => c.evaluation.eligible)
    .sort((a, b) => {
      if (b.evaluation.winRate !== a.evaluation.winRate) {
        return b.evaluation.winRate - a.evaluation.winRate;
      }
      if (b.evaluation.avgReturnPct !== a.evaluation.avgReturnPct) {
        return b.evaluation.avgReturnPct - a.evaluation.avgReturnPct;
      }
      const aucA = a.evaluation.testRocAuc ?? -Infinity;
      const aucB = b.evaluation.testRocAuc ?? -Infinity;
      if (aucB !== aucA) return aucB - aucA;
      return a.modelVersionId.localeCompare(b.modelVersionId);
    });

  const top = eligible[0];
  if (!top) {
    return { winner: null, reason: "thresholds_not_met" };
  }

  if (currentLive) {
    const requiredWinRate = currentLive.winRate + minChallengerMargin;
    if (top.evaluation.winRate < requiredWinRate - 1e-9) {
      return {
        winner: null,
        reason: `challenger_margin_not_met (${(top.evaluation.winRate * 100).toFixed(1)}% < ${(requiredWinRate * 100).toFixed(1)}%)`,
      };
    }
  }

  return { winner: top, reason: "eligible_winner" };
}