import { describe, expect, it } from "vitest";
import { summarizeModelPerformance } from "../../../supabase/functions/_shared/model-performance";

const versions = [
  { id: "v1", algorithm: "balanced_random_forest", version: "brf-1", status: "candidate", metrics: { test: { roc_auc: 0.478 } } },
  { id: "v2", algorithm: "lightgbm", version: "lgbm-1", status: "candidate", metrics: { test: { roc_auc: 0.61 } } },
];

describe("summarizeModelPerformance", () => {
  it("computes win rate, average return and ROC AUC per model", () => {
    const result = summarizeModelPerformance(versions, [
      { model_version_id: "v1", actual_label: "positive", actual_return: 4 },
      { model_version_id: "v1", actual_label: "negative", actual_return: -2 },
      { model_version_id: "v1", actual_label: "flat", actual_return: 0.5 },
      { model_version_id: "v1", actual_label: null, actual_return: null },
      { model_version_id: "v2", actual_label: "positive", actual_return: 6 },
    ]);
    const v1 = result.find(r => r.modelVersionId === "v1")!;
    expect(v1.predictions).toBe(4);
    expect(v1.scored).toBe(3);
    expect(v1.pending).toBe(1);
    expect(v1.winRate).toBeCloseTo(1 / 3, 4);
    expect(v1.avgReturnPct).toBeCloseTo(0.8333, 4);
    expect(v1.testRocAuc).toBe(0.478);
    const v2 = result.find(r => r.modelVersionId === "v2")!;
    expect(v2.winRate).toBe(1);
    expect(v2.avgReturnPct).toBe(6);
    expect(v2.testRocAuc).toBe(0.61);
  });

  it("returns null rates when a model has no scored predictions yet", () => {
    const result = summarizeModelPerformance(versions, [
      { model_version_id: "v1", actual_label: null, actual_return: null },
    ]);
    const v1 = result.find(r => r.modelVersionId === "v1")!;
    expect(v1.winRate).toBeNull();
    expect(v1.avgReturnPct).toBeNull();
    expect(v1.scored).toBe(0);
    expect(v1.pending).toBe(1);
  });

  it("handles models with no predictions and missing metrics", () => {
    const result = summarizeModelPerformance(
      [{ id: "v3", algorithm: "logistic_regression", version: "lr-1", status: "candidate", metrics: null }],
      [],
    );
    expect(result[0].predictions).toBe(0);
    expect(result[0].testRocAuc).toBeNull();
    expect(result[0].winRate).toBeNull();
    expect(result[0].rank).toBe(1);
    expect(result[0].isLeader).toBe(false);
  });

  it("orders leaderboard by scored win rate then average return and marks leader", () => {
    const result = summarizeModelPerformance(versions, [
      { model_version_id: "v1", actual_label: "positive", actual_return: 4 },
      { model_version_id: "v1", actual_label: "negative", actual_return: -2 },
      { model_version_id: "v2", actual_label: "positive", actual_return: 5 },
    ]);
    expect(result[0].modelVersionId).toBe("v2");
    expect(result[0].rank).toBe(1);
    expect(result[0].isLeader).toBe(true);
    expect(result[1].modelVersionId).toBe("v1");
    expect(result[1].rank).toBe(2);
    expect(result[1].isLeader).toBe(false);
  });
});
