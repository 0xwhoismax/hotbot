import { formatNumber, formatPrice } from '@/utils/formatterUtils';

export const sol = (value: number | null | undefined, digits = 3) => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }) + ' SOL';
export const signedSol = (value: number | null | undefined, digits = 3) => value == null ? '—' : (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }) + ' SOL';
export const usd = (value: number | null | undefined) => value == null ? '—' : formatNumber(value, { compact: value >= 10_000, prefix: '$' });
export const price = (value: number | null | undefined) => value == null ? '—' : formatPrice(value, { prefix: '$' });
export const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1) + '%';
export const tone = (value: number | null | undefined) => value == null || Math.abs(value) < 1e-9 ? undefined : value > 0 ? 'up' : 'down';
export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}
export const appHref = (...parts: string[]) => '/app' + (parts.length ? '/' + parts.map(encodeURIComponent).join('/') : '');
