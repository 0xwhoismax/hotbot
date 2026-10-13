export const MARKET_MAX_AGE_MS = 10_000;
export const FILL_MAX_AGE_MS = 1_000;
export const SWAP_FEE = 0.005;

export function freshMarketPrice(observedAt: number | undefined, now = Date.now(), maxAge = MARKET_MAX_AGE_MS) {
  return observedAt !== undefined && Number.isFinite(observedAt) && observedAt <= now && now - observedAt < maxAge;
}
