import { describe, it, expect } from "vitest";
import { buildModelViewHTML, type ModelViewData } from "../../../supabase/functions/_shared/swing-model-view";

describe("buildModelViewHTML", () => {
  it("returns empty string when no model data or no picks exist", () => {
    expect(buildModelViewHTML(null, "https://example.com")).toBe("");
    expect(
      buildModelViewHTML(
        {
          modelVersion: "brf-1",
          algorithm: "balanced_random_forest",
          status: "candidate",
          labelHorizon: "10_session",
          predictionDate: "2026-11-24",
          picks: [],
        },
        "https://example.com"
      )
    ).toBe("");
  });

  it("renders top picks, probabilities, and read-only shadow notice", () => {
    const data: ModelViewData = {
      modelVersion: "balanced_random_forest-20261124T170155Z",
      algorithm: "balanced_random_forest",
      status: "candidate",
      labelHorizon: "10_session",
      predictionDate: "2026-11-24",
      testPrecisionAt3: 0.5556,
      testWinRate: 0.4444,
      picks: [
        { ticker: "INSM", probability: 0.7724, label: "positive" },
        { ticker: "BILL", probability: 0.7506, label: "positive" },
      ],
      ruleSelectedTicker: "TGT",
      ruleSelectedProbability: 0.612,
    };
    const html = buildModelViewHTML(data, "https://app.example.com");
    expect(html).toContain("Model View");
    expect(html).toContain("INSM");
    expect(html).toContain("77.2%");
    expect(html).toContain("BILL");
    expect(html).toContain("75.1%");
    expect(html).toContain("TGT");
    expect(html).toContain("61.2%");
    expect(html).toContain("Shadow mode only");
  });
});