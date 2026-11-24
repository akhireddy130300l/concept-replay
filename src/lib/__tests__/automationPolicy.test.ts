import { describe, expect, it, vi } from "vitest";
import { confidenceTier, validModelMarket, LEARNING_LINK_SECONDS, stockDeliveryKey, testDeliveryKey, testCooldownRemaining } from "../../../supabase/functions/_shared/automation-policy";
import { sendRecordedEmail } from "../../../supabase/functions/_shared/recorded-email";

describe("automation safeguards", () => {
  it("private assets remain available for seven days", () => expect(LEARNING_LINK_SECONDS).toBe(604800));
  it("70% is High Conviction", () => expect(confidenceTier(0.7)).toBe("High Conviction"));
  it("60% through below 70% is Moderate", () => { expect(confidenceTier(0.6)).toBe("Moderate"); expect(confidenceTier(0.6999)).toBe("Moderate"); });
  it("rejects invalid probabilities", () => { expect(confidenceTier(1.1)).toBeNull(); expect(confidenceTier(NaN)).toBeNull(); });
  const now = Date.parse("2026-11-24T17:00:00Z");
  const market = { price: 20, averageVolume: 150000, quoteAt: now - 3600000, predictionDate: "2026-11-24", currency: "USD" };
  it("accepts fresh liquid USD stocks", () => expect(validModelMarket(market, now)).toBe(true));
  it("rejects penny stocks", () => expect(validModelMarket({ ...market, price: 4.99 }, now)).toBe(false));
  it("rejects low share volume", () => expect(validModelMarket({ ...market, averageVolume: 99999 }, now)).toBe(false));
  it("rejects low dollar liquidity", () => expect(validModelMarket({ ...market, price: 5, averageVolume: 100000 }, now)).toBe(false));
  it("rejects stale quotes", () => expect(validModelMarket({ ...market, quoteAt: now - 5 * 86400000 }, now)).toBe(false));
  it("rejects stale predictions even with fresh quotes", () => expect(validModelMarket({ ...market, predictionDate: "2026-11-19" }, now)).toBe(false));
  it("same stock schedule retries retain the provider key; rescheduling creates a new occurrence", () => {
    const key = stockDeliveryKey("u", "t", "2026-11-24T16:18:00Z");
    expect(stockDeliveryKey("u", "t", "2026-11-24T16:18:00.000Z")).toBe(key);
    expect(stockDeliveryKey("u", "t", "2026-11-24T18:18:00Z")).not.toBe(key);
  });
  it("test request retries reuse the key and stay separate from scheduled sends", () => {
    expect(testDeliveryKey("u", "stock", "r")).toBe(testDeliveryKey("u", "stock", "r"));
    expect(testDeliveryKey("u", "stock", "r")).not.toBe(testDeliveryKey("other", "stock", "r"));
    expect(testDeliveryKey("u", "stock", "r")).not.toBe(stockDeliveryKey("u", "t", "2026-11-24T16:18:00Z"));
  });
  it("test sends have a five-minute cooldown", () => { expect(testCooldownRemaining(new Date(now).toISOString(), now + 299000)).toBe(1); expect(testCooldownRemaining(new Date(now).toISOString(), now + 300000)).toBe(0); });
  it("does not contact the provider again after a confirmed delivery", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "sent", provider_id: "confirmed" }, error: null }) }) }) }) };
    const result = await sendRecordedEmail(admin, { userId: "u", kind: "stock", key: "same", from: "from@example.com", to: "to@example.com", subject: "test", html: "<p>test</p>", apiKey: "test" });
    expect(result).toEqual({ ok: true, duplicate: true, id: "confirmed" });
    expect(fetchMock).not.toHaveBeenCalled(); fetchMock.mockRestore();
  });
});