import { formatMarketCap, formatPrice } from '@/utils/formatterUtils';
export type PriceUnit = 'price' | 'marketCap';
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
