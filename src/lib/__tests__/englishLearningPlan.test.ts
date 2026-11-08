import { describe, expect, it } from "vitest";
import { PLAN, NEW_PER_DAY, eligibleHour, pickReview, shouldIntroduce, distinctPhrases } from "../../../supabase/functions/send-american-word-email/learning-plan";

const today = "2026-11-09";
const phrase = (id: string, date: string, hour = 12) => ({ id, sent_for: date, et_hour: hour });

describe("hourly English learning rules", () => {
  it("keeps nine slots with exactly three new chunks at noon, one and two", () => {
    expect(Object.keys(PLAN).map(Number)).toEqual([9,10,11,12,13,14,15,16,17]);
    expect(NEW_PER_DAY).toBe(3);
    expect(Object.entries(PLAN).filter(([, s]) => s.kind === "new").map(([h]) => Number(h))).toEqual([12,13,14]);
  });
  it("starts at 9:10 and includes 5 PM", () => {
    expect(eligibleHour(9, 0)).toBe(false);
    expect(eligibleHour(9, 9)).toBe(false);
    expect(eligibleHour(9, 10)).toBe(true);
    expect(eligibleHour(10, 0)).toBe(true);
    expect(eligibleHour(17, 0)).toBe(true);
    expect(eligibleHour(18, 0)).toBe(false);
  });
  it("morning recalls yesterday rather than today's new phrase", () => {
    expect(pickReview(PLAN[9], today, [phrase("older", "2026-11-07"), phrase("yesterday", "2026-11-08"), phrase("today", today)], new Set())?.id).toBe("yesterday");
  });
  it("uses three-day and seven-day spaced reviews", () => {
    const rows = [phrase("yesterday", "2026-11-08"), phrase("three", "2026-11-06"), phrase("seven", "2026-11-02")];
    expect(pickReview(PLAN[10], today, rows, new Set())?.id).toBe("three");
    expect(pickReview(PLAN[11], today, rows, new Set())?.id).toBe("seven");
  });
  it("transfers noon, one and two PM chunks in afternoon even if already reviewed", () => {
    const rows = [phrase("one", today, 12), phrase("two", today, 13), phrase("three", today, 14)];
    expect([15,16,17].map((h) => pickReview(PLAN[h], today, rows, new Set(["one"]))?.id)).toEqual(["one", "two", "three"]);
  });
  it("missed days fall back to available material without backlog or penalty", () => {
    expect(pickReview(PLAN[15], today, [phrase("available", "2026-11-05")], new Set())?.id).toBe("available");
    expect(pickReview(PLAN[9], today, [phrase("weekend", "2026-11-06")], new Set())?.id).toBe("weekend");
  });
  it("caps new material at three even when starting with an empty history", () => {
    expect(pickReview(PLAN[9], today, [], new Set())).toBeNull();
    expect(shouldIntroduce(PLAN[9], 0, false)).toBe(true);
    expect(shouldIntroduce(PLAN[12], 3, true)).toBe(false);
    expect(shouldIntroduce(PLAN[9], 3, false)).toBe(false);
    expect(pickReview(PLAN[10], today, [phrase("only", today)], new Set(["only"]))?.id).toBe("only");
  });
  it("recap lists each practiced phrase once, including older recalled phrases", () => {
    expect(distinctPhrases([{ word: "It's on me" }, { word: " it's ON me " }, { word: "Fair enough" }]).map((p) => p.word)).toEqual(["It's on me", "Fair enough"]);
  });
});