import { isAddress } from '@solana/kit';
import type { MarketCoin } from '../../../types/marketFeed';
import { marketCoin, marketSearch } from './market';

/** A coin the market gateway found for a search, as the pickers list it. */
export type MarketHit = { address: string; name: string; symbol: string; decimals?: number; priceUsd: number; marketCapUsd: number; liquidityUsd?: number };

const hit = (coin: MarketCoin): MarketHit => ({
  address: coin.address, name: coin.name || coin.address, symbol: coin.symbol ?? '',
  decimals: coin.decimals !== undefined && Number.isInteger(coin.decimals) && coin.decimals >= 0 && coin.decimals <= 255 ? coin.decimals : undefined,
  priceUsd: coin.priceUSD ?? 0, marketCapUsd: coin.marketCapUSD ?? 0, liquidityUsd: coin.liquidityUSD,
});

/** Coins for what someone typed: a mint address reads that coin; words, two characters at least, search names and symbols. */
export async function searchCoins(query: string, signal: AbortSignal): Promise<MarketHit[]> {
  const term = query.trim();
  if (!term) return [];
  if (isAddress(term)) {
    const answer = await marketCoin(term, signal);
    return answer?.data.address === term ? [hit(answer.data)] : [];
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(term)) throw new Error('Invalid Solana mint address.');
  if (term.length < 2) return [];
  const seen = new Set<string>(), hits: MarketHit[] = [];
  for (const coin of await marketSearch(term, signal)) {
    if (!isAddress(coin.address) || seen.has(coin.address)) continue;
    seen.add(coin.address);
    hits.push(hit(coin));
  }
  return hits;
}
