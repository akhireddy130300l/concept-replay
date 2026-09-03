import { describe, it, expect } from "vitest";
import {
  COST_LIMITS,
  chunkUniverse,
  rankFullDay,
  canStartRun,
  clampReplayRequest,
  capDays,
  nextDayIndex,
  isHalted,
  pollIntervalFor,
} from "@/lib/cloudCostGuard";

const universe500 = Array.from({ length: 500 }, (_, i) => `T${String(i).padStart(3, "0")}`);

describe("chunkUniverse", () => {
  it("keeps every ticker of a 500-stock universe across chunks", () => {
    const chunks = chunkUniverse(universe500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(250);
    expect(chunks[1]).toHaveLength(250);
    expect(chunks.flat().sort()).toEqual([...universe500].sort());
  });

  it("never drops tickers after the first 250 alphabetically", () => {
    const chunks = chunkUniverse(universe500);
    expect(chunks.flat()).toContain("T499");
  });

  it("deduplicates and handles small/empty universes", () => {
    expect(chunkUniverse([])).toEqual([]);
    expect(chunkUniverse(["B", "A", "A"])).toEqual([["A", "B"]]);
  });
});

describe("rankFullDay", () => {
  it("ranks the Top 60 from ALL 500 stocks, not only the first chunk", () => {
    // Highest scores deliberately live at the alphabetical end of the universe.
    const rows = universe500.map((ticker, i) => ({ ticker, score: i }));
    const top = rankFullDay(rows, 60, (r) => r.score, (r) => r.ticker);
    expect(top).toHaveLength(60);
    expect(top[0].ticker).toBe("T499");
    expect(top.every((r) => r.score >= 440)).toBe(true);
    // A truncating implementation would have returned only T000..T249.
    expect(top.some((r) => Number(r.ticker.slice(1)) >= 250)).toBe(true);
  });

  it("breaks ties deterministically by ticker", () => {
    const rows = [{ ticker: "ZZZ", score: 1 }, { ticker: "AAA", score: 1 }];
    expect(rankFullDay(rows, 2, (r) => r.score, (r) => r.ticker).map((r) => r.ticker)).toEqual(["AAA", "ZZZ"]);
  });
});

describe("existing guards still hold", () => {
  it("prevents concurrent replay runs", () => {
    expect(canStartRun(1).ok).toBe(false);
    expect(canStartRun(0).ok).toBe(true);
  });

  it("clamps oversized requests", () => {
    const { config, warnings } = clampReplayRequest({ start_date: "2025-05-01", end_date: "2026-01-01", top_n: 500, batch_size: 20 });
    expect(config.top_n).toBe(COST_LIMITS.maxTopN);
    expect(config.batch_size).toBe(COST_LIMITS.maxDaysPerInvocation);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("caps days and resumes from the last completed day", () => {
    const days = Array.from({ length: 100 }, (_, i) => `2025-01-${String((i % 28) + 1).padStart(2, "0")}`);
    expect(capDays(days, COST_LIMITS.maxTradingDaysPerRun).days).toHaveLength(COST_LIMITS.maxTradingDaysPerRun);
    expect(nextDayIndex(["2025-01-01", "2025-01-02", "2025-01-03"], "2025-01-02")).toBe(2);
  });

  it("halts on paused/terminal statuses and suppresses hidden polling", () => {
    expect(isHalted("paused")).toBe(true);
    expect(isHalted("running")).toBe(false);
    expect(pollIntervalFor(false)).toBeNull();
    expect(pollIntervalFor(true, 5000)).toBe(COST_LIMITS.minPollIntervalMs);
  });
});
