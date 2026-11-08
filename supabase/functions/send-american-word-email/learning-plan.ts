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

export function eligibleHour(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && hour >= 9 && hour <= 17 && (hour !== 9 || minute >= 10);
}

export function shouldIntroduce(slot: Slot, newToday: number, hasReview: boolean): boolean {
  return newToday < NEW_PER_DAY && (slot.kind === "new" || !hasReview);
}

export { distinctPhrases } from "../_shared/english-practice.ts";

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// Picks which earlier phrase to review. Missed emails never matter: if the ideal
// phrase is missing it falls back to any earlier phrase not already reviewed today.
// If every phrase has been reviewed, reuse one in a fresh situation instead of adding new vocabulary.
export function pickReview(slot: Slot, today: string, phrases: Phrase[], reviewedToday: Set<string>): Phrase | null {
  if (slot.kind !== "review") return null;
  const eligible = phrases.filter((p) => p.sent_for <= today);
  const newestFirst = [...eligible].sort((a, b) => (b.sent_for + String(b.et_hour).padStart(2, "0")).localeCompare(a.sent_for + String(a.et_hour).padStart(2, "0")));
  const open = newestFirst.filter((p) => !reviewedToday.has(p.id));
  let pick: Phrase | undefined;
  if (slot.source === "yesterday") pick = open.find((p) => p.sent_for < today) ?? newestFirst.find((p) => p.sent_for < today);
  else if (slot.source === "days_ago") pick = open.find((p) => dayDiff(today, p.sent_for) >= (slot.minDaysAgo ?? 3)) ?? newestFirst.find((p) => dayDiff(today, p.sent_for) >= (slot.minDaysAgo ?? 3));
  else pick = newestFirst.find((p) => p.sent_for === today && p.et_hour === slot.todayHour);
  return pick ?? open[0] ?? newestFirst[0] ?? null;
}
