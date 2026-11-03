import type { ExitPlan, ExitPlanId } from './exits';
import type { TeamRules } from './hotbot';
import type { StrategyPatch } from './team';
import { EXTRA_CHECKS, FINAL } from './hotbotResearch';
import { SHIELD_ROWS } from './shield';

/** What the Lab's data covers: built at `builtAt` from `source`'s worker, reads from `from` to `to` (the window starts where the indexer's
 *  coverage does; its first trade is at `tradesFrom`); `coins` with prices, and `unpriced` coins that have none, or whose prices disagree with
 *  their reads' (left out). */
export type LabMeta = { builtAt: number; source: 'local' | 'prod'; from: number; to: number; solUsd: number; coins: number; unpriced: number; reads: number; tradesFrom: number | null };
/** The whole days the Lab's data covers: the "last days" its replays speak of. */
export const labDays = (meta: Pick<LabMeta, 'builtAt' | 'from'>) => Math.max(1, Math.round((meta.builtAt - meta.from) / 86_400_000));

/** A read under a rule set: picked, turned down on `check` (a research check key, `fit` or `downhill`), or out for good. */
export type Verdict = 'pick' | 'down' | 'fixed';
export type EntryStatus = 'traded' | 'expired' | 'chased' | 'dropped' | 'nodata' | 'quiet';
/** A position from one read: whether the entry came (`expired` never dipped far enough, `chased` ran past the cap, `dropped` the recheck of a
 *  waiting entry turned it down when it came due, `nodata` no price after the read, `quiet` too little trading for SniperBot's activity check), when it bought and sold, its return and SOL after fees and the pool's depth,
 *  why it sold, the highest price after the buy (`peak`, a change from the fill), whether it was still held when the prices end (`open`), and the
 *  re-buys of the coin after it (`rebuys`, each sold before the next). */
export type Outcome = { status: EntryStatus; entryAt?: number; entryUsd?: number; exitAt?: number; ret: number; sol?: number; stake?: number; reason?: string; peak?: number; open?: boolean;
  rebuys?: Outcome[] };
export type Result = {
  /** `traded` and `won` count every position, re-buys (`rebuys`) included; `quiet`: picks SniperBot's activity check kept out; `dropped`:
   *  waiting entries the recheck turned down when they came due. */
  picks: number; traded: number; won: number; expired: number; chased: number; quiet: number; dropped: number; full: number; open: number; rebuys: number;
  /** Mean return per trade, and without the best three; the median trade. */ mean: number; meanTrim: number; median: number;
  /** SOL at each trade's own size (the strategy's, by research's confidence and the pool). */ totalSol: number;
  /** 90% of resamples land here (mean per trade). */ low: number; high: number;
  /** The three best trades' returns added up: how much of `totalSol` a few runners carry. */ best3: number;
};

export type LabSide = { rules: TeamRules; dip: number };
export type TipRow = { key: string; steps: number[]; removable: boolean; looserIsLower: boolean };
export type LabRequest = {
  /** The strategy the rules belong to: the Lab replays it on its own research's reads of the coins it read and on every read of the rest
   *  (every read, for a strategy not made yet). */
  strategyId?: string;
  since: number; saved: LabSide; draft: LabSide;
  /** Per-coin views for the coin list; every named plan on the draft's picks; each change applied alone to the saved rules (SOL against them);
   *  the curves (profit over the period, the draft's positions since their buy) and every coin by cap and age. */
  coins?: boolean; plans?: boolean; singles?: { key: string; patch: StrategyPatch }[]; curves?: boolean;
  gap?: boolean; own?: boolean; ownTrail?: number;
  /** The draft's typical win, median trade and typical loss, each with its coin's candles (`Example`). */
  examples?: boolean;
  proposal?: StrategyPatch;
};
/** Real against the Lab on the same coins and dates, for the saved rules. SOL: the Lab's at its own size, the real at what it really put in. */
export type GapPart = { mints: string[]; labSol: number; realSol: number };
export type Gap = { from: number; lab: GapPart; real: GapPart; labOnly: GapPart; realOnly: GapPart & { why: { key: string; count: number; realSol: number }[] }; both: GapPart };
/** One coin as the list shows it: the read that decided it, the draft's verdict and the saved rules' (`before`), the pick's position, the coin
 *  bought at market at its read (`market`) and its highest price within 4 hours of the read (`high`). */
export type CoinView = { mint: string; symbol: string; cap?: number; recheck: boolean; verdict: Verdict; check?: string; readAt: number; before: Verdict | null; out?: Outcome & { full?: boolean }; market: Outcome; high?: number };
export type Down = { check: string; count: number; doubled: number; runners: { mint: string; high: number }[] };
/** `sure`: the share of 300 random redraws of the coins (each coin's SOL under the step against under the draft) on which the step makes more SOL.
 *  It grows with the coins and how steadily the step wins, so a step that won on one lucky coin stays low. */
export type TipVariant = { value: number; picks: number; gained: number; lost: number; gainedDoubled: number; totalSol: number; sure: number };
/** What a change must clear before HOTBOT suggests it: SOL over the draft on the Lab's coins, coins picked, and, for a rule step, the share of
 *  redraws it stays ahead in (`sure`). Settings says this bar when no change clears it. */
export const SUGGEST = { sol: 0.05, picks: 10, sure: 0.9 } as const;
/** A change replayed whole, with no redraws behind it (an exit plan, a trailing stop, a size), worth suggesting. */
export const changeWorth = (gainSol: number, picks: number) => gainSol >= SUGGEST.sol && picks >= SUGGEST.picks;
/** A rule step worth suggesting. */
export const tipWorth = (variant: TipVariant, draftSol: number) => changeWorth(variant.totalSol - draftSol, variant.picks) && variant.sure >= SUGGEST.sure;
export type Tip = { key: string; blocked: number; blockedDoubled: number; variants: TipVariant[] };
export type OverTime = { at: number; total: number; mint: string; symbol: string; ret: number; sol: number }[];
export type SinceBuy = { minute: number; mean: number; median: number; p25: number; p75: number; held: number }[];
export type Segment = { label: string; coins: number; picks: number; high1h: number; doubled: number; halved: number; market: number };
export type Curves = { saved: OverTime; draft: OverTime; since: SinceBuy; cap: Segment[]; age: Segment[] };
/** Closed trades replayed from their real buys: `covered` of `total` have prices; `actual`, what the covered ones made; every named plan, then
 *  the draft's own plan when it is none of them (`id` null). */
export type OwnPlans = { covered: number; total: number; actual: number; rows: { id: ExitPlanId | null; name: string; sol: number }[] };
export type LabReply = { kind: 'main'; now: Result; next: Result; proposal?: { key: string; result: Result } | null; coins?: CoinView[]; down: Down[]; plans?: { id: string; result: Result }[];
  singles?: { key: string; totalSol: number | null }[]; gap?: Gap; curves?: Curves; own?: OwnPlans; examples?: Example[] }
  | { kind: 'tips'; tips: Tip[] };

/** Where a coin's replay starts, best evidence first: a real buy (time and fill), research's read (SniperBot's entry runs from it), or a moment
 *  the person picked (bought at market then). */
export type Anchor = { kind: 'bought'; at: number; priceUsd: number; label: string } | { kind: 'research' | 'picked'; at: number; label: string };
/** `anchor` null: the coin's reads under the draft only, so the page can pick where to start. */
export type CoinRequest = { mint: string; anchor: Anchor | null; rules: TeamRules; dip: number; plan?: ExitPlan; trail?: number };
export type ReplayFill = { at: number; share: number; priceUsd: number; reason: string; ret: number };
/** One of the draft's closed trades as Settings draws it: a typical win (the middle one of the trades that made money), the median trade and a
 *  typical loss (the middle one of those that lost). Research's read that picked the coin (its price and market cap then), the buy and each
 *  sale (with its price, before costs), the return after costs, and the coin's candles around them: `step` ms each, as `[start, open, high,
 *  low, close]` with the start in steps from `from` and the prices as multiples of the read's price. */
export type Example = { kind: 'win' | 'median' | 'loss'; mint: string; symbol: string; read: { at: number; priceUsd: number; capUsd?: number }; entry: { at: number; priceUsd: number };
  sales: ReplayFill[]; ret: number; bars: { from: number; step: number; rows: number[][] } };
export type CoinReplay = {
  status: EntryStatus;
  /** The buy before costs. */ entry?: { at: number; priceUsd: number };
  sales: ReplayFill[];
  /** Return on the position after fees and the pool's depth; `open` when part of it is still held at the last price (marked there). */
  ret: number; open: boolean;
  /** The last minute with a trade (ms): long before the data's end, the coin stopped trading. */ lastAt?: number;
  /** Highest price after the buy as a change from the buy, and when. */ peak?: { pct: number; at: number };
  /** Highest price after the last sale as a change from its price, and the minutes of trades that read. */ after?: { pct: number; minutes: number };
};
/** One coin in the Lab: its reads under the draft, its details and the replay from an anchor with every named plan from the same entry. */
export type CoinAnswer = { known: boolean; symbol?: string; supply?: number | null; liquidity?: number;
  reads: { at: number; priceUsd: number; verdict: Verdict; check?: string }[]; result: CoinReplay | null; plans: { id: ExitPlanId; replay: CoinReplay }[] };
/** Coins the Lab's data holds that match a search. */
export type CoinHit = { mint: string; symbol: string; firstRead: number; reads: number };

/** Research check keys (`researchCriteria`) to the strategy rules that set them. */
const CHECK_RULES: Record<string, string[]> = {
  liquidity: ['minLiquidityUsd'], volume: ['minVolume24hUsd'], market_cap: ['minMarketCapUsd', 'maxMarketCapUsd'], age: ['minAgeMinutes'], holders: ['maxTop10Percent'], max_age: ['maxAgeMinutes'],
  move_1h: ['minMove1hPct'], max_move_1h: ['maxMove1hPct'], buyers_1h: ['minBuyers1h'], turnover: ['minTurnover1h', 'maxTurnover1h'], graduated: ['minGraduatedSeconds'],
  buy_sell: ['minBuySellRatio'], drawdown: ['maxDrawdownPct'], holders_count: ['minHolders'], lp_burn: ['minLpBurnPct'], dev: ['shield'], insiders: ['shield'],
  bundlers: ['shield'], snipers: ['shield'], self_made_pool: ['shield'], pro_holdings: ['shield'], real_trading: ['shield'], launch_jump: ['shield'], layered_launch: ['shield'], launchpad: ['shield'], transfer_fee: ['shield'], smooth_climb: ['shield'], top10_held: ['shield'], bundlers_bought: ['shield'], recent_crash: ['hourCrashLimit'],
  linked: ['shield'], early: ['shield'], sameSize: ['shield'], dumper: ['shield'], serial_creator: ['shield'], insider_profit: ['shield'], dump_depth: ['shield'],
  hours: ['tradingHours', 'tradingDays'], stream: ['streams'],
};
export const rulesOfCheck = (check: string | undefined) => check ? CHECK_RULES[check] ?? [] : [];

/** Research check keys in plain words. */
const CHECK_LABELS: Record<string, string> = { fit: 'Fit under the pass mark', scam_flag: 'Scam flag', rugger: FINAL.rugger, dumper: FINAL.dumper, serial_creator: SHIELD_ROWS.serialCreator.name, insider_profit: SHIELD_ROWS.insiderProfit.name, dump_depth: SHIELD_ROWS.dumpDepth.name, linked: EXTRA_CHECKS.linked, early: EXTRA_CHECKS.early, sameSize: EXTRA_CHECKS.sameSize, meteora_launch: 'Meteora launch', self_made_pool: 'Self-made pool', launch_jump: 'Launch jump', layered_launch: 'Layered launch', launchpad: 'Launchpad', transfer_fee: 'Transfer fee', smooth_climb: 'Smooth climb', top10_held: 'Top 10 holdings', bundlers_bought: 'Bundler buys', pro_holdings: 'Few pro holders', recent_crash: 'Recent crash', pro_traded_launch: 'Pro-traded launch', authorities: 'Mint or freeze authority', honeypot: 'Honeypot', real_trading: 'No real trading', liquidity: 'Liquidity', volume: 'Volume', market_cap: 'Market cap', age: 'Age', holders: 'Top 10 holders', max_age: 'Too old', turnover: 'Turnover', holder_basis: "Holders' entry", lp_burn: 'Burned liquidity', max_move_1h: 'Ran too far in the hour', move_1h: '1h move', hours: 'Outside trading hours' };
/** A research check key in plain words. */
export const checkLabel = (check: string) => CHECK_LABELS[check] ?? check.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
