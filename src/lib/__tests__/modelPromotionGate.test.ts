import { describe, expect, it } from "vitest";
import {
  evaluatePromotionGate,
  selectPromotionWinner,
  type PromotionCandidateInput,
} from "../../../supabase/functions/_shared/model-promotion-gate";

describe("evaluatePromotionGate", () => {
  it("blocks promotion when fewer than 30 predictions are scored", () => {
    const res = evaluatePromotionGate({
      scoredCount: 15,
      positiveCount: 12,
      avgReturnPct: 4.2,
      testRocAuc: 0.62,
    });
    expect(res.eligible).toBe(false);
    expect(res.reasons.some((r) => r.includes("scored_count"))).toBe(true);
  });

  it("blocks promotion when win rate is below 55%", () => {
    const res = evaluatePromotionGate({
      scoredCount: 40,
      positiveCount: 20,
      avgReturnPct: 2.1,
      testRocAuc: 0.61,
    });
    expect(res.eligible).toBe(false);
    expect(res.reasons.some((r) => r.includes("win_rate"))).toBe(true);
  });

  it("blocks promotion when average 10-session return is below +1.5%", () => {
    const res = evaluatePromotionGate({
      scoredCount: 40,
      positiveCount: 25,
      avgReturnPct: 0.8,
      testRocAuc: 0.61,
    });
    expect(res.eligible).toBe(false);
    expect(res.reasons.some((r) => r.includes("avg_return"))).toBe(true);
  });

  it("blocks promotion when held-out test ROC AUC is below 0.52", () => {
    const res = evaluatePromotionGate({
      scoredCount: 50,
      positiveCount: 35,
      avgReturnPct: 3.4,
      testRocAuc: 0.478,
    });
    expect(res.eligible).toBe(false);
    expect(res.reasons.some((r) => r.includes("test_roc_auc"))).toBe(true);
  });

  it("approves promotion when all thresholds are met", () => {
    const res = evaluatePromotionGate({
      scoredCount: 40,
      positiveCount: 26,
      avgReturnPct: 2.8,
      testRocAuc: 0.58,
    });
    expect(res.eligible).toBe(true);
    expect(res.reasons).toEqual([]);
  });
});

function makeCandidate(
  id: string,
  winRate: number,
  avgReturnPct: number,
  testRocAuc = 0.6,
  eligible = true,
): PromotionCandidateInput {
  return {
    modelVersionId: id,
    version: `${id}-v1`,
    algorithm: id,
    status: "candidate",
    evaluation: {
      eligible,
      scoredCount: 40,
      winRate,
      avgReturnPct,
      testRocAuc,
      reasons: eligible ? [] : ["blocked"],
    },
  };
}

describe("selectPromotionWinner", () => {
  it("picks the highest win rate and breaks ties by average return", () => {
    const res = selectPromotionWinner(
      [
        makeCandidate("brf", 0.60, 2.0),
        makeCandidate("lgbm", 0.64, 1.9),
        makeCandidate("lr", 0.64, 3.1),
      ],
      null,
    );
    expect(res.winner?.modelVersionId).toBe("lr");
  });

  it("requires a 2-point win-rate margin over the current live model", () => {
    const blocked = selectPromotionWinner(
      [makeCandidate("lgbm", 0.615, 3.0)],
      { modelVersionId: "live-1", winRate: 0.60, avgReturnPct: 2.2 },
    );
    expect(blocked.winner).toBeNull();
    expect(blocked.reason).toContain("challenger_margin_not_met");

    const promoted = selectPromotionWinner(
      [makeCandidate("lgbm", 0.625, 3.0)],
      { modelVersionId: "live-1", winRate: 0.60, avgReturnPct: 2.2 },
    );
    expect(promoted.winner?.modelVersionId).toBe("lgbm");
  });
});