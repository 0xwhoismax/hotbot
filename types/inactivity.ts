
/** No trade for this many seconds sells the rest. `seconds`: a strategy that sets none; `picks`: Settings' quick picks. */
export const NO_TRADE = { seconds: 300, min: 5, max: 3600, picks: [5, 15, 30, 60, 300] } as const;
/** A strategy's no-trade exit in seconds: omitted is the default, null off. */
export const noTradeOf = (rules: { noTradeSeconds?: number | null }) => rules.noTradeSeconds === undefined ? NO_TRADE.seconds : rules.noTradeSeconds;

/** The windows the indexer row counts buys and sells over (`buys_1min`, `buys_5min`, `buys_1h`), in minutes. */
export const DRAIN_MINUTES = [1, 5, 60] as const;
export type DrainMinutes = typeof DRAIN_MINUTES[number];
/** Draining sells the rest when the price at the coin's last trade is `dropPct` or more under its price `minutes` before, with more sells
 *  than buys in those minutes. Omitted is off. */
export type DrainRules = { dropPct: number; minutes: DrainMinutes };
export const DRAIN = { start: { dropPct: 10, minutes: 5 } as DrainRules, min: 1, max: 90, picks: [5, 10, 20, 30] } as const;

export const secondsText = (seconds: number) => seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${+(seconds / 60).toFixed(1)} min` : `${+(seconds / 3600).toFixed(1)} h`;
export const drainText = (rule: DrainRules) => `−${rule.dropPct}% in ${secondsText(rule.minutes * 60)}`;

export function validateQuietExits(rules: { noTradeSeconds?: number | null; drain?: DrainRules }) {
  const seconds = rules.noTradeSeconds, drain = rules.drain;
  if (seconds != null && !(Number.isInteger(seconds) && seconds >= NO_TRADE.min && seconds <= NO_TRADE.max)) throw new Error(`Set no trades for ${secondsText(NO_TRADE.min)} to ${secondsText(NO_TRADE.max)}, or off.`);
  if (drain && !DRAIN_MINUTES.includes(drain.minutes)) throw new Error(`Draining reads ${DRAIN_MINUTES.map(n => secondsText(n * 60)).join(', ')}.`);
  if (drain && !(Number.isFinite(drain.dropPct) && drain.dropPct >= DRAIN.min && drain.dropPct <= DRAIN.max)) throw new Error(`Set the draining drop between ${DRAIN.min}% and ${DRAIN.max}%.`);
}
