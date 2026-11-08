// Daily learning plan for the nine hourly English emails (Eastern hours 9–17).
// Only 3 hours introduce a new phrase; every other hour reviews an older one.
export type Slot =
  | { kind: "new" }
  | { kind: "review"; source: "yesterday" | "days_ago" | "today"; minDaysAgo?: number; todayHour?: number };

export const PLAN: Record<number, Slot> = {
  9: { kind: "review", source: "yesterday" },            // 9:10 AM morning recall challenge
  10: { kind: "review", source: "days_ago", minDaysAgo: 3 },
  11: { kind: "review", source: "days_ago", minDaysAgo: 7 },
  12: { kind: "new" },
  13: { kind: "new" },
  14: { kind: "new" },
  15: { kind: "review", source: "today", todayHour: 12 },
  16: { kind: "review", source: "today", todayHour: 13 },
  17: { kind: "review", source: "today", todayHour: 14 },
};

export const NEW_PER_DAY = Object.values(PLAN).filter((s) => s.kind === "new").length;

export type Phrase = { id: string; sent_for: string; et_hour: number };

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// Picks which earlier phrase to review. Missed emails never matter: if the ideal
// phrase is missing it falls back to any earlier phrase not already reviewed today.
// Returns null only when there is nothing at all to review (then send a new phrase).
export function pickReview(slot: Slot, today: string, phrases: Phrase[], reviewedToday: Set<string>): Phrase | null {
  if (slot.kind !== "review") return null;
  const open = phrases.filter((p) => !reviewedToday.has(p.id));
  const newestFirst = [...open].sort((a, b) => (b.sent_for + String(b.et_hour).padStart(2, "0")).localeCompare(a.sent_for + String(a.et_hour).padStart(2, "0")));
  let pick: Phrase | undefined;
  if (slot.source === "yesterday") pick = newestFirst.find((p) => p.sent_for < today);
  else if (slot.source === "days_ago") pick = newestFirst.find((p) => dayDiff(today, p.sent_for) >= (slot.minDaysAgo ?? 3));
  else pick = newestFirst.find((p) => p.sent_for === today && p.et_hour === slot.todayHour);
  return pick ?? newestFirst.find((p) => p.sent_for <= today) ?? null;
}
