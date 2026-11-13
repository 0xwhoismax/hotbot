import type { DemoToken } from './hotbot';

export const PULSE = { hours: 24, missedKept: 60, missedShown: 6, missedPct: 20, stepPct: 10 } as const;

/** Why SniperBot let go of a pick research passed, before a buy, by its reason's opening words: its buy found no room (`room`), its entry
 *  never came, it went quiet, it ran past its entry's cap, or a recheck on fresh data dropped it (a rule, its fit, its pool or a fall);
 *  `other`, a person's skip, a pause, a stop or an error. */
export const LET_GO = { entry: 'Entry never came', room: 'No room', quiet: 'Went quiet', ran: 'Ran away', rules: 'Failed a recheck', other: 'Other' } as const;
export type LetGo = keyof typeof LET_GO;

export type PulseDay = { found: number; passed: number; bought: number; go: Record<LetGo, number> };
/** A let-go pick the desk follows: its price when let go (`fromUsd`), its highest since and its latest. */
export type Missed = { id: string; token: DemoToken; at: number; why: LetGo; fromUsd: number; highUsd: number; lastUsd: number; supply: number | null };
export type NextCoin = { token: DemoToken; score: number; fit: number; buys: number; buyers: number; movePct: number; quietSeconds: number; priceUsd: number; supply: number | null };
export type StrategyPulse = { day: PulseDay; missed: Missed[]; next: NextCoin[]; ranked: number; research?: ResearchPulse };

export const RESEARCH_PULSE = { reportMs: 10 * 60_000 } as const;
export const SCREEN_EXCLUSIONS = { hours: 'Trading hours', activity: 'Activity', invalid: 'Incomplete data', liquidity: 'Liquidity', volume: 'Volume', top10: 'Top 10', market_cap: 'Market cap', max_age: 'Age cap', safety: 'Safety checks', rules: 'Hard rules' } as const;
export type ScreenExclusion = keyof typeof SCREEN_EXCLUSIONS;
/** One full screen of the strategy's streams. Exclusions count the first failing gate, not overlapping rule misses. */
export type ResearchScreen = { at: number; rows: number; candidates: number; young: number; excluded: Partial<Record<ScreenExclusion, number>> };
/** Attempts and distinct researched mints in this window, not the day's funnel. Untracked attempts make distinct a lower bound. */
export type ResearchWindow = { from: number; to: number; attempts: number; distinct: number; untracked: number; completed: number; failed: number; repeatShare: number };
export const RESEARCH_WAIT = { paused: 'Paused', hours: 'Outside trading hours', capacity: 'Waiting for capacity', market: 'Waiting for market data', screen: 'Waiting for a screen', researching: 'Research in progress', queued: 'Research queued', no_matches: 'No screen matches', young: 'Waiting for coin age', eligible: 'Waiting for eligible picks', stalled: 'Research delayed' } as const;
export type ResearchPulse = { at: number; screen: ResearchScreen | null; window: ResearchWindow; lastAttemptAt: number | null; lastProgressAt: number | null; pending: number; oldestPendingAt: number | null; free: number; waiting: keyof typeof RESEARCH_WAIT; pendingMs: number };
export function researchLabel(pulse: ResearchPulse | undefined, now: number, running = true) {
  if (!running) return RESEARCH_WAIT.paused;
  if (!pulse || now - pulse.at > 2 * RESEARCH_PULSE.reportMs) return 'Research status unavailable';
  const label = RESEARCH_WAIT[pulse.waiting];
  if (pulse.waiting !== 'no_matches' || !pulse.screen) return label;
  const first = (Object.entries(pulse.screen.excluded) as [ScreenExclusion, number][]).sort((a, b) => b[1] - a[1])[0];
  return first ? `${label} · ${SCREEN_EXCLUSIONS[first[0]]}` : label;
}
