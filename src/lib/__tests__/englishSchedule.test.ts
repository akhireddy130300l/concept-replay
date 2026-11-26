import { describe, expect, it } from "vitest";
import { easternLearningTime, eligibleRecap, hasLegacyLearningDay } from "../../../supabase/functions/_shared/english-schedule";
import { eligibleHour } from "../../../supabase/functions/send-american-word-email/learning-plan";

describe("evening English delivery schedule", () => {
  it("keeps the Eastern learning date after UTC midnight in winter", () => {
    const time = easternLearningTime(new Date("2026-11-27T03:30:00Z"));
    expect(time).toEqual({ date: "2026-11-26", hour: 22, minute: 30 });
    expect(eligibleRecap(time.hour, time.minute)).toBe(true);
  });
  it("keeps 10:30 PM local time and the correct day in summer", () => {
    const time = easternLearningTime(new Date("2027-07-02T02:30:00Z"));
    expect(time).toEqual({ date: "2027-07-01", hour: 22, minute: 30 });
    expect(eligibleRecap(time.hour, time.minute)).toBe(true);
  });
  it("does not send the recap at 9:30 PM or before 10:30 PM", () => {
    expect(eligibleRecap(21, 30)).toBe(false);
    expect(eligibleRecap(22, 29)).toBe(false);
    expect(eligibleRecap(22, 30)).toBe(true);
    expect(eligibleRecap(23, 30)).toBe(false);
  });
  it("starts at 2:10 PM in both daylight-saving seasons", () => {
    for (const utc of ["2026-11-26T19:10:00Z", "2027-07-01T18:10:00Z"]) {
      const time = easternLearningTime(new Date(utc));
      expect(time.hour).toBe(14);
      expect(eligibleHour(time.hour, time.minute)).toBe(true);
      expect(eligibleHour(time.hour, 9)).toBe(false);
    }
  });
  it("retains catch-up at :20 and :40 but never sends outside the evening window", () => {
    for (const minute of [20, 40]) {
      expect(eligibleHour(14, minute)).toBe(true);
      expect(eligibleHour(22, minute)).toBe(true);
      expect(eligibleHour(13, minute)).toBe(false);
      expect(eligibleHour(23, minute)).toBe(false);
    }
  });
  it("prevents an additional routine on the transition day without blocking new days", () => {
    expect(hasLegacyLearningDay([{ et_hour: 9, sent_ok: true }])).toBe(true);
    expect(hasLegacyLearningDay([{ et_hour: 9, sent_ok: false }])).toBe(false);
    expect(hasLegacyLearningDay([{ et_hour: 14, sent_ok: true }])).toBe(false);
    expect(hasLegacyLearningDay([])).toBe(false);
  });
});