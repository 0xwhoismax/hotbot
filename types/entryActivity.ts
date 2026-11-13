/** SniperBot's active-trading check (`rules.activeTrading`; omitted is off), on the indexer row: the last swap within `lastSwapSeconds`, and
 *  in the last minute at least `buckets` of its five-second intervals with a trade and `buyers` distinct buyers. Discovery passes over a coin
 *  that misses it, and an entry waits for it. */
export type ActiveTrading = { lastSwapSeconds: number; buckets: number; buyers: number };
export const ENTRY_ACTIVITY_MS = 60_000, ACTIVITY_BUCKET_MS = 5_000;
export const ROW_BUYERS = 3;
export const ACTIVE_TRADING = {
  start: { lastSwapSeconds: 15, buckets: 9, buyers: 3 } as ActiveTrading,
  lastSwapSeconds: [1, ENTRY_ACTIVITY_MS / 1000], buckets: [0, ENTRY_ACTIVITY_MS / ACTIVITY_BUCKET_MS], buyers: [0, ROW_BUYERS],
  picks: { lastSwapSeconds: [5, 15, 30, 60], buckets: [3, 6, 9, 12], buyers: [0, 1, 2, 3] },
} as const;
export const activeTradingText = (rule: ActiveTrading) =>
  `Last swap within ${rule.lastSwapSeconds} s; ${rule.buckets} of the last minute's ${ACTIVE_TRADING.buckets[1]} five-second intervals with a trade and ${rule.buyers} buyers`;
export function validateActiveTrading(rule: ActiveTrading | undefined) {
  if (!rule) return;
  const within = (n: number, [min, max]: readonly [number, number]) => Number.isInteger(n) && n >= min && n <= max;
  if (!within(rule.lastSwapSeconds, ACTIVE_TRADING.lastSwapSeconds)) throw new Error(`Set the last swap within ${ACTIVE_TRADING.lastSwapSeconds.join('–')} seconds.`);
  if (!within(rule.buckets, ACTIVE_TRADING.buckets)) throw new Error(`Set ${ACTIVE_TRADING.buckets.join('–')} active intervals.`);
  if (!within(rule.buyers, ACTIVE_TRADING.buyers)) throw new Error(`Set ${ACTIVE_TRADING.buyers.join('–')} buyers in the last minute.`);
}
