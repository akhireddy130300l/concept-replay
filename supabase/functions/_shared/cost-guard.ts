// Cloud Cost Guard — single source of truth for backend workload limits.
//
// These limits exist so a single misconfigured historical replay (or a runaway
// retry loop) cannot exhaust the Lovable Cloud allowance again.
//
// NOTE: the browser mirror of these numbers lives in src/lib/cloudCostGuard.ts
// (Edge Functions cannot import from src/). Keep both files in sync — the
// dashboard panel renders the mirror and flags drift as a warning.

export const COST_LIMITS = {
  /** Hard ceiling on trading days a single replay run may cover. */
  maxTradingDaysPerRun: 40,
  /** Trading days processed per function invocation (self-reinvoke after). */
  maxDaysPerInvocation: 1,
  /** Universe tickers scanned in one invocation (Yahoo fetches). */
  maxTickersPerInvocation: 250,
  /** Deep-analysis tickers per replay day (Exa + writes). */
  maxTopN: 60,
  /** Consecutive failing days before a run auto-stops. */
  maxConsecutiveErrors: 3,
  /** Minimum dashboard polling interval the UI may use. */
  minPollIntervalMs: 60_000,
  /** A running run with no heartbeat for this long is considered dead. */
  staleRunMinutes: 30,
} as const;

export type ReplayRequest = {
  start_date: string;
  end_date: string;
  batch_size?: number;
  top_n?: number;
  resume?: boolean;
  max_consecutive_errors?: number;
  max_trading_days?: number;
};

export type ClampResult = {
  config: Required<Pick<ReplayRequest, "start_date" | "end_date" | "batch_size" | "top_n" | "resume" | "max_consecutive_errors">> & { max_trading_days: number };
  warnings: string[];
};

/** Clamp any caller-supplied replay request down to the guard limits. */
export function clampReplayRequest(req: ReplayRequest): ClampResult {
  const warnings: string[] = [];
  const clamp = (value: number, max: number, label: string) => {
    if (!Number.isFinite(value) || value < 1) return 1;
    if (value > max) {
      warnings.push(`${label} reduced from ${value} to ${max} by cost guard`);
      return max;
    }
    return Math.floor(value);
  };
  const batch_size = clamp(Number(req.batch_size ?? 1), COST_LIMITS.maxDaysPerInvocation, "batch_size");
  const top_n = clamp(Number(req.top_n ?? 60), COST_LIMITS.maxTopN, "top_n");
  const max_trading_days = clamp(Number(req.max_trading_days ?? COST_LIMITS.maxTradingDaysPerRun), COST_LIMITS.maxTradingDaysPerRun, "max_trading_days");
  const max_consecutive_errors = clamp(Number(req.max_consecutive_errors ?? COST_LIMITS.maxConsecutiveErrors), COST_LIMITS.maxConsecutiveErrors, "max_consecutive_errors");
  return {
    config: {
      start_date: req.start_date,
      end_date: req.end_date,
      batch_size,
      top_n,
      resume: req.resume ?? true,
      max_consecutive_errors,
      max_trading_days,
    },
    warnings,
  };
}

/** Trim the universe to the per-invocation ticker ceiling (deterministic). */
export function capUniverse(tickers: string[], max = COST_LIMITS.maxTickersPerInvocation): { tickers: string[]; capped: boolean } {
  const sorted = [...tickers].sort();
  if (sorted.length <= max) return { tickers: sorted, capped: false };
  return { tickers: sorted.slice(0, max), capped: true };
}

/** Concurrency guard: only one non-terminal replay run may exist at a time. */
export function canStartRun(activeRunCount: number, force = false): { ok: boolean; reason?: string } {
  if (activeRunCount > 0 && !force) return { ok: false, reason: "a replay run is already active (running or paused)" };
  return { ok: true };
}

/** Resumability: index of the first day still to process. */
export function nextDayIndex(days: string[], currentReplayDate: string | null | undefined): number {
  if (!currentReplayDate) return 0;
  const idx = days.findIndex((d) => d > currentReplayDate);
  return idx < 0 ? days.length : idx;
}

/** Cap the day list so one run cannot span more than the allowed window. */
export function capDays(days: string[], maxDays: number): { days: string[]; capped: boolean } {
  if (days.length <= maxDays) return { days, capped: false };
  return { days: days.slice(0, maxDays), capped: true };
}

export const TERMINAL_STATUSES = ["cancelled", "completed", "failed"] as const;
export const HALTED_STATUSES = ["paused", ...TERMINAL_STATUSES] as const;

export function isHalted(status: string | null | undefined): boolean {
  return !!status && (HALTED_STATUSES as readonly string[]).includes(status);
}
