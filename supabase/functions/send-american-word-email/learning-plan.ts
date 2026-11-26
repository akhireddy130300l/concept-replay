// Daily learning plan for the nine hourly English emails (Eastern hours 14–22).
// Only 3 hours introduce a new phrase; every other hour reviews an older one.
import { FIRST_ENGLISH_HOUR, FIRST_ENGLISH_MINUTE, LAST_ENGLISH_HOUR } from "../_shared/english-schedule.ts";
export type Slot =
  | { kind: "new" }
  | { kind: "review"; source: "yesterday" | "days_ago" | "today"; minDaysAgo?: number; todayHour?: number };

export const PLAN: Record<number, Slot> = {
  14: { kind: "review", source: "yesterday" },            // 2:10 PM recall challenge
  15: { kind: "review", source: "days_ago", minDaysAgo: 3 },
  16: { kind: "review", source: "days_ago", minDaysAgo: 7 },
  17: { kind: "new" },
  18: { kind: "new" },
  19: { kind: "new" },
  20: { kind: "review", source: "today", todayHour: 17 },
  21: { kind: "review", source: "today", todayHour: 18 },
  22: { kind: "review", source: "today", todayHour: 19 },
};

export const NEW_PER_DAY = Object.values(PLAN).filter((s) => s.kind === "new").length;

export type Phrase = { id: string; sent_for: string; et_hour: number };

export function eligibleHour(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && minute >= 0 && minute < 60
    && hour >= FIRST_ENGLISH_HOUR && hour <= LAST_ENGLISH_HOUR
    && (hour !== FIRST_ENGLISH_HOUR || minute >= FIRST_ENGLISH_MINUTE);
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
