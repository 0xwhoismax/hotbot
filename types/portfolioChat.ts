import { ASK_MS, AUTONOMY, type Autonomy, type Mandate } from './portfolio';

/** `max` messages kept per portfolio, the oldest dropped first; the page reads the newest `page` and pages back. A turn reads the
 *  conversation from `historyFrom`: the last `window` to `window + step - 1` messages, so its start moves `step` messages at a time and
 *  the cached prefix holds for several turns. `text` and `answer` are the characters of a message and of an answer. An answer carries at
 *  most `proposals`, each open for `proposalMs`. The context reads at most `journal` journal lines, `evidence` facts per held coin, `sold`
 *  sold coins and `lessons` lessons.
 *  - `stopMargin`: a new stop floor stays this share under the worth now, so applying it never sells everything at once.
 *  - `markMs`: a chat sale fills only at a mark this new. The agents service saves a quiet coin's mark every 10 minutes and checks it
 *    every minute, so an older mark means its check stopped.
 *  - `perDay`: one person's chat messages in a UTC day. The composer shows what is left under `fewLeft`. */
export const CHAT = {
  max: 100, page: 30, window: 20, step: 10, text: 1000, answer: 1500, proposals: 3, proposalMs: ASK_MS, journal: 12, evidence: 4, sold: 6, lessons: 6,
  stopMargin: 0.1, markMs: 12 * 60_000, perDay: 50, fewLeft: 10,
} as const;

export type LimitsChange = Partial<Pick<Mandate, 'autonomy' | 'perCoinSol' | 'tradesPerDay' | 'stopAllSol'>>;
export const LIMIT_KEYS = ['autonomy', 'perCoinSol', 'tradesPerDay', 'stopAllSol'] as const;

/** Whether a limits change lets HOTBOT risk more: more autonomy, more SOL in one coin, more trades a day, or a lower stop floor (0 turns
 *  it off). The page gives such a change the warning tint. */
export function raisesRisk(key: typeof LIMIT_KEYS[number], from: LimitsChange[typeof key], to: LimitsChange[typeof key]): boolean {
  if (from === undefined || to === undefined) return false;
  if (key === 'autonomy') return AUTONOMY.indexOf(to as Autonomy) > AUTONOMY.indexOf(from as Autonomy);
  return key === 'stopAllSol' ? (to as number) < (from as number) : (to as number) > (from as number);
}
