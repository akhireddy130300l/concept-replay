import { describe, expect, it } from "vitest";
import { PLAN, NEW_PER_DAY, eligibleHour, pickReview, shouldIntroduce, distinctPhrases } from "../../../supabase/functions/send-american-word-email/learning-plan";

const today = "2026-11-09";
const phrase = (id: string, date: string, hour = 17) => ({ id, sent_for: date, et_hour: hour });

describe("hourly English learning rules", () => {
  it("keeps nine slots with exactly three new chunks at five, six and seven PM", () => {
    expect(Object.keys(PLAN).map(Number)).toEqual([14,15,16,17,18,19,20,21,22]);
    expect(NEW_PER_DAY).toBe(3);
    expect(Object.entries(PLAN).filter(([, s]) => s.kind === "new").map(([h]) => Number(h))).toEqual([17,18,19]);
  });
  it("starts at 2:10 PM and includes 10 PM", () => {
    expect(eligibleHour(14, 0)).toBe(false);
    expect(eligibleHour(14, 9)).toBe(false);
    expect(eligibleHour(14, 10)).toBe(true);
    expect(eligibleHour(15, 0)).toBe(true);
    expect(eligibleHour(22, 0)).toBe(true);
    expect(eligibleHour(23, 0)).toBe(false);
  });
  it("afternoon recalls yesterday rather than today's new phrase", () => {
    expect(pickReview(PLAN[14], today, [phrase("older", "2026-11-07"), phrase("yesterday", "2026-11-08"), phrase("today", today)], new Set())?.id).toBe("yesterday");
  });
  it("uses three-day and seven-day spaced reviews", () => {
    const rows = [phrase("yesterday", "2026-11-08"), phrase("three", "2026-11-06"), phrase("seven", "2026-11-02")];
    expect(pickReview(PLAN[15], today, rows, new Set())?.id).toBe("three");
    expect(pickReview(PLAN[16], today, rows, new Set())?.id).toBe("seven");
  });
  it("transfers five, six and seven PM PM chunks in evening even if already reviewed", () => {
    const rows = [phrase("one", today, 17), phrase("two", today, 18), phrase("three", today, 19)];
    expect([20,21,22].map((h) => pickReview(PLAN[h], today, rows, new Set(["one"]))?.id)).toEqual(["one", "two", "three"]);
  });
  it("missed days fall back to available material without backlog or penalty", () => {
    expect(pickReview(PLAN[20], today, [phrase("available", "2026-11-05")], new Set())?.id).toBe("available");
    expect(pickReview(PLAN[14], today, [phrase("weekend", "2026-11-06")], new Set())?.id).toBe("weekend");
  });
  it("caps new material at three even when starting with an empty history", () => {
    expect(pickReview(PLAN[14], today, [], new Set())).toBeNull();
    expect(shouldIntroduce(PLAN[14], 0, false)).toBe(true);
    expect(shouldIntroduce(PLAN[17], 3, true)).toBe(false);
    expect(shouldIntroduce(PLAN[14], 3, false)).toBe(false);
    expect(pickReview(PLAN[15], today, [phrase("only", today)], new Set(["only"]))?.id).toBe("only");
  });
  it("recap lists each practiced phrase once, including older recalled phrases", () => {
    expect(distinctPhrases([{ word: "It's on me" }, { word: " it's ON me " }, { word: "Fair enough" }]).map((p) => p.word)).toEqual(["It's on me", "Fair enough"]);
  });
});