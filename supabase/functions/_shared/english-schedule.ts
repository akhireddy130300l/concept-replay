// Eastern calendar days must survive UTC midnight and daylight-saving changes.
export const FIRST_ENGLISH_HOUR = 14;
export const FIRST_ENGLISH_MINUTE = 10;
export const LAST_ENGLISH_HOUR = 22;
export const RECAP_MINUTE = 30;

export function easternLearningTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function eligibleRecap(hour: number, minute: number) {
  return hour === LAST_ENGLISH_HOUR && Number.isInteger(minute) && minute >= RECAP_MINUTE && minute < 60;
}

// A day already served on the morning timetable must not receive a second routine.
export function hasLegacyLearningDay(rows: { et_hour: number; sent_ok: boolean }[]) {
  return rows.some(row => row.sent_ok && row.et_hour >= 9 && row.et_hour < FIRST_ENGLISH_HOUR);
}