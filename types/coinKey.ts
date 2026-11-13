import { HOUR_MS } from './hours';
import { type DecisionBot } from './team';
const KEY = /^[0-9a-z]{7}[pl][0-9a-z]{6}$/;
const hourOf = (at: number) => Math.floor(at / HOUR_MS) * HOUR_MS;
/** A coin reference as links, events and the Agent API carry it: `ck` while open, `ck.N` once closed (N: base-36 hours from the found hour
 *  to the close hour, `closedRef`), a `teamItems` id for a coin from before keys, and while picks are rows both at once, `<ck>~<id>`
 *  (`coinLink`). `closedHour`: the start of the hour a `ck.N` names, whose pack holds the close. */
export function readCoinRef(ref: string): { ck: string | null; id: string | null; closedHour: number | null } {
  const [head = '', id] = ref.split('~', 2), [ck = '', n] = head.split('.', 2), hours = n ? parseInt(n, 36) : NaN;
  return KEY.test(ck) ? { ck, id: id || null, closedHour: Number.isInteger(hours) && hours >= 0 ? hourOf(keyFoundAt(ck)) + hours * HOUR_MS : null } : { ck: null, id: head, closedHour: null };
}
/** The coin a reference names, alike in each of its forms: its key (open, closed or linked), else its `teamItems` id. */
export function refCoin(ref: string) {
  const { ck, id } = readCoinRef(ref);
  return ck ?? id ?? ref;
}
/** When a key's coin was found, ms (to the second). */
export const keyFoundAt = (ck: string) => parseInt(ck.slice(0, 7), 36) * 1000;
/** The portfolio a key's coin was picked for. */
export const keyMode = (ck: string): 'paper' | 'live' => ck[7] === 'l' ? 'live' : 'paper';
export const FEED_REF = 'feed:';
export const SOLD_REF = 'sold:';
export const PANORAMA_REF = 'panorama:';
export const DECISIONS_REF = 'decisions:';
export const decisionsRef = (bot: DecisionBot, strategyId: string | null) => `${DECISIONS_REF}${bot}:${strategyId ?? ''}`;
/** A coin's link and answer reference: its key and its id while picks are rows, its id alone for a coin from before keys. */
export const coinLink = (coin: { id: string; ck?: string | null }) => coin.ck ? `${coin.ck}~${coin.id}` : coin.id;
