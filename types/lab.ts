import type { ExitPlan, ExitPlanId } from './exits';
import type { TeamRules } from './hotbot';
import type { StrategyPatch } from './team';

/** What the Lab's data covers: built at `builtAt` from `source`'s worker, research's reads from `from` to `to` (the window starts where the
 *  1-second bars do, `secondsFrom`); `coins` with 1-second bars, and `unpriced` coins research read that have none (left out). */
export type LabMeta = { builtAt: number; source: 'local' | 'prod'; from: number; to: number; solUsd: number; coins: number; unpriced: number; reads: number; secondsFrom: number | null };

/** A read under a rule set: picked, turned down on `check` (a research check key, `fit` or `downhill`), or out for good. */
export type Verdict = 'pick' | 'down' | 'fixed';
/** A position from one read: whether the entry came (`expired` never dipped far enough, `chased` ran past the cap, `nodata` no price after the
 *  read), when it bought and sold, its return and SOL after fees and the pool's depth, why it sold, the highest price after the buy (`peak`, a
 *  change from the fill) and whether it was still held when the prices end (`open`). */
export type Outcome = { status: 'traded' | 'expired' | 'chased' | 'nodata'; entryAt?: number; entryUsd?: number; exitAt?: number; ret: number; sol?: number; stake?: number; reason?: string; peak?: number; open?: boolean };
export type Result = {
  picks: number; traded: number; won: number; expired: number; chased: number; full: number; open: number;
  /** Mean return per trade, and without the best three; the median trade. */ mean: number; meanTrim: number; median: number;
  /** SOL at each trade's own size (the strategy's, by research's confidence and the pool). */ totalSol: number;
  /** 90% of resamples land here (mean per trade). */ low: number; high: number;
  /** The three best trades' returns added up: how much of `totalSol` a few runners carry. */ best3: number;
};

export type LabSide = { rules: TeamRules; dip: number };
export type TipRow = { key: string; steps: number[]; removable: boolean; looserIsLower: boolean };
export type LabTrade = { id: string; mint: string; boughtAt: number; entryPriceUsd: number; inSol: number; pnlSol: number };
export type LabRequest = {
  strategyId?: string;
  since: number; saved: LabSide; draft: LabSide;
  /** Per-coin views for the coin list; every named plan on the draft's picks; each change applied alone to the saved rules (SOL against them);
   *  the curves (profit over the period, the draft's positions since their buy) and every coin by cap and age. */
  coins?: boolean; plans?: boolean; singles?: { key: string; patch: StrategyPatch }[]; curves?: boolean;
  /** The strategy's own sales bought from `tradesFrom`, to set the saved rules' Lab result beside them coin by coin (`Gap`). */
  trades?: { mint: string; boughtAt: number; inSol: number; pnlSol: number }[]; tradesFrom?: number;
  own?: LabTrade[]; ownTrail?: number;
  proposal?: StrategyPatch;
};
export type TipsRequest = Pick<LabRequest, 'strategyId' | 'since' | 'draft'> & { tips: TipRow[] };
/** Real against the Lab on the same coins and dates, for the saved rules. SOL: the Lab's at its own size, the real at what it really put in. */
export type GapPart = { mints: string[]; labSol: number; realSol: number };
export type Gap = { from: number; lab: GapPart; real: GapPart; labOnly: GapPart; realOnly: GapPart & { why: { key: string; count: number; realSol: number }[] }; both: GapPart };
/** One coin as the list shows it: the read that decided it, the draft's verdict and the saved rules' (`before`), the pick's position, the coin
 *  bought at market at its read (`market`) and its highest price within 4 hours of the read (`high`). */
export type CoinView = { mint: string; symbol: string; logo?: string; cap?: number; recheck: boolean; verdict: Verdict; check?: string; readAt: number; before: Verdict | null; out?: Outcome & { full?: boolean }; market: Outcome; high?: number };
export type Down = { check: string; count: number; doubled: number; runners: { mint: string; high: number }[] };
export type TipVariant = { value: number; picks: number; gained: number; lost: number; gainedDoubled: number; totalSol: number; sure: number };
/** A step worth suggesting: 0.05 SOL or more over the draft on the Lab's coins, 10 or more picks, and ahead in 9 of 10 redraws (`sure`). */
export const tipWorth = (variant: TipVariant, draftSol: number) => variant.totalSol - draftSol >= 0.05 && variant.picks >= 10 && variant.sure >= 0.9;
export type Tip = { key: string; blocked: number; blockedDoubled: number; variants: TipVariant[] };
export type OverTime = { at: number; total: number; mint: string; symbol: string; logo?: string; ret: number; sol: number }[];
export type SinceBuy = { minute: number; mean: number; median: number; p25: number; p75: number; held: number }[];
export type Segment = { label: string; coins: number; picks: number; high1h: number; doubled: number; halved: number; market: number };
export type Curves = { saved: OverTime; draft: OverTime; since: SinceBuy; cap: Segment[]; age: Segment[] };
export type OwnPlans = { covered: number; actual: number; rows: { id: ExitPlanId | null; name: string; sol: number }[] };
export type LabReply = { kind: 'main'; now: Result; next: Result; proposal?: { key: string; result: Result } | null; coins?: CoinView[]; down: Down[]; plans?: { id: string; result: Result }[];
  singles?: { key: string; totalSol: number | null }[]; gap?: Gap; curves?: Curves; own?: OwnPlans }
  | { kind: 'tips'; tips: Tip[] };

export type Anchor = { kind: 'bought'; at: number; priceUsd: number; label: string } | { kind: 'research' | 'picked'; at: number; label: string };
/** `anchor` null: the coin's reads under the draft only, so the page can pick where to start. */
export type CoinRequest = { mint: string; anchor: Anchor | null; rules: TeamRules; dip: number; plan?: ExitPlan; trail?: number };
export type ReplayFill = { at: number; share: number; priceUsd: number; reason: string; ret: number };
export type CoinReplay = {
  status: 'traded' | 'expired' | 'chased' | 'nodata';
  /** The buy before costs. */ entry?: { at: number; priceUsd: number };
  sales: ReplayFill[];
  /** Return on the position after fees and the pool's depth; `open` when part of it is still held at the last price (marked there). */
  ret: number; open: boolean;
  /** The last bar's time (ms): long before the data's end, the coin stopped trading. */ lastAt?: number;
  /** Highest price after the buy as a change from the buy, and when. */ peak?: { pct: number; at: number };
  /** Highest price after the last sale as a change from its price, and the minutes of bars that read. */ after?: { pct: number; minutes: number };
  /** The share of the hold that ran on 1-second bars (the rest on minute bars). */ seconds?: number;
};
export type CoinAnswer = { known: boolean; symbol?: string; logo?: string; supply?: number | null; liquidity?: number;
  reads: { at: number; priceUsd: number; verdict: Verdict; check?: string }[]; result: CoinReplay | null; plans: { id: ExitPlanId; replay: CoinReplay }[] };
/** Coins the Lab's data holds that match a search. */
export type CoinHit = { mint: string; symbol: string; logo?: string; firstRead: number; reads: number };

/** Research check keys (`researchCriteria`) to the strategy rules that set them. */
const CHECK_RULES: Record<string, string[]> = {
  liquidity: ['minLiquidityUsd'], volume: ['minVolume24hUsd'], market_cap: ['minMarketCapUsd', 'maxMarketCapUsd'], age: ['minAgeMinutes'], holders: ['maxTop10Percent'], max_age: ['maxAgeMinutes'],
  move_1h: ['minMove1hPct'], max_move_1h: ['maxMove1hPct'], buyers_1h: ['minBuyers1h'], entry_score: ['minEntryScore'], turnover: ['minTurnover1h', 'maxTurnover1h'],
  buy_sell: ['minBuySellRatio'], drawdown: ['maxDrawdownPct'], holders_count: ['minHolders'], lp_burn: ['minLpBurnPct'], dev: ['shield'], insiders: ['shield'],
  bundlers: ['shield'], snipers: ['shield'], self_made_pool: ['shield'], pro_holdings: ['shield'], real_trading: ['shield'], launch_jump: ['shield'], layered_launch: ['shield'], mayhem_launch: ['shield'], transfer_fee: ['shield'], smooth_climb: ['shield'], top10_held: ['shield'], bundlers_bought: ['shield'], recent_crash: ['hourCrashLimit'],
};
export const rulesOfCheck = (check: string | undefined) => check ? CHECK_RULES[check] ?? [] : [];

/** Research check keys in plain words. */
const CHECK_LABELS: Record<string, string> = { fit: 'Fit under the pass mark', scam_flag: 'Scam flag', rugger: 'Rugger deployer', meteora_launch: 'Meteora launch', self_made_pool: 'Self-made pool', launch_jump: 'Launch jump', layered_launch: 'Layered launch', mayhem_launch: 'Mayhem launch', transfer_fee: 'Transfer fee', smooth_climb: 'Smooth climb', top10_held: 'Top 10 holdings', bundlers_bought: 'Bundler buys', pro_holdings: 'Few pro holders', recent_crash: 'Recent crash', pro_traded_launch: 'Pro-traded launch', authorities: 'Mint or freeze authority', honeypot: 'Honeypot', real_trading: 'No real trading', liquidity: 'Liquidity', volume: 'Volume', market_cap: 'Market cap', age: 'Age', holders: 'Top 10 holders', max_age: 'Too old', entry_score: 'Entry score', turnover: 'Turnover', holder_basis: "Holders' entry", lp_burn: 'Burned liquidity', max_move_1h: 'Ran too far in the hour', move_1h: '1h move' };
/** A research check key in plain words. */
export const checkLabel = (check: string) => CHECK_LABELS[check] ?? check.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
