import type { RebuyRules } from './hotbot';

const M = 60_000;
/** A close at least this share of the one before holds steady. */
export const STEADY = 0.99;
/** The minutes the watch reads, on one grid (index i is one minute; a minute without trades carries the last close with volume 0 and
 *  `real` 0): the close, the open, the volume, and the buy and sell volume (undefined where the minute has none). */
export type RebuyBars = { close: ArrayLike<number>; open: ArrayLike<number>; volume: ArrayLike<number>; real: ArrayLike<number>; buy(i: number): number | undefined; sell(i: number): number | undefined };
/** One watch's state: closes held steady in a row, and the lowest close since the sale with its minute. */
export type RebuyWatch = { held: number; low: number; lowAt: number };
export const rebuyWatch = (): RebuyWatch => ({ held: 0, low: Infinity, lowAt: -1 });
export type RebuyCheck = Pick<RebuyRules, 'confirmation' | 'chasePct'> & { steadyCloses: number | 'weighted' };

/** Whether minute i is one the watch judges: a minute with trades, and trades in 3 of the last 5. */
export function rebuyLive(bars: Pick<RebuyBars, 'real'>, i: number) {
  if (!bars.real[i]) return false;
  let live = 0;
  for (let k = Math.max(0, i - 4); k <= i; k++) live += bars.real[k];
  return live >= 3;
}

export function rebuyMinute(rule: RebuyCheck, w: RebuyWatch, bars: RebuyBars, i: number): string | null {
  const { close: c, open: o, volume: v } = bars;
  if (c[i] < w.low) { w.low = c[i]; w.lowAt = i; }
  w.held = c[i] >= STEADY * c[i - 1] ? w.held + 1 : 0;
  const weighted = rule.steadyCloses === 'weighted', k = weighted ? 2 : rule.steadyCloses as number;
  if (w.held < k) return null;
  const share = (m: number) => { const b = bars.buy(m), s = bars.sell(m); return b !== undefined && s !== undefined && b + s > 0 ? b / (b + s) : NaN; };
  // Buys overtaking sells: the buy share over the last two minutes, against the share at the lowest close since the sale.
  const buys = () => (share(i) + share(i - 1)) / 2 >= 0.55 && share(w.lowAt) < 0.5;
  const positive = () => {
    let buy = 0, sell = 0, before = 0, green = true;
    for (let m = i - k + 1; m <= i; m++) { buy += bars.buy(m) ?? NaN; sell += bars.sell(m) ?? NaN; green &&= c[m] >= o[m]; }
    for (let m = 1; m <= 10; m++) before += bars.buy(i - k - m + 1) ?? 0;
    return green && buy > sell && buy / k >= 1.5 * before / 10;
  };
  const volume = () => {
    let now = 0, before = 0;
    for (let m = i - k + 1; m <= i; m++) now += v[m];
    for (let m = i - k - 9; m <= i - k; m++) before += v[Math.max(0, m)];
    return now / k >= 1.5 * before / 10;
  };
  const said: string[] = [];
  if (weighted) {
    const up = positive(), over = buys();
    if (Math.min(w.held, 3) + (up ? 1 : 0) + (over ? 1 : 0) < 3) return null;
    said.push(`${Math.min(w.held, 3)} steady closes${up ? ', positive volume uptick' : ''}${over ? ', buys overtaking sells' : ''}`);
  } else said.push(`${k} steady closes`);
  w.held = 0;
  switch (rule.confirmation) {
    case 'volume': if (!volume()) return null; said.push('volume picking up'); break;
    case 'positiveVolume': if (!positive()) return null; said.push('positive volume uptick'); break;
    case 'buysOvertake': if (!buys()) return null; said.push('buys overtaking sells'); break;
    case 'volumeAndBuys': if (!volume() || !buys()) return null; said.push('volume and buys picking up'); break;
    case 'none': break;
  }
  if (rule.chasePct > 0 && c[i] > (1 + rule.chasePct / 100) * w.low) return null;
  return said.join(' · ');
}

/** When the watch after a sale ends: the last minute it judges closes by then. */
export const rebuyUntil = (rules: Pick<RebuyRules, 'watchMinutes'>, soldAt: number) => soldAt + rules.watchMinutes * M;
/** Why a strategy may not buy a coin again after its latest sale, or null when it may: `closes` its closed trades of the coin (the first buy and
 *  each re-buy), `lostRebuy` the latest of them a re-buy that lost. */
export function rebuyStop(rules: Pick<RebuyRules, 'afterLoss' | 'maxPerCoin'>, closes: number, lostRebuy: boolean): string | null {
  if (rules.maxPerCoin > 0 && closes - 1 >= rules.maxPerCoin) return `Bought again ${closes - 1}× already, the most for one coin`;
  if (rules.afterLoss === 'stop' && lostRebuy) return 'A re-buy lost, so this coin is not bought again';
  return null;
}
/** The settings in a few plain words, for the worker's log and decision record. */
export function rebuyWords(rules: RebuyRules) {
  const steady = rules.steadyCloses === 'weighted' ? '2 steady closes with a confirmation, else 3' : `${rules.steadyCloses} steady closes`;
  const confirm = { none: '', volume: ' · volume uptick', positiveVolume: ' · positive volume uptick', buysOvertake: ' · buys overtaking sells', volumeAndBuys: ' · volume and buys' }[rules.confirmation];
  return `${steady}${confirm}${rules.chasePct ? ` · within ${rules.chasePct}% of the low` : ''} · ${rules.watchMinutes} min after each sale${rules.afterLoss === 'stop' ? ' · stops after a losing re-buy' : ''}${rules.maxPerCoin ? ` · ${rules.maxPerCoin} re-buys a coin at most` : ''}`;
}
