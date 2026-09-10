// Pure decision logic for the chunk-level historical replay.
//
// Extracted from historical-swing-trainer so the invocation contract can be
// unit-tested without Deno/network/database access. The edge function imports
// these helpers; `src/lib/__tests__/replayScheduler.test.ts` drives them
// through a simulated invocation loop.

import { COST_LIMITS, chunkUniverse, isHalted } from "./cost-guard.ts";

export type StepPlan =
  | { action: "scan"; chunkIndex: number; chunksTotal: number; tickers: string[] }
  | { action: "finalize"; chunkIndex: null; chunksTotal: number; tickers: [] };

/**
 * Decide the ONE unit of work for a trading day given how many chunks have
 * already been persisted. Never returns more than
 * COST_LIMITS.maxTickersPerInvocation tickers.
 */
export function planDayStep(
  universe: string[],
  chunksCompleted: number,
  maxPerChunk: number = COST_LIMITS.maxTickersPerInvocation,
): StepPlan {
  const chunks = chunkUniverse(universe, maxPerChunk);
  const done = Math.max(0, Math.floor(Number(chunksCompleted) || 0));
  if (done < chunks.length) {
    return { action: "scan", chunkIndex: done, chunksTotal: chunks.length, tickers: chunks[done] };
  }
  return { action: "finalize", chunkIndex: null, chunksTotal: chunks.length, tickers: [] };
}

/** Cost guard applied immediately before every self-reinvocation. */
export function shouldContinue(args: {
  status: string | null | undefined;
  consecutiveErrors: number;
  maxConsecutiveErrors?: number;
}): { ok: boolean; reason?: string } {
  const max = Math.max(1, Math.min(COST_LIMITS.maxConsecutiveErrors, Number(args.maxConsecutiveErrors ?? COST_LIMITS.maxConsecutiveErrors)));
  if (!args.status) return { ok: false, reason: "run_missing" };
  if (isHalted(args.status)) return { ok: false, reason: `run_${args.status}` };
  if (Number(args.consecutiveErrors ?? 0) >= max) return { ok: false, reason: "consecutive_error_threshold" };
  return { ok: true };
}

/** Where the next invocation should pick up. */
export function nextStepTarget(days: string[], startIdx: number, dayComplete: boolean): {
  finished: boolean;
  nextDay: string | null;
  resumingSameDay: boolean;
} {
  const day = days[startIdx] ?? null;
  if (!dayComplete) return { finished: false, nextDay: day, resumingSameDay: true };
  const next = days[startIdx + 1] ?? null;
  return { finished: next === null, nextDay: next, resumingSameDay: false };
}
