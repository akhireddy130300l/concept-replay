import { describe, it, expect } from "vitest";
import { COST_LIMITS, rankFullDay, nextDayIndex } from "../../../supabase/functions/_shared/cost-guard.ts";
import { planDayStep, shouldContinue, nextStepTarget } from "../../../supabase/functions/_shared/replay-scheduler.ts";

/**
 * Simulated historical replay: one loop iteration == one Edge Function
 * invocation. It uses the SAME decision helpers the real
 * historical-swing-trainer function uses (planDayStep / shouldContinue /
 * nextStepTarget), plus an in-memory stand-in for
 * historical_replay_chunk_scores with the same (run_id, replay_date, ticker)
 * uniqueness the migration enforces.
 */

type Invocation = { day: string; action: "scan" | "finalize"; chunkIndex: number | null; tickers: number; failed?: boolean };

type SimOptions = {
  universe: string[];
  days: string[];
  topN?: number;
  maxInvocations?: number;
  /** Return true to make this scan attempt fail. */
  failScan?: (day: string, chunkIndex: number, attempt: number) => boolean;
  /** Called before each invocation; may mutate run status (pause/cancel). */
  beforeInvocation?: (state: SimState, invocationNumber: number) => void;
  /** Inject a duplicate replay of the previous invocation (self-reinvoke race). */
  duplicateEveryInvocation?: boolean;
};

type SimState = {
  status: string;
  currentReplayDate: string | null;
  chunksCompleted: Record<string, number>;
  consecutiveErrors: number;
};

type SimResult = {
  state: SimState;
  invocations: Invocation[];
  scanInvocations: Invocation[];
  finalized: Record<string, string[]>;
  finalizedOrder: string[];
  scoreWrites: Record<string, number>; // ticker -> number of successful writes for the whole sim
  rowsAtFinalize: Record<string, number>;
  suppressed: string[];
};

const scoreOf = (ticker: string) => 1000 - Number(ticker.slice(1)); // T000 is the best

function runSim(opts: SimOptions): SimResult {
  const topN = opts.topN ?? COST_LIMITS.maxTopN;
  const maxInvocations = opts.maxInvocations ?? 200;
  const state: SimState = { status: "running", currentReplayDate: null, chunksCompleted: {}, consecutiveErrors: 0 };
  const invocations: Invocation[] = [];
  const finalized: Record<string, string[]> = {};
  const finalizedOrder: string[] = [];
  const rowsAtFinalize: Record<string, number> = {};
  const scoreWrites: Record<string, number> = {};
  const suppressed: string[] = [];
  const scores: Record<string, Map<string, number>> = {}; // day -> ticker -> score (unique key)
  const attempts: Record<string, number> = {};

  let n = 0;
  const step = () => {
    n += 1;
    opts.beforeInvocation?.(state, n);

    // Guard at the start of the invocation: paused/cancelled runs do no work.
    const entry = shouldContinue({ status: state.status, consecutiveErrors: state.consecutiveErrors });
    if (!entry.ok) {
      suppressed.push(entry.reason!);
      return false;
    }

    const startIdx = nextDayIndex(opts.days, state.currentReplayDate);
    if (startIdx >= opts.days.length) {
      state.status = "completed";
      return false;
    }
    const day = opts.days[startIdx];
    const plan = planDayStep(opts.universe, state.chunksCompleted[day] ?? 0);

    if (plan.action === "scan") {
      const key = `${day}#${plan.chunkIndex}`;
      attempts[key] = (attempts[key] ?? 0) + 1;
      const fails = opts.failScan?.(day, plan.chunkIndex, attempts[key]) ?? false;
      invocations.push({ day, action: "scan", chunkIndex: plan.chunkIndex, tickers: plan.tickers.length, failed: fails });
      if (fails) {
        state.consecutiveErrors += 1;
        // The chunk is NOT marked complete on failure.
        if (state.consecutiveErrors >= COST_LIMITS.maxConsecutiveErrors) {
          state.status = "failed";
          return false;
        }
      } else {
        scores[day] ??= new Map();
        for (const t of plan.tickers) {
          if (!scores[day].has(t)) scoreWrites[t] = (scoreWrites[t] ?? 0) + 1;
          scores[day].set(t, scoreOf(t)); // upsert on (run, day, ticker)
        }
        state.chunksCompleted[day] = plan.chunkIndex + 1;
        state.consecutiveErrors = 0;
      }
    } else {
      invocations.push({ day, action: "finalize", chunkIndex: null, tickers: 0 });
      const all = [...(scores[day] ?? new Map()).entries()].map(([ticker, score]) => ({ ticker, score }));
      rowsAtFinalize[day] = all.length;
      finalized[day] = rankFullDay(all, topN, (r) => r.score, (r) => r.ticker).map((r) => r.ticker);
      finalizedOrder.push(day);
      delete scores[day];
      state.currentReplayDate = day; // day cursor advances ONLY after finalization
      state.consecutiveErrors = 0;
    }

    const target = nextStepTarget(opts.days, startIdx, plan.action === "finalize");
    if (target.finished) {
      state.status = "completed";
      return false;
    }
    const gate = shouldContinue({ status: state.status, consecutiveErrors: state.consecutiveErrors });
    if (!gate.ok) {
      suppressed.push(gate.reason!);
      return false;
    }
    return true;
  };

  while (n < maxInvocations) {
    const cont = step();
    if (opts.duplicateEveryInvocation && cont) {
      // A duplicated self-reinvocation replays the loop against committed state.
      if (!step()) break;
    }
    if (!cont) break;
  }
  return {
    state,
    invocations,
    scanInvocations: invocations.filter((i) => i.action === "scan"),
    finalized,
    finalizedOrder,
    scoreWrites,
    rowsAtFinalize,
    suppressed,
  };
}

const universeOf = (n: number) => Array.from({ length: n }, (_, i) => `T${String(i).padStart(4, "0")}`);
const ONE_DAY = ["2025-06-02"];

describe("chunk-level invocation contract", () => {
  it.each([
    [500, 2],
    [750, 3],
    [1000, 4],
  ])("%i stocks -> exactly %i ticker-processing invocations, then finalization", (size, expectedChunks) => {
    const universe = universeOf(size);
    const r = runSim({ universe, days: ONE_DAY });
    expect(r.scanInvocations).toHaveLength(expectedChunks);
    expect(r.invocations).toHaveLength(expectedChunks + 1);
    expect(r.invocations[r.invocations.length - 1].action).toBe("finalize");
    expect(r.invocations.slice(0, expectedChunks).every((i) => i.action === "scan")).toBe(true);
  });

  it("never processes more than 250 tickers in one ticker-processing invocation", () => {
    for (const size of [500, 750, 1000, 1003]) {
      const r = runSim({ universe: universeOf(size), days: ONE_DAY });
      const max = Math.max(...r.scanInvocations.map((i) => i.tickers));
      expect(max).toBeLessThanOrEqual(COST_LIMITS.maxTickersPerInvocation);
      expect(max).toBe(250);
    }
  });

  it("processes every ticker of the universe exactly once", () => {
    const universe = universeOf(1000);
    const r = runSim({ universe, days: ONE_DAY });
    expect(Object.keys(r.scoreWrites).sort()).toEqual([...universe].sort());
    expect(Object.values(r.scoreWrites).every((c) => c === 1)).toBe(true);
    expect(r.scanInvocations.reduce((a, i) => a + i.tickers, 0)).toBe(1000);
  });

  it("finalizes only after every chunk of the day completed", () => {
    const universe = universeOf(1000);
    let chunksAtFinalize = -1;
    const r = runSim({
      universe,
      days: ONE_DAY,
      beforeInvocation: (state) => {
        if (chunksAtFinalize < 0 && (state.chunksCompleted[ONE_DAY[0]] ?? 0) === 4) {
          chunksAtFinalize = state.chunksCompleted[ONE_DAY[0]];
        }
      },
    });
    expect(chunksAtFinalize).toBe(4);
    expect(r.rowsAtFinalize[ONE_DAY[0]]).toBe(1000);
    expect(r.finalizedOrder).toEqual(ONE_DAY);
  });

  it("ranks the Top 60 from the complete universe, not the last chunk", () => {
    const universe = universeOf(1000);
    const r = runSim({ universe, days: ONE_DAY });
    const top = r.finalized[ONE_DAY[0]];
    const expected = [...universe].sort((a, b) => scoreOf(b) - scoreOf(a) || a.localeCompare(b)).slice(0, 60);
    expect(top).toHaveLength(60);
    expect(top).toEqual(expected);
    // The best-scoring names live in the FIRST chunk — a last-chunk-only
    // implementation would have returned T0940..T0999.
    expect(top[0]).toBe("T0000");
  });

  it("a duplicated self-reinvocation cannot reprocess a completed chunk", () => {
    const universe = universeOf(1000);
    const r = runSim({ universe, days: ONE_DAY, duplicateEveryInvocation: true });
    const seen = r.scanInvocations.map((i) => i.chunkIndex);
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(Object.values(r.scoreWrites).every((c) => c === 1)).toBe(true);
    // planDayStep is idempotent for an already-committed chunk count.
    expect(planDayStep(universe, 2).chunkIndex).toBe(2);
    expect(planDayStep(universe, 4).action).toBe("finalize");
  });
});

describe("failure, resume and halt behaviour", () => {
  it("a failed chunk is not marked complete and resume restarts that chunk", () => {
    const universe = universeOf(1000);
    const r = runSim({
      universe,
      days: ONE_DAY,
      failScan: (_d, idx, attempt) => idx === 2 && attempt === 1,
    });
    const chunk2 = r.scanInvocations.filter((i) => i.chunkIndex === 2);
    expect(chunk2).toHaveLength(2);
    expect(chunk2[0].failed).toBe(true);
    expect(chunk2[1].failed).toBe(false);
    expect(r.scanInvocations.map((i) => i.chunkIndex)).toEqual([0, 1, 2, 2, 3]);
    expect(r.rowsAtFinalize[ONE_DAY[0]]).toBe(1000);
    expect(Object.values(r.scoreWrites).every((c) => c === 1)).toBe(true);
  });

  it("resume starts from the first unfinished chunk", () => {
    const universe = universeOf(1000);
    expect(planDayStep(universe, 0).chunkIndex).toBe(0);
    expect(planDayStep(universe, 1).chunkIndex).toBe(1);
    expect(planDayStep(universe, 3).chunkIndex).toBe(3);
    // Interrupted mid-day: the day cursor never advanced, so the next
    // invocation re-enters the same day at chunk 2.
    const r = runSim({
      universe,
      days: ONE_DAY,
      beforeInvocation: (state, n) => {
        if (n === 3) state.status = "paused"; // interrupt after 2 chunks
      },
    });
    expect(r.state.chunksCompleted[ONE_DAY[0]]).toBe(2);
    expect(r.state.currentReplayDate).toBeNull();
    const resumed = planDayStep(universe, r.state.chunksCompleted[ONE_DAY[0]]);
    expect(resumed.action).toBe("scan");
    expect(resumed.chunkIndex).toBe(2);
  });

  it("pause prevents another chunk from starting", () => {
    const r = runSim({ universe: universeOf(1000), days: ONE_DAY, beforeInvocation: (s, n) => { if (n === 2) s.status = "paused"; } });
    expect(r.scanInvocations).toHaveLength(1);
    expect(r.suppressed).toContain("run_paused");
    expect(shouldContinue({ status: "paused", consecutiveErrors: 0 }).ok).toBe(false);
  });

  it("cancel prevents another chunk from starting", () => {
    const r = runSim({ universe: universeOf(1000), days: ONE_DAY, beforeInvocation: (s, n) => { if (n === 3) s.status = "cancelled"; } });
    expect(r.scanInvocations).toHaveLength(2);
    expect(r.suppressed).toContain("run_cancelled");
    expect(shouldContinue({ status: "cancelled", consecutiveErrors: 0 }).ok).toBe(false);
  });

  it("three consecutive failures halt the replay", () => {
    const r = runSim({ universe: universeOf(1000), days: ONE_DAY, failScan: () => true });
    expect(r.scanInvocations).toHaveLength(COST_LIMITS.maxConsecutiveErrors);
    expect(r.state.status).toBe("failed");
    expect(r.finalizedOrder).toEqual([]);
    expect(shouldContinue({ status: "running", consecutiveErrors: 3 })).toEqual({ ok: false, reason: "consecutive_error_threshold" });
  });

  it("the day cursor advances only after finalization succeeds", () => {
    const days = ["2025-06-02", "2025-06-03"];
    const universe = universeOf(500);
    const seen: (string | null)[] = [];
    const r = runSim({ universe, days, beforeInvocation: (s) => seen.push(s.currentReplayDate) });
    // day 1: scan, scan, finalize -> cursor moves; day 2: same.
    expect(seen).toEqual([null, null, null, days[0], days[0], days[0]]);
    expect(r.finalizedOrder).toEqual(days);
    expect(r.state.currentReplayDate).toBe(days[1]);
    expect(r.state.status).toBe("completed");
    expect(r.invocations).toHaveLength(6);
  });

  it("a single-day smoke run never continues into another historical day", () => {
    const r = runSim({ universe: universeOf(1000), days: ONE_DAY });
    expect(r.finalizedOrder).toEqual(ONE_DAY);
    expect(r.state.status).toBe("completed");
    expect(nextStepTarget(ONE_DAY, 0, true)).toEqual({ finished: true, nextDay: null, resumingSameDay: false });
    expect(r.invocations).toHaveLength(5);
  });
});
