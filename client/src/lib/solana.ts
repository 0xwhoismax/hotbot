export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const PLATFORM_FEE_RATE = 0.01;
const FIXED_HEADROOM = 0.0023;
/** Buy input leaves room for platform fee, sender tip, priority fee and refundable rent. */
export function getMaxSpendableSol(balance: number): number {
  return Number.isFinite(balance) ? Math.max(0, (balance - FIXED_HEADROOM) / (1 + PLATFORM_FEE_RATE)) : 0;
}
