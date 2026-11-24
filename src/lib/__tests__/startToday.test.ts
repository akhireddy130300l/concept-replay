import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_FIELDS,
  selectDailyFields,
  normalizeTopicKey,
  deduplicateIdeas,
  getDueMilestone,
} from "../../../supabase/functions/_shared/start-today";

describe("Start Today helpers", () => {
  it("picks 3 distinct fields every day and covers all 9 fields across 3 consecutive days", () => {
    const day1 = selectDailyFields("2026-11-24");
    const day2 = selectDailyFields("2026-11-25");
    const day3 = selectDailyFields("2026-11-26");

    expect(day1).toHaveLength(3);
    expect(new Set(day1.map((d) => d.field.id)).size).toBe(3);

    const allThreeDays = new Set([
      ...day1.map((d) => d.field.id),
      ...day2.map((d) => d.field.id),
      ...day3.map((d) => d.field.id),
    ]);
    expect(allThreeDays.size).toBe(OPPORTUNITY_FIELDS.length);
  });

  it("marks one Wild Card idea on Sundays outside preferred fields", () => {
    const sunday = selectDailyFields("2026-11-29", ["Money", "Career", "Technology"]);
    expect(sunday.filter((d) => d.isWildcard)).toHaveLength(1);
    const wildcard = sunday.find((d) => d.isWildcard)!;
    expect(["Money", "Career", "Technology"]).not.toContain(wildcard.field.label);
  });

  it("normalizes and deduplicates repeated topics", () => {
    expect(normalizeTopicKey("  AI-Agents!!  for  Small Business ")).toBe("ai agents for small business");
    const existing = new Set([normalizeTopicKey("AI Agents for Small Business")]);
    const filtered = deduplicateIdeas(
      [
        { topic: "ai-agents for small business!" },
        { topic: "Home Battery Microgrids" },
        { topic: "home battery microgrids" },
      ],
      existing,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].topic).toBe("Home Battery Microgrids");
  });

  it("triggers 30, 90, and 365 day milestones only once each", () => {
    const started = "2026-01-01T12:00:00Z";
    expect(getDueMilestone(started, new Date("2026-01-20T12:00:00Z"), 0)).toBeNull();
    expect(getDueMilestone(started, new Date("2026-01-31T12:00:00Z"), 0)).toBe(30);
    expect(getDueMilestone(started, new Date("2026-02-05T12:00:00Z"), 30)).toBeNull();
    expect(getDueMilestone(started, new Date("2026-04-02T12:00:00Z"), 30)).toBe(90);
    expect(getDueMilestone(started, new Date("2027-01-02T12:00:00Z"), 90)).toBe(365);
    expect(getDueMilestone(started, new Date("2027-02-01T12:00:00Z"), 365)).toBeNull();
  });
});