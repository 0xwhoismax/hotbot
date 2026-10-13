/** The team performance report as the client reads it. Browser-safe: numbers and labels only. */

export type PerformanceSource = 'prod' | 'local';
/** Minutes after a decision the report reads. */
export const PERFORMANCE_WINDOWS = [5, 15, 60, 240] as const;
export const PERFORMANCE_BAR = { fell: 0.5, dead: 0.8, doubled: 1, caught: 0.7, early: 0.5, right: 0.3, verdict: 0.2 } as const;

/** An exit reason with its numbers taken out, so "Trailing stop: 15% below the high" and "… 10% …" are one family (as the lab groups them). */
export const exitFamily = (reason: string) => reason.replace(/\s*·.*$/, '').replace(/^You archived .*/, 'You archived the strategy').replace(/[0-9][0-9.,]*%|\$[0-9][0-9.,]*|[0-9]+ (min|h|hours?|minutes?)\b|[0-9]+×/g, '…').replace(/ +/g, ' ').trim();

/** What a coin did after a moment, from its snapshots: the highest and lowest price within each window as a multiple of the price then,
 *  the lowest liquidity and the last snapshot within 24h, the day's extremes, and how many snapshots the first 4h hold. */
export type After = { n: number; hi: number[]; lo: number[]; minLiq: number | null; lastAt: number | null; hi24: number; lo24: number };
/** How a set of decisions turned out, over the coins with snapshots after the decision (`covered`). */
export type Outcome = { n: number; covered: number; medianHi: number[]; up50: number; doubled: number; fell50: number; dead: number };
export type RejectRow = Outcome & { key: string; label: string; scam: boolean };
/** Research passes by the holders' entry band at the verdict (top 25 holders' buy VWAP as a share of the price), with the trades
 *  those passes became: buys, full sales, win rate, realised P&L and the median result. */
export type HoldersEntryRow = Outcome & { key: string; label: string; bought: number; closed: number; winRate: number; pnlSol: number; medianGain: number };
/** `lastAt`: the latest sale in the group, so an exit the code no longer makes shows when it last happened; `example`: its most common reason as written. */
export type ExitGroup = { key: string; trades: number; covered: number; lastAt: number; example: string; winRate: number; pnlSol: number; medianGain: number; medianRun: number; medianCaptured: number; caught: number; afterHi: number[]; early: number; right: number };
export type BestEntry = { item: string; symbol: string | null; mint: string; strategy: string | null; strategyId: string | null; plan: string | null; mode: string | null; boughtAt: number | null; entry: number; peak: number; run: number; minutesToPeak: number | null; gain: number | null; pnlSol: number | null; exitReason: string | null; status: 'closed' | 'held' };
export type StrategyRow = { id: string; name: string; preset: string | null; plan: string | null; mode: string | null; label: string; researched: number; passed: number; bought: number; held: number; closed: number; pnlSol: number; winRate: number; passedAfter: Outcome; rejectedAfter: Outcome; lastAt: number; exits: (ExitGroup & { owner: string })[] };
export type VerdictGroup = { n: number; covered: number; right: number; wrong: number; median4h: number; medianLow4h: number };
export type PerformanceReport = {
  source: PerformanceSource; generatedAt: number; since: number; hours: number; windows: readonly number[]; bar: typeof PERFORMANCE_BAR;
  db: { path: string; snapshots: { rows: number; coins: number; from: number | null; to: number | null }; decisions: { rows: number; from: number | null; to: number | null; worker: number; backfill: number } };
  now: { lastSnapshotAt: number | null; lastDecisionAt: number | null; lastHour: Record<string, number>; strategiesActive: number; held: number; researched: number; passed: number; bought: number; closed: number; pnlSol: number; winRate: number; coverage: number };
  research: { passed: Outcome; rejected: Outcome; byCheck: RejectRow[]; scams: Outcome & { byReason: RejectRow[] }; holdersEntry: HoldersEntryRow[] };
  best: BestEntry[];
  strategies: StrategyRow[];
  exits: { families: (ExitGroup & { owner: string })[]; owners: ExitGroup[]; plans: ExitGroup[] };
  trader: { verdicts: (VerdictGroup & { by: string })[]; all: VerdictGroup };
};
