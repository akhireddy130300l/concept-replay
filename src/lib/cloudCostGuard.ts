// Browser mirror of supabase/functions/_shared/cost-guard.ts.
// Edge Functions cannot import from src/, so these numbers are duplicated.
// `src/lib/__tests__/cloudCostGuard.test.ts` fails if the two files drift.

export const COST_LIMITS = {
  maxTradingDaysPerRun: 40,
  maxDaysPerInvocation: 1,
  maxTickersPerInvocation: 250,
  maxTopN: 60,
  maxConsecutiveErrors: 3,
  minPollIntervalMs: 60_000,
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

export type ClampedReplayConfig = {
  start_date: string;
  end_date: string;
  batch_size: number;
  top_n: number;
  resume: boolean;
  max_consecutive_errors: number;
  max_trading_days: number;
};

export function clampReplayRequest(req: ReplayRequest): { config: ClampedReplayConfig; warnings: string[] } {
  const warnings: string[] = [];
  const clamp = (value: number, max: number, label: string) => {
    if (!Number.isFinite(value) || value < 1) return 1;
    if (value > max) {
      warnings.push(`${label} reduced from ${value} to ${max} by cost guard`);
      return max;
    }
    return Math.floor(value);
  };
  return {
    config: {
      start_date: req.start_date,
      end_date: req.end_date,
      batch_size: clamp(Number(req.batch_size ?? 1), COST_LIMITS.maxDaysPerInvocation, "batch_size"),
      top_n: clamp(Number(req.top_n ?? 60), COST_LIMITS.maxTopN, "top_n"),
      resume: req.resume ?? true,
      max_consecutive_errors: clamp(
        Number(req.max_consecutive_errors ?? COST_LIMITS.maxConsecutiveErrors),
        COST_LIMITS.maxConsecutiveErrors,
        "max_consecutive_errors",
      ),
      max_trading_days: clamp(
        Number(req.max_trading_days ?? COST_LIMITS.maxTradingDaysPerRun),
        COST_LIMITS.maxTradingDaysPerRun,
        "max_trading_days",
      ),
    },
    warnings,
  };
}

export function capUniverse(tickers: string[], max = COST_LIMITS.maxTickersPerInvocation) {
  const sorted = [...tickers].sort();
  if (sorted.length <= max) return { tickers: sorted, capped: false };
  return { tickers: sorted.slice(0, max), capped: true };
}

export function canStartRun(activeRunCount: number, force = false): { ok: boolean; reason?: string } {
  if (activeRunCount > 0 && !force) return { ok: false, reason: "a replay run is already active (running or paused)" };
  return { ok: true };
}

export function nextDayIndex(days: string[], currentReplayDate: string | null | undefined): number {
  if (!currentReplayDate) return 0;
  const idx = days.findIndex((d) => d > currentReplayDate);
  return idx < 0 ? days.length : idx;
}

export function capDays(days: string[], maxDays: number): { days: string[]; capped: boolean } {
  if (days.length <= maxDays) return { days, capped: false };
  return { days: days.slice(0, maxDays), capped: true };
}

export const TERMINAL_STATUSES = ["cancelled", "completed", "failed"] as const;
export const HALTED_STATUSES = ["paused", ...TERMINAL_STATUSES] as const;

export function isHalted(status: string | null | undefined): boolean {
  return !!status && (HALTED_STATUSES as readonly string[]).includes(status);
}

/** Dashboard polling policy: never faster than the guard floor, never while hidden. */
export function pollIntervalFor(visible: boolean, requestedMs = COST_LIMITS.minPollIntervalMs): number | null {
  if (!visible) return null;
  return Math.max(COST_LIMITS.minPollIntervalMs, Math.floor(requestedMs));
}
