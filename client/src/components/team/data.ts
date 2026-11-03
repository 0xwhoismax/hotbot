import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/lib/convex';

export type HomeData = NonNullable<FunctionReturnType<typeof api.team.home>>;
export type Bag = HomeData['bags'][number];
export type StrategyRow = HomeData['strategies'][number];
export type Trade = FunctionReturnType<typeof api.team.trades>[number];
/** Percent move since entry, or null before a mark. */
export const change = (bag: { entry: { priceUsd: number } | null; markPriceUsd: number | null }) => bag.entry && bag.markPriceUsd ? (bag.markPriceUsd / bag.entry.priceUsd - 1) * 100 : null;
/** Real profit since `from`: the strategy's total now (sold plus held at the latest prices) less its profit line's value at `from`. */
export function realSince(strategy: StrategyRow, from: number) {
  const before = [...strategy.spark].reverse().find(point => point.at <= from)?.pnl ?? 0;
  return strategy.realizedPnlSol + strategy.openPnlSol - before;
}
