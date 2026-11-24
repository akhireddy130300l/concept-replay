import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_FIELDS,
  selectDailyFields,
  selectFieldSearchQuery,
  classifyPriorTopics,
  normalizeTopicKey,
  deduplicateIdeas,
  getDueMilestone,
  getStageBadgeMeta,
  signStartTodayActionToken,
  verifyStartTodayActionToken,
  buildStartTodayEmailHtml,
  buildSundayFocusEmailHtml,
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

  it("signs and verifies 1-click email action tokens and rejects tampered or expired tokens", async () => {
    const secret = "test-signing-secret";
    const token = await signStartTodayActionToken(
      { uid: "user-1", iid: "idea-1", act: "start" },
      secret,
      60,
    );
    const verified = await verifyStartTodayActionToken(token, secret);
    expect(verified?.uid).toBe("user-1");
    expect(verified?.iid).toBe("idea-1");
    expect(verified?.act).toBe("start");

    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifyStartTodayActionToken(tampered, secret)).toBeNull();

    const expired = await verifyStartTodayActionToken(token, secret, Math.floor(Date.now() / 1000) + 120);
    expect(expired).toBeNull();
  });

  it("rotates worldwide search angles across days and renders stage badges + 1-click buttons", () => {
    const money = OPPORTUNITY_FIELDS[0];
    const q1 = selectFieldSearchQuery(money, "2026-11-24");
    const q2 = selectFieldSearchQuery(money, "2026-11-25");
    expect(q1).not.toBe(q2);

    expect(getStageBadgeMeta("inflection_point").label).toBe("Inflection Point");
    expect(getStageBadgeMeta("evergreen").label).toBe("Evergreen Skill");
    expect(getStageBadgeMeta("early_wave").label).toBe("Early Wave");

    const html = buildStartTodayEmailHtml(
      [
        {
          field: "Money",
          topic: "Mobile EV Battery Diagnostics",
          why_rising: "Used EVs are growing fast.",
          five_year_vision: "Standard pre-purchase check.",
          real_examples: ["Independent EV inspectors"],
          first_step: "Watch one diagnostic walkthrough.",
          difficulty: "Beginner",
          cost_estimate: "$100",
          time_estimate: "15 mins/day",
          sources: [],
          is_wildcard: false,
          opportunity_stage: "inflection_point",
          actionLinks: {
            startUrl: "https://example.com/start",
            laterUrl: "https://example.com/later",
            passUrl: "https://example.com/pass",
          },
        },
      ],
      "https://app.example.com",
      "2026-11-24",
    );
    expect(html).toContain("Inflection Point");
    expect(html).toContain("https://example.com/start");
    expect(html).toContain("Save for Later");

    const sundayHtml = buildSundayFocusEmailHtml(
      [
        {
          topic: "Mobile EV Battery Diagnostics",
          field: "Money",
          completedSteps: 3,
          totalSteps: 7,
          checkInCount: 2,
          isWeeklyFocus: true,
          focusUrl: "https://example.com/focus",
        },
      ],
      "https://app.example.com",
      "2026-11-29",
    );
    expect(sundayHtml).toContain("Sunday Focus Edition");
    expect(sundayHtml).toContain("3/7 days done");
    expect(sundayHtml).toContain("https://example.com/focus");
  });

  it("blocks topics within 180 days and allows major-breakthrough re-alerts after 180 days", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const result = classifyPriorTopics(
      [
        { id: "recent-1", topic: "Home Battery Microgrids", topic_key: "home battery microgrids", sent_for: "2026-10-01" },
        { id: "old-1", topic: "Vertical Urban Farming", topic_key: "vertical urban farming", sent_for: "2026-01-15" },
      ],
      now,
    );

    expect(result.blockedKeys.has("home battery microgrids")).toBe(true);
    expect(result.reAlertCandidates.has("home battery microgrids")).toBe(false);

    expect(result.blockedKeys.has("vertical urban farming")).toBe(false);
    expect(result.reAlertCandidates.get("vertical urban farming")?.id).toBe("old-1");

    const html = buildStartTodayEmailHtml(
      [
        {
          field: "Hobbies & Craft",
          topic: "Vertical Urban Farming",
          why_rising: "New low-cost LED kits cut energy use in half.",
          five_year_vision: "Neighborhood micro-greens hubs.",
          real_examples: ["Local micro-farms"],
          first_step: "Price a starter tray.",
          difficulty: "Beginner",
          cost_estimate: "$80",
          time_estimate: "15 mins/day",
          sources: [],
          is_wildcard: false,
          is_breakthrough_update: true,
          opportunity_stage: "inflection_point",
        },
      ],
      "https://app.example.com",
      "2026-11-24",
    );
    expect(html).toContain("NEW UPDATE");
  });
});