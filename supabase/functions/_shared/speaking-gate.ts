// Speaking Gym → email accountability gate.
// Rule (corrected):
//   completed today               → "active"
//   last completed = yesterday    → "warning"  (one-day buffer)
//   last completed >= 2 days ago  → "paused"
//   gate not enabled for the user → "inactive" (never pause, never warn)

export type GateStatus = "inactive" | "active" | "warning" | "paused";

function localDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export function classifyGate(opts: {
  gateStartedAt: string | null;
  lastCompletedDate: string | null; // YYYY-MM-DD
  today?: string; // YYYY-MM-DD UTC
}): GateStatus {
  if (!opts.gateStartedAt) return "inactive";
  const today = opts.today ?? localDateUtc(new Date());
  if (!opts.lastCompletedDate) {
    // Gate enabled but never completed → grace day from gate-start.
    const gap = daysBetween(opts.gateStartedAt.slice(0, 10), today);
    if (gap <= 0) return "active";
    if (gap === 1) return "warning";
    return "paused";
  }
  const gap = daysBetween(opts.lastCompletedDate, today);
  if (gap <= 0) return "active";
  if (gap === 1) return "warning";
  return "paused";
}

export const WARNING_BANNER_HTML = `<div style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:12px 14px;border-radius:8px;margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
<strong>Speaking session missed.</strong> Complete today's Influence Speaking Gym to keep all scheduled emails active.
</div>`;
