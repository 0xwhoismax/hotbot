/** When a strategy may buy (`TeamRules.tradingHours`, `tradingDays`): new picks, armed entries and re-buys wait outside the window, exits
 *  always run. One rule for the worker's screen and entries, the Lab's replay and Settings. Hours and days are UTC. */
import type { TeamRules } from './hotbot';

/** UTC hours `from` (inclusive) to `to` (exclusive); `from` after `to` runs past midnight. */
export type TradingHours = { from: number; to: number };
export type Schedule = Pick<TeamRules, 'tradingHours' | 'tradingDays'>;
/** Weekdays as `Date.getUTCDay()` numbers, Monday first, as Settings lists them. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** A new window from Settings. */
export const HOURS_START: TradingHours = { from: 8, to: 20 };
const hh = (hour: number) => String(hour).padStart(2, '0');
export const hoursText = ({ from, to }: TradingHours) => `${hh(from)}–${hh(to)} UTC`;
/** Days in Monday-first order, a run of three or more as a range (Mon–Fri). */
export function daysText(days: readonly number[]) {
  const runs: number[][] = [];
  WEEKDAYS.forEach((day, i) => { if (!days.includes(day)) return; const run = runs[runs.length - 1]; if (run && i > 0 && days.includes(WEEKDAYS[i - 1])) run.push(day); else runs.push([day]); });
  return runs.map(run => run.length >= 3 ? `${WEEKDAY_NAMES[run[0]]}–${WEEKDAY_NAMES[run[run.length - 1]]}` : run.map(day => WEEKDAY_NAMES[day]).join(', ')).join(', ');
}
/** The window in a few words, or null when the strategy buys at any time. */
export function scheduleText(rules: Schedule) {
  const parts = [rules.tradingHours && hoursText(rules.tradingHours), rules.tradingDays && daysText(rules.tradingDays)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
/** Throws on a window people can't set: whole hours 0–23 that differ; one to six distinct weekdays. */
export function validateSchedule(rules: Schedule) {
  const hour = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23;
  if (rules.tradingHours && !(hour(rules.tradingHours.from) && hour(rules.tradingHours.to) && rules.tradingHours.from !== rules.tradingHours.to)) throw new Error('Set trading hours as two different whole UTC hours from 0 to 23.');
  const days = rules.tradingDays;
  if (days && !(days.length >= 1 && days.length < 7 && new Set(days).size === days.length && days.every(day => Number.isInteger(day) && day >= 0 && day <= 6))) throw new Error('Pick one to six trading days.');
}
