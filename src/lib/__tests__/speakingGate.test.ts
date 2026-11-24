import { describe, expect, it } from "vitest";
import { classifyGate, gateLabel } from "@/lib/speaking/gate";

describe("speaking gate toggle for stock emails", () => {
  it("stays inactive when speaking is not required, even if last session was days ago", () => {
    const status = classifyGate({
      gateStartedAt: "2026-11-01T12:00:00Z",
      lastCompletedDate: "2026-11-10",
      today: "2026-11-24",
      requireSpeaking: false,
    });
    expect(status).toBe("inactive");
    expect(gateLabel(status, false).text).toContain("Speaking not required");
  });

  it("pauses when speaking is required and last session was 2+ days ago", () => {
    const status = classifyGate({
      gateStartedAt: "2026-11-01T12:00:00Z",
      lastCompletedDate: "2026-11-20",
      today: "2026-11-24",
      requireSpeaking: true,
    });
    expect(status).toBe("paused");
  });
});