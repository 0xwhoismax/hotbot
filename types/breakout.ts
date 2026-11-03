/** SniperBot's breakout entry (`TeamRules.breakout`), one rule for the worker's entry watch and the Lab's replay. After research passes a
 *  coin it waits up to the arm time for a quiet range to break: at a trade in minute m, the range is the highest and lowest trade price over
 *  the `minutes` complete minutes before m (at least one trade there); it is quiet when the high is within `rangePct` of the low. It buys when
 *  the range is quiet, the trade's price is over its high and at least `buyers` distinct wallets bought in the last `BREAKOUT.buyersMs`. */
export type BreakoutRules = { minutes: number; rangePct: number; buyers: number };
export const BREAKOUT = { minutes: [2, 60], rangePct: [2, 100], buyers: [0, 20], buyersMs: 60_000 } as const;
/** The choices Settings offers; a breakout switched on starts at `BREAKOUT_START`. */
export const BREAKOUT_CHOICES = { minutes: [3, 5, 10, 20], rangePct: [5, 10, 20, 40], buyers: [0, 3, 6] } as const;
export const BREAKOUT_START: BreakoutRules = { minutes: 10, rangePct: 10, buyers: 3 };
export const breakoutText = (rule: BreakoutRules) => `Buys a break of a ${rule.minutes}-min range under ${rule.rangePct}%${rule.buyers ? ` with ${rule.buyers}+ buyers` : ''}`;
/** Throws on settings people can't set. */
export function validateBreakout(rule: BreakoutRules) {
  const within = (n: number, [min, max]: readonly [number, number]) => Number.isFinite(n) && n >= min && n <= max;
  if (!within(rule.minutes, BREAKOUT.minutes) || !Number.isInteger(rule.minutes)) throw new Error(`Set the breakout range over ${BREAKOUT.minutes[0]}–${BREAKOUT.minutes[1]} whole minutes.`);
  if (!within(rule.rangePct, BREAKOUT.rangePct)) throw new Error(`Set the quiet range between ${BREAKOUT.rangePct[0]}% and ${BREAKOUT.rangePct[1]}%.`);
  if (!within(rule.buyers, BREAKOUT.buyers) || !Number.isInteger(rule.buyers)) throw new Error(`Set the breakout's buyers between ${BREAKOUT.buyers[0]} and ${BREAKOUT.buyers[1]}.`);
}
