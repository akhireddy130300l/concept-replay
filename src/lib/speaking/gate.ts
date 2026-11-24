// Frontend mirror of supabase/functions/_shared/speaking-gate.ts
export type GateStatus = "inactive" | "active" | "warning" | "paused";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

export function classifyGate(opts: {
  gateStartedAt: string | null;
  lastCompletedDate: string | null;
  today?: string;
  requireSpeaking?: boolean;
}): GateStatus {
  if (opts.requireSpeaking === false) return "inactive";
  if (!opts.gateStartedAt) return "inactive";
  const today = opts.today ?? localDateStr(new Date());
  if (!opts.lastCompletedDate) {
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

export function gateLabel(
  s: GateStatus,
  requireSpeaking = true,
): { text: string; tone: "green" | "amber" | "red" | "muted" } {
  if (!requireSpeaking) {
    return { text: "Speaking not required — stock emails send on schedule", tone: "muted" };
  }
  switch (s) {
    case "active": return { text: "All scheduled emails active", tone: "green" };
    case "warning": return { text: "Warning day: complete today's speaking session to avoid pause", tone: "amber" };
    case "paused": return { text: "Scheduled emails paused: complete a good speaking session to resume", tone: "red" };
    default: return { text: "Speaking accountability not enabled yet", tone: "muted" };
  }
}
