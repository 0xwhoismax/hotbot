/** A held coin sells only after price, trades and turnover have all stayed quiet for this long. Null switches the rule off. */
export type InactivityRules = { minutes: number; priceRangePct: number; maxTrades5m: number; maxVolumeCapPct5m: number };
export const INACTIVITY_DEFAULT: InactivityRules = { minutes: 10, priceRangePct: 1, maxTrades5m: 2, maxVolumeCapPct5m: 0.1 };
export const inactivityOf = (rules: InactivityRules | null | undefined) => rules === undefined ? INACTIVITY_DEFAULT : rules;
export function validateInactivity(rules: InactivityRules | null | undefined) {
  if (rules == null) return;
  if (!(Number.isInteger(rules.minutes) && rules.minutes >= 5 && rules.minutes <= 60)) throw new Error('Inactivity needs 5–60 minutes of quiet.');
  if (!(Number.isFinite(rules.priceRangePct) && rules.priceRangePct >= 0.1 && rules.priceRangePct <= 10)) throw new Error('The inactivity price range must be 0.1–10%.');
  if (!(Number.isInteger(rules.maxTrades5m) && rules.maxTrades5m >= 0 && rules.maxTrades5m <= 100)) throw new Error('The inactivity trade limit must be 0–100 trades per 5 minutes.');
  if (!(Number.isFinite(rules.maxVolumeCapPct5m) && rules.maxVolumeCapPct5m >= 0 && rules.maxVolumeCapPct5m <= 10)) throw new Error('The inactivity volume limit must be 0–10% of market cap per 5 minutes.');
}
