import type { TokenData } from '@/types/dataApiTypes';
import { formatMarketCap, formatPrice } from '@/utils/formatterUtils';
export type PriceUnit = 'price' | 'marketCap';
export function tokenSupply(token: TokenData | null): number | null {
  const supply = token?.circulating_supply ?? token?.total_supply;
  if (typeof supply === 'number' && Number.isFinite(supply) && supply > 0) return supply;
  if (token && token.market_cap > 0 && token.price > 0) {
    const ratio = token.market_cap / token.price;
    if (Number.isFinite(ratio) && ratio > 0) return ratio;
  }
  return null;
}
export function displayPrice(rawPriceUsd: number, unit: PriceUnit, supply: number | null): number | null {
  if (!Number.isFinite(rawPriceUsd) || rawPriceUsd < 0) return null;
  return unit === 'price' ? rawPriceUsd : supply && supply > 0 ? rawPriceUsd * supply : null;
}
export function formatTokenPrice(priceUsd: number | null | undefined, unit: PriceUnit, supply: number | null | undefined): string {
  const value = priceUsd == null ? null : displayPrice(priceUsd, unit, supply ?? null);
  return unit === 'marketCap' ? formatMarketCap(value) : formatPrice(value, { prefix: '$' });
}
export function rawPrice(displayValue: number, unit: PriceUnit, supply: number | null): number | null {
  if (!Number.isFinite(displayValue) || displayValue < 0) return null;
  return unit === 'price' ? displayValue : supply && supply > 0 ? displayValue / supply : null;
}
