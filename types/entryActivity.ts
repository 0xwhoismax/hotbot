/** SniperBot's optional activity check (on unless entryActivity is false). */
export const ENTRY_ACTIVITY_MS = 60_000;
export const ENTRY_ACTIVITY = { buckets: 9, bucketMs: 5_000, buyers: 3, lastSwapMs: 15_000 } as const;
export const ENTRY_ACTIVITY_DESCRIPTION = `${ENTRY_ACTIVITY.buckets} active ${ENTRY_ACTIVITY.bucketMs / 1000}-second intervals and ${ENTRY_ACTIVITY.buyers} buyers in the last minute; last swap under ${ENTRY_ACTIVITY.lastSwapMs / 1000} seconds ago`;
/** Shared reason also identifies a temporary refusal for discovery's re-entry gate. */
export const ENTRY_ACTIVITY_WAIT = 'Waiting for sustained trading from several buyers';
export type EntryActivity = { lastTradeAt?: number; bucketTrades?: number[]; buyerTrades?: number[] };

/** Events expire locally; refreshing the feed or an old count cannot keep an idle coin eligible. */
export function entryActivityCounts(activity: EntryActivity, now = Date.now()) {
  const fresh = (at: number) => Number.isFinite(at) && at <= now && now - at <= ENTRY_ACTIVITY_MS;
  return { buckets: new Set((activity.bucketTrades ?? []).filter(fresh).map(at => Math.floor(at / ENTRY_ACTIVITY.bucketMs))).size,
    buyers: (activity.buyerTrades ?? []).filter(fresh).length };
}
export function hasEntryActivity(activity: EntryActivity, now = Date.now()) {
  const { lastTradeAt } = activity, { buckets, buyers } = entryActivityCounts(activity, now);
  return lastTradeAt !== undefined && Number.isFinite(lastTradeAt) && lastTradeAt <= now && now - lastTradeAt < ENTRY_ACTIVITY.lastSwapMs
    && buckets >= ENTRY_ACTIVITY.buckets && buyers >= ENTRY_ACTIVITY.buyers;
}
