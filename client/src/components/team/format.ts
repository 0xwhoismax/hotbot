import { getBase58Encoder } from '@solana/kit';
import { formatNumber, formatPrice } from '@/utils/formatterUtils';

/** `value` as a figure with `digits` decimals shows it, so a value that rounds to zero is zero: it gets no sign and no colour. */
const shown = (value: number, digits: number) => Number(value.toFixed(digits));

export const sol = (value: number | null | undefined, digits = 3) => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }) + ' SOL';
export const signedSol = (value: number | null | undefined, digits = 3) => {
  if (value == null) return '—';
  const at = shown(value, digits);
  return (at > 0 ? '+' : at < 0 ? '−' : '') + Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }) + ' SOL';
};
export const usd = (value: number | null | undefined) => value == null ? '—' : formatNumber(value, { compact: value >= 10_000, prefix: '$' });
export const signedUsd = (value: number | null | undefined) => {
  if (value == null) return '—';
  const text = formatNumber(value, { compact: Math.abs(value) >= 10_000, prefix: '$' });
  return (value > 0 && /[1-9]/.test(text) ? '+' : '') + text;
};
export const price = (value: number | null | undefined) => value == null ? '—' : formatPrice(value, { prefix: '$' });
export const pct = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '—';
  const at = shown(value, 1);
  return (at > 0 ? '+' : at < 0 ? '−' : '') + Math.abs(value).toFixed(1) + '%';
};
/** Up, down or neither. Give `digits` when the value is shown with that many decimals, so a figure that shows as zero has no tone. */
export const tone = (value: number | null | undefined, digits?: number) => value == null || (digits === undefined ? Math.abs(value) < 1e-9 : shown(value, digits) === 0) ? undefined : value > 0 ? 'up' : 'down';
export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}
export const appHref = (...parts: string[]) => '/app' + (parts.length ? '/' + parts.map(encodeURIComponent).join('/') : '');

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
/** Solscan's page for an address (`account`) or a transaction (`tx`), only for a value that decodes from base58 to the length of its kind:
 *  a link built from anything else could point anywhere. */
export function solscan(kind: 'account' | 'tx', value: string | null | undefined) {
  if (!value || value.length > 90 || !BASE58.test(value)) return null;
  try { if (getBase58Encoder().encode(value).length !== (kind === 'tx' ? 64 : 32)) return null; } catch { return null; }
  return `https://solscan.io/${kind}/${value}`;
}
