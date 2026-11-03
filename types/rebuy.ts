import type { RebuyRules } from './hotbot';
/** A close at least this share of the one before holds steady. */
export const STEADY = 0.99;
/** Buys at least this share of the volume over the last two minutes are buyers taking over. */
export const BUY_SHARE = 0.55;
/** Volume at least this many times its rate of the 10 minutes before is picking up. */
export const UPTICK = 1.5;
const NEW_HIGH = 'new high over the sale price with buyers coming in';
/** The settings in a few plain words, for the worker's log and decision record. */
export function rebuyWords(rules: RebuyRules) {
  const steady = rules.steadyCloses === 'weighted' ? '2 steady closes with a confirmation, else 3' : `${rules.steadyCloses} steady closes`;
  const confirm = { none: '', volume: ' · volume uptick', positiveVolume: ' · positive volume uptick', buysOvertake: ' · buys overtaking sells', volumeAndBuys: ' · volume and buys' }[rules.confirmation];
  const pullback = `${steady}${confirm}${rules.chasePct ? ` · within ${rules.chasePct}% of the low` : ''}`;
  const move = { pullback, continuation: `A ${NEW_HIGH}`, either: `${pullback}, or a ${NEW_HIGH}` }[rules.direction ?? 'pullback'];
  return `${move} · ${rules.watchMinutes} min after each sale${rules.afterLoss === 'stop' ? ' · stops after a losing re-buy' : ''}${rules.maxPerCoin ? ` · ${rules.maxPerCoin} re-buys a coin at most` : ''}`;
}
