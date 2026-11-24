import { describe, expect, it } from "vitest";
import { computeHorizonOutcome } from "../../../supabase/functions/_shared/prediction-outcomes";

function makeSeries(startDate: string, closes: number[], highs?: number[], lows?: number[]) {
  const startMs = Date.parse(`${startDate}T20:00:00Z`);
  const timestamps = closes.map((_, i) => Math.floor((startMs + i * 86400 * 1000) / 1000));
  return {
    timestamps,
    closes,
    highs: highs ?? closes,
    lows: lows ?? closes,
  };
}

describe("computeHorizonOutcome", () => {
  it("stays pending when fewer than 10 trading sessions have elapsed", () => {
    const series = makeSeries("2026-11-15", [100, 101, 102, 103, 104, 105]);
    const res = computeHorizonOutcome({
      predictionDate: "2026-11-15",
      horizonSessions: 10,
      ...series,
    });
    expect(res.matured).toBe(false);
    if (res.matured === false) {
      expect(res.reason).toBe("pending_horizon");
      expect(res.sessionsElapsed).toBe(5);
    }
  });

  it("labels a 10-session gain above 2% as positive", () => {
    const closes = [100, 100, 101, 101, 102, 102, 103, 103, 104, 104, 105];
    const series = makeSeries("2026-07-02", closes);
    const res = computeHorizonOutcome({
      predictionDate: "2026-07-02",
      horizonSessions: 10,
      ...series,
    });
    expect(res.matured).toBe(true);
    if (res.matured) {
      expect(res.actualReturnPct).toBe(5);
      expect(res.actualLabel).toBe("positive");
    }
  });

  it("labels a 10-session drop below -2% as negative", () => {
    const closes = [100, 99, 99, 98, 98, 97, 97, 96, 96, 95, 94];
    const series = makeSeries("2026-07-02", closes);
    const res = computeHorizonOutcome({
      predictionDate: "2026-07-02",
      horizonSessions: 10,
      ...series,
    });
    expect(res.matured).toBe(true);
    if (res.matured) {
      expect(res.actualReturnPct).toBe(-6);
      expect(res.actualLabel).toBe("negative");
    }
  });

  it("labels a small move within +/-2% and no +/-3% excursion as flat", () => {
    const closes = [100, 100.5, 101, 100.2, 99.8, 100.4, 100.9, 101.1, 100.7, 100.8, 101];
    const series = makeSeries("2026-07-02", closes);
    const res = computeHorizonOutcome({
      predictionDate: "2026-07-02",
      horizonSessions: 10,
      ...series,
    });
    expect(res.matured).toBe(true);
    if (res.matured) {
      expect(res.actualReturnPct).toBe(1);
      expect(res.actualLabel).toBe("flat");
    }
  });
});