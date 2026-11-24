import { describe, expect, it } from "vitest";
import { evaluatePromotionGate } from "../../../supabase/functions/_shared/model-promotion-gate";

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