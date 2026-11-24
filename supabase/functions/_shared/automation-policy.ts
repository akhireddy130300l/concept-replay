export const LEARNING_LINK_SECONDS = 7 * 24 * 60 * 60;
export const TEST_COOLDOWN_SECONDS = 5 * 60;
export function testDeliveryKey(userId: string, kind: string, requestId: string) {
  return `automation-test-${kind}-${userId}-${requestId}`;
}
export function stockDeliveryKey(userId: string, topicId: string, dueAt: string) {
  return `stock-${userId}-${topicId}-${new Date(dueAt).toISOString()}`;
}
export function testCooldownRemaining(requestedAt: string | null, now = Date.now()) {
  return requestedAt ? Math.max(0, TEST_COOLDOWN_SECONDS - Math.floor((now - Date.parse(requestedAt)) / 1000)) : 0;
}
export function confidenceTier(probability: number) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  return probability >= 0.7 ? "High Conviction" : probability >= 0.6 ? "Moderate" : "Watchlist Only";
}
// Conservative display-only defaults, not trade-selection rules.
export function validModelMarket(m: { price: number; averageVolume: number; quoteAt: number; predictionDate: string; currency: string | null }, now = Date.now()) {
  const predictionAt = Date.parse(`${m.predictionDate}T00:00:00Z`);
  return m.currency === "USD" && Number.isFinite(m.price) && m.price >= 5
    && Number.isFinite(m.averageVolume) && m.averageVolume >= 100000
    && m.price * m.averageVolume >= 1000000
    && Number.isFinite(m.quoteAt) && now - m.quoteAt <= 4 * 86400000 && m.quoteAt <= now + 300000
    && Number.isFinite(predictionAt) && now - predictionAt <= 4 * 86400000 && predictionAt <= now;
}