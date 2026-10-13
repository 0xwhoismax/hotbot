import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/lib/convex';

export type HomeData = NonNullable<FunctionReturnType<typeof api.team.home>>;
export type Bag = HomeData['bags'][number];
export type StrategyRow = HomeData['strategies'][number];
export type Trade = FunctionReturnType<typeof api.team.trades>[number];
/** Percent move since entry, or null before a mark. */
export const change = (bag: { entry: { priceUsd: number } | null; markPriceUsd: number | null }) => bag.entry && bag.markPriceUsd ? (bag.markPriceUsd / bag.entry.priceUsd - 1) * 100 : null;
/** Solana's logo for the team wallet. */
export const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
