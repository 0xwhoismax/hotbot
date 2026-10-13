/** Every research check a strategy can set, as Settings and the Lab show it: its sentence, its round steps and the must-have it belongs to. */
import type { MustHave } from '../../../../types/team';
import type { NumKind } from './Parts';

export type CheckKey = 'minAgeMinutes' | 'maxAgeMinutes' | 'minLiquidityUsd' | 'minVolume24hUsd' | 'maxTop10Percent' | 'minMarketCapUsd' | 'maxMarketCapUsd'
  | 'minMove1hPct' | 'maxMove1hPct' | 'minBuyers1h' | 'minEntryScore' | 'minTurnover1h' | 'maxTurnover1h' | 'minBuySellRatio' | 'maxDrawdownPct' | 'minHolders' | 'minLpBurnPct'
  | 'hourCrashLimit';
/** `shield` rows live on the ShieldBot tab, the rest on Search. */
export type CheckGroup = 'size' | 'activity' | 'safety' | 'shield';
/** One research check as a sentence with its number in it. Checks without `start` are always on; the rest are added at `start` and can be removed. */
export type CheckRow = { key: CheckKey; group: CheckGroup; name: string; kind: NumKind; before: string; after: string; steps: number[]; start?: number; min?: number; max?: number; integer?: boolean; must?: MustHave; noReplay?: true; off?: string };
const usd = [10e3, 20e3, 50e3, 100e3, 250e3, 1e6];
export const CHECKS: CheckRow[] = [
  { key: 'minAgeMinutes', group: 'size', name: 'Min age', kind: 'min', before: 'Older than ', after: '', steps: [0, 10, 30, 90, 360, 1440, 10080], integer: true, max: 525_600, must: 'age' },
  { key: 'minLiquidityUsd', group: 'size', name: 'Liquidity', kind: 'usd', before: 'Liquidity $', after: '+', steps: usd, must: 'liquidity' },
  { key: 'minVolume24hUsd', group: 'activity', name: 'Volume', kind: 'usd', before: 'Traded a day $', after: '+', steps: usd, must: 'volume' },
  { key: 'maxTop10Percent', group: 'safety', name: 'Top 10 holders', kind: 'pct', before: 'Top 10 hold under ', after: '%', steps: [30, 40, 50, 60, 80], min: 1, max: 100, must: 'top10' },
  { key: 'maxAgeMinutes', group: 'size', name: 'Max age', kind: 'min', before: 'Younger than ', after: '', steps: [60, 120, 360, 1440, 4320], start: 1440, integer: true, min: 1, max: 525_600, must: 'maxAge' },
  { key: 'minMarketCapUsd', group: 'size', name: 'Min market cap', kind: 'usd', before: 'Market cap over $', after: '', steps: [25e3, 100e3, 250e3, 1e6, 10e6], start: 1e6, min: 1, must: 'marketCap' },
  { key: 'maxMarketCapUsd', group: 'size', name: 'Max market cap', kind: 'usd', before: 'Market cap under $', after: '', steps: [100e3, 1e6, 5e6, 20e6, 100e6], start: 5e6, min: 1, must: 'marketCap' },
  { key: 'minMove1hPct', group: 'activity', name: '1h move', kind: 'pct', before: 'Up ', after: '%+ in the hour', steps: [2, 5, 10, 25], start: 5, min: 0.1 },
  { key: 'maxMove1hPct', group: 'activity', name: '1h move range', kind: 'pct', before: 'Up at most ', after: '% in the hour', steps: [300, 500, 1000], start: 500, min: 1 },
  { key: 'minBuyers1h', group: 'activity', name: 'Buyers', kind: 'count', before: '', after: '+ buyers in the hour', steps: [20, 50, 100, 250], start: 50, integer: true, min: 1 },
  { key: 'minEntryScore', group: 'activity', name: 'Entry score', kind: 'count', before: 'Entry model rank ', after: '+ of 100', steps: [50, 75, 90, 95], start: 90, integer: true, min: 0, max: 100 },
  // Turnover: 2–10× its cap traded in the hour marks a coin that is moving; under 1× and over 20× sit stale. A hard band.
  { key: 'minTurnover1h', group: 'activity', name: 'Turnover floor', kind: 'x', before: 'Traded at least ', after: '× its cap in the hour', steps: [1, 2, 3, 5], start: 2, min: 0.01 },
  { key: 'maxTurnover1h', group: 'activity', name: 'Turnover ceiling', kind: 'x', before: 'Traded under ', after: '× its cap in the hour', steps: [10, 20, 50], start: 10, min: 0.01 },
  { key: 'minBuySellRatio', group: 'activity', name: 'Buy pressure', kind: 'x', before: 'Buys ', after: '× the sells', steps: [1, 1.2, 1.5, 2], start: 1.2, min: 0.1 },
  { key: 'maxDrawdownPct', group: 'activity', name: 'Drawdown', kind: 'pct', before: 'Under ', after: '% off its high', steps: [30, 50, 70], start: 50, min: 1, max: 99 },
  { key: 'minHolders', group: 'safety', name: 'Holders', kind: 'count', before: '', after: '+ holders', steps: [50, 100, 250, 1000], start: 100, integer: true, min: 1 },
  { key: 'minLpBurnPct', group: 'shield', name: 'Burned liquidity', kind: 'pct', before: 'Liquidity burned ', after: '%+', steps: [25, 50, 90, 100], start: 50, min: 1, max: 100, must: 'lpBurn' },
  { key: 'hourCrashLimit', group: 'shield', name: 'Recent crashes', kind: 'pct', before: 'Skip a 1-minute fall of ', after: '% or more in the last hour', steps: [20, 30, 50, 70, 90], start: 30, min: 1, max: 99 },
];
export const CHECK_GROUPS: { id: CheckGroup; title: string }[] = [{ id: 'size', title: 'Size and age' }, { id: 'activity', title: 'Activity' }, { id: 'safety', title: 'Holders' }];
