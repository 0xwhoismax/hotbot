

export const MARKET_MAX_AGE_MS = 10_000;

/** People read a pool's liquidity as both of its sides, as DexScreener and Axiom count it: a constant-product pool holds its coins at the
 *  worth of its quote side. Code works on one side, the quote side the pool prices on, real and virtual (the indexer row's `liquidity`);
 *  what a person or an agent reads or sets is that times BOTH_SIDES: the market gateway's coins, the tap, the checks' words, and every
 *  stored liquidity floor (`TeamRules.minLiquidityUsd`, which the checks divide back). */
export const BOTH_SIDES = 2;
/** The pool fee a paper fill charges when the indexer has not read its pool's (`swapFeeBps`): pump.fun's curve rate, protocol and creator.
 *  The indexer reads no fee from a leg of a multi-hop swap, which is every trade of a curve quoted in another coin, nor on a venue whose
 *  fee it does not decode, and a fill there still costs a fee. */
export const UNREAD_POOL_FEE_BPS = 125;
/** Selling `usd` worth at the price into the same constant-product pool as a paper fill, by someone who pays only the pool's fee
 *  (`swapFeeBps`): the price after the sale as a share of the price before, and what the sale brings in. */
export function poolSale(usd: number, liquidityUsd: number, swapFeeBps: number) {
  const impact = usd / liquidityUsd;
  return { priceAfter: 1 / (1 + impact) ** 2, proceedsUsd: usd * (1 - swapFeeBps / 10_000) / (1 + impact) };
}

export function freshMarketPrice(observedAt: number | undefined, now = Date.now(), maxAge = MARKET_MAX_AGE_MS) {
  return observedAt !== undefined && Number.isFinite(observedAt) && observedAt <= now && now - observedAt < maxAge;
}
