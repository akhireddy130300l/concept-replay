// Canonical ML feature contract shared by the live and historical Swing Trader
// data collection paths. Both paths MUST call these helpers so downstream ML
// pipelines see identical schemas regardless of `training_source`.

export const FEATURE_VERSION = "v1";
export const DATASET_VERSION = "dataset_v1";

export type TrainingSource = "live" | "historical";

// Time-based split assignment. We split by date (not row order) so the
// validation and test buckets are always chronologically after training.
// Cutoffs are relative to the current calendar date so newly-added rows keep
// flowing into the training set automatically.
export function assignSplitBucket(refDate: Date | string | null): "train" | "val" | "test" {
  const d = refDate ? new Date(refDate) : new Date();
  const now = new Date();
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (daysAgo >= 30) return "train";
  if (daysAgo >= 10) return "val";
  return "test";
}

// Rows this list flags as `missing_critical` are still stored (they can be
// filtered out at training time) but they must never be counted as usable
// training examples for readiness metrics.
export const CRITICAL_FIELDS = [
  "ticker",
  "current_price",
  "one_session_return_pct",
  "seven_session_return_pct",
  "twenty_session_return_pct",
  "volume_strength",
  "technical_score",
  "final_swing_score",
];

export type ValidationResult = { ok: boolean; flags: string[] };

export function validateExample(row: Record<string, unknown>): ValidationResult {
  const flags: string[] = [];
  for (const key of CRITICAL_FIELDS) {
    const v = row[key];
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) {
      flags.push(`missing_${key}`);
    }
  }
  // Sanity checks — invalid rows are still stored but flagged so ML can filter.
  const price = row.current_price;
  if (typeof price === "number" && (price <= 0 || price > 1_000_000)) flags.push("invalid_price");
  const rsi = (row as any).rsi;
  if (typeof rsi === "number" && (rsi < 0 || rsi > 100)) flags.push("invalid_rsi");
  const atr = (row as any).atr;
  if (typeof atr === "number" && atr < 0) flags.push("invalid_atr");
  return { ok: flags.length === 0, flags };
}

// Convenience: fields every insert must carry so live + historical stay aligned.
export function baseVersionFields(source: TrainingSource, historicalRunId: string | null, historicalDate: string | null) {
  return {
    feature_version: FEATURE_VERSION,
    dataset_version: DATASET_VERSION,
    training_source: source,
    historical_run_id: historicalRunId,
    historical_date: historicalDate,
  };
}
