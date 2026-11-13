import { DEFAULT_RESEARCH_POLICY, DEFAULT_RULES, LOSS_STOP_PCT, MIN_BUY_SOL, POOL_SHARE, STREAMS, STREAM_NAMES, codeOnlyOf, type DemoToken, type RebuyRules, type Stream, type TeamRules } from './hotbot';
import { WEEKDAYS, scheduleText, type TradingHours } from './schedule';
import { breakoutText, type BreakoutRules } from './breakout';
import { NO_TRADE, noTradeOf, secondsText, type DrainRules } from './inactivity';
import type { ActiveTrading } from './entryActivity';
import { EXIT_PLANS, TRAIL, describeExits, exitPlan, nextSells, trailPct, withTrail, withoutTrail, type ExitPlan, type ExitPlanId, type ExitState } from './exits';
import { SHIELD_DEFAULTS, holdingOn, shieldOf, storedShield, type ShieldRules } from './shield';
import { BOTH_SIDES } from './market';

/** The contract shared by the UI, Convex and the worker: the new-strategy start, commands, stages and stream events. */

import type { LegalKind } from './legal';
/** Production values are private. Every `PRIVATE` value here is a placeholder; the backend holds the real one. */
const PRIVATE = 0;

export type Mode = 'paper' | 'live';
/** The bots with a Decisions list, and the kinds of their steps it shows: ResearchBot's verdicts, SniperBot's entries, TraderBot's fills and refusals. */
export type DecisionBot = 'research' | 'sniper' | 'trader';
/** `queued`: a pick the old queue held. Nothing makes one now; the one-off `team/commands.letQueueGo` lets Convex's go, the desk lets its
 *  own go at load, and the stage leaves the schema after that runs in production. */
export type Stage = 'research' | 'rejected' | 'blocked' | 'armed' | 'approval' | 'queued' | 'buying' | 'held' | 'selling' | 'closed' | 'expired' | 'skipped' | 'failed' | 'booked';
export const ACTIVE_STAGES: Stage[] = ['research', 'armed', 'approval', 'buying', 'held', 'selling'];

/** When TraderBot looks at a held coin again (the fast lane): a `movePct` move from its last check (or the buy), a `pullbackPct`
 *  drop from a high at least `highPct` above that, a `fastPct` swing within a minute, or a routine check after `routineMs` (`quietMs` while the
 *  coin stays within `unchangedPct` of its last check). A big move (`fastPct` from the last check or under its high, or a `fastPct` minute) is
 *  looked at after `fastMs` instead of `slowMs`, at most once per `fastWindowMs`. One confident sell verdict sells; a review
 *  leaning toward a sell may set a stop `leanStopPct` under the price. */
export const REVIEW = { movePct: PRIVATE, pullbackPct: PRIVATE, highPct: PRIVATE, routineMs: PRIVATE, quietMs: PRIVATE, unchangedPct: PRIVATE, fastPct: PRIVATE, fastMs: PRIVATE, slowMs: PRIVATE, fastWindowMs: PRIVATE, leanStopPct: PRIVATE } as const;
/** Gains (percent over the entry) at which HOTBOT notes a held coin is running, each once: the worker raises the note as the coin crosses one. */
export const RUNNER_TIERS = [PRIVATE, PRIVATE, PRIVATE] as const;
/** TraderBot's own levels on a held coin, set by its reviews and run by the exit engine on every price: only ever tighter than the
 *  strategy's plan, never a reason to hold longer. Jev picks them in the same call as its verdict, GLM when Jev is torn.
 *  `trails`: how far under the high since the review TraderBot's stop follows the coin ("plan" leaves it to the exit plan); the latest review's
 *  choice stands. `parts`: share of what is still held sold at once when Jev or GLM chooses it, the next one no sooner than
 *  `partEveryMs` later or `partAgainPct` higher. `confidence`: how sure Jev must be for either to count. */
export const TRADER = { trails: { wide: PRIVATE, close: PRIVATE }, parts: { quarter: PRIVATE, half: PRIVATE }, partEveryMs: PRIVATE, partAgainPct: PRIVATE, confidence: PRIVATE } as const;
/** TraderBot's trail as it runs: a stored trail under the tightest of `TRADER.trails` runs at the tightest one (looser, never tighter). */
export const traderTrail = (pct: number | undefined) => pct ? Math.max(pct, Math.min(...Object.values(TRADER.trails))) : undefined;
/** What a review leaves on the coin: `stopUsd`, the stop a review leaning toward a sell sets `REVIEW.leanStopPct` under the price (a holding
 *  review clears it); `trailPct` under the high since `trailFromUsd`, the price at the review that chose it. Stored on `lastReview`, so a
 *  worker restart keeps them (its trail starts again from `trailFromUsd`, looser at worst, never tighter). */
export type TraderLevels = { stopUsd?: number; trailPct?: number; trailFromUsd?: number };
/** The price TraderBot's levels sell at, given the highest price since its review; 0 when it has none. */
export function traderStop(levels: TraderLevels | null | undefined, highUsd = 0) {
  if (!levels) return 0;
  const pct = traderTrail(levels.trailPct), trail = pct && levels.trailFromUsd ? Math.max(levels.trailFromUsd, highUsd) * (1 - pct / 100) : 0;
  return Math.max(levels.stopUsd ?? 0, trail);
}
/** A held coin's next sells as people see them: the plan's (`nextSells`), with TraderBot's stop (its lean stop or its trail from the high it
 *  last recorded) instead when it sits above the plan's. */
export function heldSells(plan: ExitPlan, state: ExitState, levels: TraderLevels | null | undefined) {
  const sells = nextSells(plan, state), level = traderStop(levels, levels?.trailFromUsd);
  if (!levels || !level || level <= (sells.stop?.priceUsd ?? 0)) return sells;
  const trail = levels.trailPct && levels.trailFromUsd && level > (levels.stopUsd ?? 0);
  return { ...sells, stop: { priceUsd: level, reason: trail ? `TraderBot's trail: ${traderTrail(levels.trailPct)}% below the high` : "TraderBot's stop: set when its review leaned toward selling" } };
}
/** Re-pick eligibility (`types/repick.ts`): a coin the strategy turned down and never traded comes back on a `recheckMove` move in
 *  either direction once its live fit reaches `recheckBar`; FINAL refusals stay out. `movePct` is the default move, for a strategy without
 *  `rules.recheckMovePct`; a strategy's 0 turns the re-check off. Fresh research can still reject a re-pick below its falling 10-minute
 *  average. Research errors without a verdict price retry after `failedRetryMs`, whatever the setting. A pick SniperBot let go before a buy
 *  (its queue cut it, its entry never came, it went quiet or moved away while it waited) comes back `letGoMs` after its research, once its
 *  live fit reaches `recheckBar`: research passed it, so a let-go pick is no refusal. A coin the strategy traded comes back only as a
 *  re-buy, per strategy (`rules.rebuy`, types/rebuy.ts); without it, never. */
export const REPICK = { movePct: PRIVATE, failedRetryMs: PRIVATE, letGoMs: PRIVATE } as const;
/** The move (%) from a turned-down coin's verdict price that sends it back to research: the strategy's own, else `REPICK.movePct`; 0 off. */
export const recheckMove = (rules: TeamRules) => rules.recheckMovePct ?? REPICK.movePct;
/** The fit on a turned-down coin's live Pulse row that brings it back to research: the strategy's own pass mark. */
export const recheckBar = (rules: TeamRules) => (rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;
/** The share (%) of the pool one buy of the strategy may take (`POOL_SHARE`). */
export const poolShare = (rules: Pick<TeamRules, 'maxPoolSharePct'>) => rules.maxPoolSharePct ?? POOL_SHARE.pct;
/** The most SOL one buy may spend: `poolShare` of the pool's liquidity at the SOL price; undefined when either read is missing. */
export const poolCapSol = (rules: Pick<TeamRules, 'maxPoolSharePct'>, liquidityUsd: number | undefined, solPriceUsd: number | undefined) =>
  liquidityUsd !== undefined && solPriceUsd !== undefined && solPriceUsd > 0 ? poolShare(rules) / 100 * liquidityUsd / solPriceUsd : undefined;
/** The SOL a pick is sized at: half the strategy's per-coin maximum for a bare pass, all of it at full confidence, never over the
 *  strategy's share of the pool research read (`poolCapSol`). Convex sizes the pick with it (teamWorker `researched`), and the
 *  worker sizes a buy it decides in memory the same way. */
export function pickSol(rules: Pick<TeamRules, 'amountSol' | 'maxPoolSharePct'>, confidence: number, liquidityUsd: number | undefined, solPriceUsd: number | undefined) {
  const sized = Math.max(MIN_BUY_SOL, Math.round(rules.amountSol * (0.5 + 0.5 * confidence) * 1000) / 1000), cap = poolCapSol(rules, liquidityUsd, solPriceUsd);
  return cap === undefined ? sized : Math.min(sized, Math.floor(cap * 1000) / 1000);
}
/** The largest buy a strategy can make: `pickSol` at full confidence in a pool deep enough. Real SOL counts its room in coins of this size. */
export const maxBuySol = (rules: Pick<TeamRules, 'amountSol' | 'maxPoolSharePct'>) => pickSol(rules, 1, undefined, undefined);
export const RANK = { buys: PRIVATE, buyers: PRIVATE, quietSeconds: PRIVATE, bandPct: PRIVATE, fallPct: PRIVATE, runPct: PRIVATE, nextUp: PRIVATE, nextUpMs: PRIVATE, offered: PRIVATE, heldMs: PRIVATE } as const;
/** A held coin as TraderBot's review timing reads it; `rungs` counts take-profits sold, `trailsSold` the trail steps sold (types/exits.ts). */
export type ReviewedPosition = { entryPriceUsd: number; markPriceUsd: number; peakPriceUsd: number; since: number; rungs: number; trailsSold?: number; lastReview: { at: number; priceUsd: number | null; rungs: number } | null };
/** Where and when TraderBot looks again, the one rule behind the worker's reviews and the line people see: a move to `upUsd` or
 *  `floorUsd` from its last check (or the buy), a pullback to `pullbackUsd` from a new high, the routine check `at` (later while the coin
 *  hasn't moved), or right away (`now`) after a take-profit. `downUsd` is whichever lower price comes first. The worker passes the high since
 *  the last check as `peakPriceUsd`; pages only know the high since the buy, so their pullback level can sit higher than the worker's. */
export function nextLook(position: ReviewedPosition) {
  const last = position.lastReview, base = last?.priceUsd ?? position.entryPriceUsd, mark = position.markPriceUsd, high = position.peakPriceUsd, still = REVIEW.unchangedPct / 100;
  const floorUsd = base * (1 - REVIEW.movePct / 100), pullbackUsd = high > base * (1 + REVIEW.highPct / 100) ? high * (1 - REVIEW.pullbackPct / 100) : null;
  const quiet = Boolean(last) && Math.abs(mark / base - 1) < still && 1 - mark / Math.max(high, mark) < still && high / base - 1 < still;
  return { base, upUsd: base * (1 + REVIEW.movePct / 100), floorUsd, pullbackUsd, downUsd: Math.max(floorUsd, pullbackUsd ?? 0), at: (last?.at ?? position.since) + (quiet ? REVIEW.quietMs : REVIEW.routineMs),
    now: position.rungs > (last?.rungs ?? 0) ? 'Took profit; reviewing the rest' : null };
}
/** What TraderBot watches for after a review, stored on it: Jev picks it in the same call as the verdict; plain rules set it when no call was needed. */
export const TRADER_STATUS = {
  riding: 'Riding the run until momentum breaks', pullback: 'Watching whether buyers hold the pullback', support: 'Waiting for support below the buy',
  fading: 'Ready to take profit if it keeps fading', sliding: 'Ready to cut if it keeps sliding', dump: 'Watching for a dump',
  flat: 'Waiting for a real move', confirming: 'Confirming the sell on the next check', second_opinion: 'Getting a second opinion on this move', offline: 'Waiting for the decision service',
} as const;
export type TraderStatus = keyof typeof TRADER_STATUS;

export const BUDGETS = [0.5, 1, 2, 5];

/** Where every new strategy starts: no optional rule on, only what every strategy runs (the safety floors in code, mint and freeze
 *  revoked, the four floors as must-haves once set), the trailing stop alone at 15%, the budget split across `START_OPEN` coins, at
 *  market. People and HOTBOT add every rule themselves. */
export const BLANK = { name: 'New strategy' };
const START_OPEN = 5;
export function startRules(budgetSol = 1, askFirst = false): TeamRules {
  return {
    ...structuredClone(DEFAULT_RULES), minLiquidityUsd: 0, minVolume24hUsd: 0, minMarketCapUsd: 0, maxMarketCapUsd: 0, minAgeMinutes: 0, maxTop10Percent: 100, buySlippageBps: 800,
    exits: exitPlan('trail', 300, 15), mode: askFirst ? 'ask' : 'auto', allocationSol: budgetSol, amountSol: Math.max(MIN_BUY_SOL, Math.round(budgetSol / START_OPEN * 100) / 100), maxOpenPositions: START_OPEN,
    researchPolicy: { ...structuredClone(DEFAULT_RESEARCH_POLICY), minimumScore: 80 },
  };
}

/** A strategy as it trades: everything but its name, description and the money in it (its loss stop included), with keys sorted so stored
 *  and new rules compare. Two strategies with the same key buy the same coins the same way (`team.command` refuses the second in one workspace). */
export function tradesAs(row: { dipPct: number; rules: TeamRules }) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, canonical(field)])) : value;
  return JSON.stringify(canonical({ dipPct: row.dipPct, rules: { ...row.rules, allocationSol: undefined, amountSol: undefined, maxPoolSharePct: undefined, lossStopPct: undefined, practiceStopPct: undefined } }));
}
/** A Real SOL copy's budget unless the person sets one: its practice twin's, or the wallet's SOL no budget holds yet when that is less
 *  (`unbudgetedSol`: null before the wallet is funded; none left also takes the twin's). */
export const copyBudget = (twinBudgetSol: number, unbudgetedSol: number | null) => unbudgetedSol !== null && unbudgetedSol > 0 ? Math.min(twinBudgetSol, unbudgetedSol) : twinBudgetSol;
/** A Real SOL copy's rules at `budgetSol`: the twin's per-coin size scaled to the budget (`MIN_BUY_SOL` at least), and a budget that holds as
 *  many coins at that size as the twin's holds, at most its coins at once, so validateRules passes and the least size raises a small budget
 *  by no more than the coins it may hold. */
export function copyRules(twin: TeamRules, budgetSol: number): TeamRules {
  const amountSol = Math.max(MIN_BUY_SOL, Math.round(twin.amountSol * budgetSol / twin.allocationSol * 1000) / 1000);
  const coins = Math.min(twin.maxOpenPositions, Math.floor(twin.allocationSol / twin.amountSol + 1e-9));
  const { practiceStopPct: _practiceStop, ...rules } = twin;
  return { ...rules, amountSol, allocationSol: Math.max(budgetSol, Math.round(amountSol * coins * 1e9) / 1e9) };
}
/** Plain settings shown to people; everything else stays in rules under Advanced. */
export type Extra = { maxAgeMinutes?: number; minMove1hPct?: number; maxMove1hPct?: number; sweetMove1hLowPct?: number; sweetMove1hHighPct?: number; minBuyers1h?: number; minHolders?: number; minBuySellRatio?: number; maxDrawdownPct?: number; minLpBurnPct?: number; minTurnover1h?: number; maxTurnover1h?: number; minGraduatedSeconds?: number };
export const EXTRA_KEYS = ['maxAgeMinutes', 'minMove1hPct', 'maxMove1hPct', 'sweetMove1hLowPct', 'sweetMove1hHighPct', 'minBuyers1h', 'minHolders', 'minBuySellRatio', 'maxDrawdownPct', 'minLpBurnPct', 'minTurnover1h', 'maxTurnover1h', 'minGraduatedSeconds'] as const;
/** Rules a strategy can make must-haves: a coin that misses one never passes, instead of the miss weighing against the rest. The four floors
 *  are must-haves by default (types/hotbot.ts DEFAULT_RESEARCH_POLICY). */
export const MUST_HAVE = ['liquidity', 'volume', 'marketCap', 'age', 'top10', 'maxAge', 'lpBurn'] as const;
/** The must-haves that are research's core checks, by their research policy key. */
const CORE_MUST: Partial<Record<MustHave, 'liquidity' | 'volume' | 'market_cap' | 'age' | 'holders'>> = { liquidity: 'liquidity', volume: 'volume', marketCap: 'market_cap', age: 'age', top10: 'holders' };
export type MustHave = typeof MUST_HAVE[number];
/** The rules a strategy holds as must-haves, read back from where applyPatch keeps them. */
export function mustHaves(rules: TeamRules): MustHave[] {
  const checks = (rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY).checks;
  return MUST_HAVE.filter(rule => rule === 'maxAge' ? rules.maxAgeHard === true : rule === 'lpBurn' ? rules.lpBurnHard === true : checks[CORE_MUST[rule]!]?.mode === 'hard');
}
/** Coins on a live Pulse view that pass a strategy's research numbers right now (`team.fits`): how many (`capped`: the 100-coin view was full, so
 *  at least that many), and the first few with their market cap. */
export type Fits = { count: number; capped: boolean; tokens: { symbol: string; address: string; marketCapUsd: number | null }[]; rules?: RuleCounts };
export type RuleCounts = { coins: number; misses: Record<string, number>; only: Record<string, number> };
/** The rules a fit count reads, besides the streams, the research policy, the shield and the trading hours and days: numbers, then switches. */
export const FIT_NUMBERS = ['minLiquidityUsd', 'minVolume24hUsd', 'maxTop10Percent', 'minMarketCapUsd', 'maxMarketCapUsd', 'minAgeMinutes', 'maxAgeMinutes', 'minMove1hPct', 'maxMove1hPct',
  'sweetMove1hLowPct', 'sweetMove1hHighPct', 'minBuyers1h', 'minHolders', 'minBuySellRatio', 'maxDrawdownPct', 'minLpBurnPct', 'minTurnover1h', 'maxTurnover1h', 'minGraduatedSeconds', 'hourCrashLimit'] as const satisfies readonly (keyof TeamRules)[];
export const FIT_SWITCHES = ['maxAgeHard', 'lpBurnHard'] as const satisfies readonly (keyof TeamRules)[];
/** One take-profit: sell `sellPct` of the original bag at a gain of `gainPct` (or on a `pullbackPct` pullback after reaching it). */
export type TakeProfit = { gainPct: number; sellPct: number; pullbackPct?: number };
/** `exits` is a whole plan from Settings: it replaces the strategy's exits (keeping its sell slippage), trailing stop included. */
/** Patch words for ShieldBot's holder groups, as people and drafts say them: the share of supply a group is weighed over (0 off). */
export const HOLDING_WORDS = { maxDevPercent: 'dev', maxBundlersPercent: 'bundlers', maxSnipersPercent: 'snipers' } as const;
export type HoldingWord = keyof typeof HOLDING_WORDS;
export type StrategyPatch = Extra & { [K in HoldingWord]?: number } & { shield?: Partial<ShieldRules>; noTradeSeconds?: number | null; drain?: DrainRules | null; name?: string; minMarketCapUsd?: number; maxMarketCapUsd?: number; budgetSol?: number; tradeSol?: number; maxOpen?: number; maxPoolSharePct?: number; lossStopPct?: number; practiceStopPct?: number; exitPlan?: ExitPlanId; exits?: ExitPlan; takeProfits?: TakeProfit[]; stopLossPct?: number; askFirst?: boolean; dipPct?: number; minLiquidityUsd?: number; minAgeMinutes?: number; maxTop10Percent?: number; minVolume24hUsd?: number; mustHave?: MustHave[]; hourCrashLimit?: number; activeTrading?: ActiveTrading | null; entryDelayMinutes?: number; entryMaxUpPct?: number; breakout?: BreakoutRules | null; tradingHours?: TradingHours | null; tradingDays?: number[] | null; streams?: Stream[]; rebuy?: RebuyRules | null; recheckMovePct?: number | null; codeOnly?: boolean; skipTwinCoins?: boolean; passMark?: number };
export function applyPatch(rules: TeamRules, patch: StrategyPatch): TeamRules {
  const next = structuredClone(rules);
  if (patch.budgetSol !== undefined) { next.allocationSol = patch.budgetSol; if (next.amountSol > patch.budgetSol) next.amountSol = patch.budgetSol; }
  if (patch.tradeSol !== undefined) next.amountSol = patch.tradeSol;
  if (patch.maxOpen !== undefined) next.maxOpenPositions = patch.maxOpen;
  // The pool share and the loss stop are stored only when they aren't the default, so a copy at the default reads the same.
  if (patch.maxPoolSharePct !== undefined) { if (patch.maxPoolSharePct === POOL_SHARE.pct) delete next.maxPoolSharePct; else next.maxPoolSharePct = patch.maxPoolSharePct; }
  if (patch.lossStopPct !== undefined) { if (patch.lossStopPct === LOSS_STOP_PCT) delete next.lossStopPct; else next.lossStopPct = patch.lossStopPct; }
  // The Practice loss stop is off unless set; 0 turns it off.
  if (patch.practiceStopPct !== undefined) { if (patch.practiceStopPct === 0) delete next.practiceStopPct; else next.practiceStopPct = patch.practiceStopPct; }
  // A named exit plan replaces what sells above the strategy's trailing stop, which it keeps (or keeps off); a take-profit list replaces the take-profits (each sells a share of the original bag), a stop-loss number sets the trailing stop and 0 turns it off.
  if (patch.exitPlan !== undefined) { if (!Object.hasOwn(EXIT_PLANS, patch.exitPlan)) throw new Error('Choose one of the exit plans.'); next.exits = exitPlan(patch.exitPlan, next.exits.sellSlippageBps ?? 300, trailPct(next.exits)); }
  // A whole plan is rebuilt from the fields a plan has, so nothing else reaches the stored exits. A plan without a trailing stop keeps the
  // strategy's own (words and older pages send plans without one); only `stopLossPct` 0 turns it off.
  if (patch.exits !== undefined) {
    const plan = patch.exits, n = (value: number | undefined) => value ? { value } : null;
    const rebuilt = {
      name: String(plan.name || next.exits.name).slice(0, 40), sellSlippageBps: next.exits.sellSlippageBps,
      takeProfits: plan.takeProfits.map(tp => ({ gainPct: tp.gainPct, sellPct: tp.sellPct, ...(n(tp.pullbackPct) && { pullbackPct: tp.pullbackPct }) })).sort((a, b) => a.gainPct - b.gainPct),
      stopLosses: plan.stopLosses.map(sl => ({ lossPct: sl.lossPct, sellPct: sl.sellPct, ...(sl.trailing && { trailing: true }), ...(n(sl.trailDistancePct) && { trailDistancePct: sl.trailDistancePct }), ...(n(sl.armAtGainPct) && { armAtGainPct: sl.armAtGainPct }), ...(n(sl.afterMinutes) && { afterMinutes: sl.afterMinutes }) })),
      ...(plan.scaleOut && { scaleOut: { fromPct: plan.scaleOut.fromPct, stepPct: plan.scaleOut.stepPct, sellPct: plan.scaleOut.sellPct } }),
      ...(n(plan.lockStepPct) && { lockStepPct: plan.lockStepPct }),
      ...(plan.stall && { stall: { armAtGainPct: plan.stall.armAtGainPct, minutes: plan.stall.minutes } }),
    }, trail = trailPct(plan) ?? trailPct(next.exits);
    next.exits = trail ? withTrail(rebuilt, trail) : rebuilt;
  }
  if (patch.takeProfits !== undefined) next.exits.takeProfits = [...patch.takeProfits].sort((a, b) => a.gainPct - b.gainPct).map(tp => ({ gainPct: tp.gainPct, sellPct: tp.sellPct, ...(tp.pullbackPct ? { pullbackPct: tp.pullbackPct } : {}) }));
  if (patch.stopLossPct === 0) next.exits = withoutTrail(next.exits);
  else if (patch.stopLossPct !== undefined) {
    if (!(patch.stopLossPct >= TRAIL.min && patch.stopLossPct <= TRAIL.max)) throw new Error(`The trailing stop sits ${TRAIL.min}–${TRAIL.max}% below the high, or 0 for none.`);
    next.exits = withTrail(next.exits, patch.stopLossPct);
  }
  if (patch.activeTrading === null) delete next.activeTrading;
  else if (patch.activeTrading !== undefined) { const { lastSwapSeconds, buckets, buyers } = patch.activeTrading; next.activeTrading = { lastSwapSeconds, buckets, buyers }; }
  if (patch.askFirst !== undefined) next.mode = patch.askFirst ? 'ask' : 'auto';
  if (patch.minLiquidityUsd !== undefined) next.minLiquidityUsd = patch.minLiquidityUsd;
  if (patch.minAgeMinutes !== undefined) next.minAgeMinutes = patch.minAgeMinutes;
  if (patch.maxTop10Percent !== undefined) next.maxTop10Percent = patch.maxTop10Percent;
  if (patch.minVolume24hUsd !== undefined) next.minVolume24hUsd = patch.minVolume24hUsd;
  if (patch.minMarketCapUsd !== undefined) next.minMarketCapUsd = patch.minMarketCapUsd;
  if (patch.maxMarketCapUsd !== undefined) next.maxMarketCapUsd = patch.maxMarketCapUsd;
  for (const key of EXTRA_KEYS) if (patch[key] !== undefined) next[key] = patch[key]! > 0 ? patch[key] : undefined;
  for (const key of ['hourCrashLimit', 'entryDelayMinutes', 'entryMaxUpPct'] as const) if (patch[key] !== undefined) { if (patch[key]! > 0) next[key] = patch[key]; else delete next[key]; }
  // Streams are stored in their own order, and all of them as none, so the same pick always reads the same.
  if (patch.streams !== undefined) {
    if (!patch.streams.length || patch.streams.some(stream => !STREAMS.includes(stream))) throw new Error('Pick at least one of the streams.');
    const picked = STREAMS.filter(stream => patch.streams!.includes(stream));
    if (picked.length === STREAMS.length) delete next.streams; else next.streams = picked;
  }
  // SniperBot's re-buys: null turns them off; the settings are stored as their own fields alone, a pullback's direction as none.
  if (patch.rebuy === null) delete next.rebuy;
  else if (patch.rebuy !== undefined) {
    const { direction, steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin } = patch.rebuy;
    next.rebuy = { ...(direction && direction !== 'pullback' ? { direction } : {}), steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin };
  }
  // A breakout, trading hours and days: null turns each off; days are stored in weekday order, and all seven as none.
  if (patch.breakout === null) delete next.breakout;
  else if (patch.breakout !== undefined) { const { minutes, rangePct, buyers } = patch.breakout; next.breakout = { minutes, rangePct, buyers }; }
  if (patch.tradingHours === null) delete next.tradingHours;
  else if (patch.tradingHours !== undefined) next.tradingHours = { from: patch.tradingHours.from, to: patch.tradingHours.to };
  const days = patch.tradingDays && [...new Set(patch.tradingDays)].sort((a, b) => a - b);
  if (patch.tradingDays === null || days?.length === WEEKDAYS.length) delete next.tradingDays;
  else if (days) next.tradingDays = days;
  // The no-trade exit at its default is stored as none, so a copy at the default reads the same; null is off.
  if (patch.noTradeSeconds === NO_TRADE.seconds) delete next.noTradeSeconds;
  else if (patch.noTradeSeconds !== undefined) next.noTradeSeconds = patch.noTradeSeconds;
  if (patch.drain === null) delete next.drain;
  else if (patch.drain !== undefined) next.drain = { dropPct: patch.drain.dropPct, minutes: patch.drain.minutes };
  // ResearchBot's re-check of turned-down coins: null, or the default move, is stored as none (so a copy at the default reads the same); 0 is off.
  if (patch.recheckMovePct === null || patch.recheckMovePct === REPICK.movePct) delete next.recheckMovePct;
  else if (patch.recheckMovePct !== undefined) next.recheckMovePct = patch.recheckMovePct;
  // ShieldBot's rules merge over the strategy's own, and only what differs from the defaults is stored, so a copy at the defaults reads the same.
  const words = (Object.keys(HOLDING_WORDS) as HoldingWord[]).filter(key => patch[key] !== undefined);
  if (patch.shield !== undefined || words.length) {
    const own = { ...shieldOf(next), ...patch.shield };
    for (const key of words) own[HOLDING_WORDS[key]] = { ...own[HOLDING_WORDS[key]], weighAbove: Math.max(0, patch[key]!) };
    const shield = storedShield(own);
    if (shield) next.shield = shield; else delete next.shield;
  }
  // Code alone is stored only when on, so a copy at the default reads the same (`tradesAs`).
  if (patch.codeOnly === true) next.codeOnly = true; else if (patch.codeOnly === false) delete next.codeOnly;
  if (patch.skipTwinCoins === true) next.skipTwinCoins = true; else if (patch.skipTwinCoins === false) delete next.skipTwinCoins;
  // The weighted pass mark: rules that aren't must-haves add up to a score a coin needs to reach (validateRules keeps it 50–125).
  if (patch.passMark !== undefined) next.researchPolicy = { ...structuredClone(next.researchPolicy ?? DEFAULT_RESEARCH_POLICY), minimumScore: patch.passMark };
  if (patch.mustHave !== undefined) {
    if (patch.mustHave.some(rule => !MUST_HAVE.includes(rule))) throw new Error('Only liquidity, volume, market cap, age, top 10 holders, the max age and burned liquidity can be must-haves.');
    const policy = structuredClone(next.researchPolicy ?? DEFAULT_RESEARCH_POLICY);
    for (const [rule, key] of Object.entries(CORE_MUST) as [MustHave, keyof typeof policy.checks][]) policy.checks[key] = { ...policy.checks[key], mode: patch.mustHave.includes(rule) ? 'hard' : 'weighted' };
    next.researchPolicy = policy;
    if (patch.mustHave.includes('maxAge')) next.maxAgeHard = true; else delete next.maxAgeHard;
    // Burned liquidity as a must-have starts at half the pool burned unless the strategy names its own floor.
    if (patch.mustHave.includes('lpBurn')) { next.lpBurnHard = true; next.minLpBurnPct ??= 50; } else delete next.lpBurnHard;
  }
  return next;
}

/** Strategies a person keeps running or paused at once, Paper and Real SOL together; an admin has no limit. Each one screens on the worker,
 *  and each held coin rides in the worker's book with its strategy's exit plan. */
export const STRATEGY_LIMIT = 10;
/** Whether a strategy counts toward STRATEGY_LIMIT: one selling out to be archived does not. */
export const countsTowardLimit = (strategy: { status: string }) => strategy.status === 'running' || strategy.status === 'paused';
/** The most practice SOL one top-up adds. */
export const PRACTICE_TOP_UP_MAX_SOL = 1000;

/** How every team function fails (a ConvexError's data): `message` is written for everyone, `detail` is the complete cause and only admin accounts
 *  receive it. `fault`: HOTBOT's side broke (a bug, a timeout, a provider), not a message about the person's own input. */
/** `terms`: a gate refused for want of that acceptance, so the app opens its Accept dialog (types/legal.ts). */
export type Failure = { message: string; detail?: string; fault?: true; terms?: LegalKind };

/** Every change a person can make, from buttons or the command bar. */
export type Command =
  | { type: 'priceDisplay'; unit: 'price' | 'marketCap' }
  /** `rearm`: a strategy its loss stop paused buys again from where it stands now (its best point becomes its profit now). */
  | { type: 'pause' | 'resume' | 'restore' | 'delete' | 'rearm'; strategyId: string }
  /** Archive a strategy that holds nothing; with `sell`, sell what it holds first and archive once the last coin sells. */
  | { type: 'archive'; strategyId: string; sell?: boolean }
  | { type: 'update'; strategyId: string; patch: StrategyPatch }
  /** `itemId`: any coin reference (types/coinKey.ts `readCoinRef`). `seen`: on a buy, the rules version of the coin's strategy on the person's
   *  screen (`rev`); a buy under rules changed since is refused. */
  | { type: 'approve' | 'buyNow'; itemId: string; seen?: number }
  | { type: 'skip' | 'cancel' | 'sell'; itemId: string }
  | { type: 'sellAll'; strategyId?: string }
  | { type: 'stopAll' | 'resumeAll' | 'resetPractice' }
  /** Admin only, on their own team: add practice SOL (it raises the starting balance too), and leave archived strategies' losses out of the totals. */
  | { type: 'addPaperSol'; amountSol: number }
  | { type: 'hideArchivedLosses'; hide: boolean }
  | { type: 'research'; token: DemoToken; strategyId?: string }
  | { type: 'createStrategy'; name: string; description?: string; budgetSol: number; askFirst: boolean; patch: StrategyPatch }
  /** A copy of one of the team's strategies (`from`) or a new one (`startRules`), with the draft's changes: saved paused (the Lab), or running (`run`). */
  | { type: 'labStrategy'; name: string; from?: string; patch: StrategyPatch; run?: true }
  /** Keep a plan as one of the person's own exit plans under its name (one of the same name is replaced), or forget one. */
  | { type: 'saveExitPlan'; exits: ExitPlan }
  | { type: 'forgetExitPlan'; name: string }
  /** Which portfolio the pages show. It moves no coin: each strategy trades in its own portfolio (`realSolCopy`). */
  | { type: 'mode'; mode: Mode }
  /** A running copy of each practice strategy that trades Real SOL, same rules; the practice ones keep running beside them. `budgets`: each
   *  copy's budget, by the order of `strategyIds` (unset: `copyBudget`), its per-coin size scaled to it (`copyRules`). */
  | { type: 'realSolCopy'; strategyIds: string[]; budgets?: number[] }
  /** Starts going live: creates the person's HOTBOT wallet (once) and has the worker watch it for the first deposit. The portfolio stays Practice. */
  | { type: 'prepareLive' };
/** What a HOTBOT alert is about, so the app can offer its one action: practice SOL spent, the live wallet short of SOL, buys waiting for
 *  your OK, or the trading worker stopped. */
export const ALERT_TOPICS = ['practiceSol', 'walletSol', 'approvals', 'worker'] as const;
export type AlertTopic = typeof ALERT_TOPICS[number];
/** Whether a command loosens a Real SOL limit, so it waits for the person's own tap wherever HOTBOT or an agent asked for it: a re-arm, or a
 *  raise of a Real SOL strategy's budget, per-coin size, coins at once or loss stop. A lower limit applies at once. */
export function loosens(command: Command, strategy: { live?: true; rules: TeamRules } | null) {
  switch (command.type) {
    case 'rearm': return true;
    case 'update': {
      if (!strategy?.live) return false;
      let next: TeamRules;
      // A patch the rule checks refuse loosens nothing: the command refuses it with its own message.
      try { next = applyPatch(strategy.rules, command.patch); } catch { return false; }
      const was = strategy.rules;
      return next.allocationSol > was.allocationSol || next.amountSol > was.amountSol || next.maxOpenPositions > was.maxOpenPositions || (next.lossStopPct ?? LOSS_STOP_PCT) > (was.lossStopPct ?? LOSS_STOP_PCT);
    }
    default: return false;
  }
}

// ---- Strategy drafts from plain words: Jev reads the choices and numbers a person states, code builds every rule from them. ----
export type Risk = 'low' | 'medium' | 'high';
export type Hold = 'quick' | 'swing' | 'moon';
/** What a plan was built from: the choices Jev read (`age` and the rest are null or false when the words don't say) and the numbers a person stated in `set`.
 *  Refining changes only what is said; every rule is rebuilt from it in code, on the server and in the browser. */
export type Intent = { risk: Risk; hold: Hold; age: 'new' | 'established' | null; clean: boolean; moving: boolean; askFirst: boolean; budgetSol: number; set: StrategyPatch };
/** One tap that changes the plan: applied in the browser, no call. */
export type Fix = { label: string; patch: StrategyPatch };
export type Draft = {
  intent: Intent; name: string; description: string; budgetSol: number; askFirst: boolean; patch: StrategyPatch;
  matches: { count: number; tokens: { symbol: string; address: string }[] } | null;
  /** HOTBOT's one honest remark about the plan, and the taps that fix it. */
  note: string | null; fixes: Fix[];
};

const RISK = { low: { floors: PRIVATE, age: PRIVATE, top10: PRIVATE }, medium: { floors: PRIVATE, age: PRIVATE, top10: PRIVATE }, high: { floors: PRIVATE, age: PRIVATE, top10: PRIVATE } } as const;
/** Quick flips trail tight from the buy, big moves take the stake back and let the rest run, swings keep the start's plan. */
const HOLD_PLAN: Record<Hold, ExitPlanId | null> = { quick: 'trail', swing: null, moon: 'stake' };
const DAY = 24 * 60;
/** Two significant digits, rounded down, so a derived floor reads like a number a person would pick. */
const nice = (n: number) => n < 100 ? Math.round(n) : Math.floor(n / 10 ** (Math.floor(Math.log10(n)) - 1)) * 10 ** (Math.floor(Math.log10(n)) - 1);
const TINY = { note: 'Coins this small often jump before the team finishes checking them', fix: { label: 'Use $5K–$50K', patch: { minMarketCapUsd: 5_000, maxMarketCapUsd: 50_000 } } satisfies Fix };

/** Every rule a plan comes to: the start, the choices the words made, then the person's own numbers. A cap band sets the liquidity and
 *  volume floors it needs, scaled by risk; without a band there are none. */
export function planDraft(intent: Intent): Omit<Draft, 'matches'> {
  const start = startRules(intent.budgetSol, intent.askFirst), scale = RISK[intent.risk], set = intent.set, patch: StrategyPatch = {}, plan = HOLD_PLAN[intent.hold];
  if (plan) patch.exitPlan = plan;
  if (intent.age === 'new') Object.assign(patch, { maxAgeMinutes: DAY, minAgeMinutes: 0 });
  if (intent.age === 'established') patch.minAgeMinutes = DAY;
  if (intent.clean) Object.assign(patch, { maxDevPercent: 10, maxBundlersPercent: 10 });
  if (intent.moving) Object.assign(patch, { minMove1hPct: 5, minBuyers1h: 50 });
  Object.assign(patch, set);
  const cap = { low: patch.minMarketCapUsd ?? start.minMarketCapUsd, high: patch.maxMarketCapUsd ?? start.maxMarketCapUsd };
  if (cap.high > 0 && cap.low > cap.high) [cap.low, cap.high] = set.minMarketCapUsd !== undefined && set.maxMarketCapUsd !== undefined ? [cap.high, cap.low] : [0, cap.high];
  if (cap.high > 0) {
    patch.minMarketCapUsd = cap.low; patch.maxMarketCapUsd = cap.high;
    const smallest = cap.low > 0 ? cap.low : cap.high;
    if (set.minLiquidityUsd === undefined) patch.minLiquidityUsd = nice(smallest * 0.25 * BOTH_SIDES * scale.floors);
    if (set.minVolume24hUsd === undefined) patch.minVolume24hUsd = nice(smallest * 0.5 * scale.floors);
  }
  const rules = applyPatch(start, patch), dip = patch.dipPct ?? 0, bots = plainBots(rules, dip);
  const tiny = cap.high > 0 && cap.high < 10_000;
  return { intent, name: draftName(rules, dip), description: `${bots.research}. ${bots.sniper}.`, budgetSol: intent.budgetSol, askFirst: intent.askFirst, patch, note: tiny ? TINY.note : null, fixes: tiny ? [TINY.fix] : [] };
}
/** A fix applied in the browser: the plan is rebuilt from what it was built from, so its numbers stay coherent. The live count belongs to the old rules, so it goes until the next rebuild. */
export const withFix = (draft: Draft, fix: Fix): Draft => ({ ...planDraft({ ...draft.intent, set: { ...draft.intent.set, ...fix.patch } }), matches: null });
/** The dip a draft waits for before buying: the person's own, else none. */
export const draftDip = (draft: Pick<Draft, 'patch'>) => draft.patch.dipPct ?? 0;
/** A plan keeps its name through every change; only a new name in the words ("call it …") replaces it. */
export const keepName = (before: Draft, after: Draft): Draft => after.name !== planDraft(after.intent).name ? after : { ...after, name: before.name };
/** What a draft comes to at a budget: the size of each coin follows the budget unless the person stated one. */
export function draftPatch(draft: Pick<Draft, 'patch'>, budgetSol: number): StrategyPatch {
  return { ...draft.patch, budgetSol, ...(draft.patch.tradeSol !== undefined ? { tradeSol: Math.min(draft.patch.tradeSol, budgetSol) } : {}) };
}
export const draftRules = (draft: Pick<Draft, 'askFirst' | 'patch'>, budgetSol: number) => applyPatch(startRules(budgetSol, draft.askFirst), draftPatch(draft, budgetSol));

/** A short plain name from the rules; with nothing that names it, the new-strategy name. */
function draftName(rules: TeamRules, dipPct: number) {
  const age = rules.maxAgeMinutes ? 'brand-new' : rules.minAgeMinutes >= DAY ? 'established' : '';
  const size = rules.maxMarketCapUsd > 0 && rules.maxMarketCapUsd <= 25_000 ? 'tiny' : rules.maxMarketCapUsd > 0 && rules.maxMarketCapUsd <= 5e6 ? 'small' : rules.minMarketCapUsd >= 10e6 ? 'big' : '';
  const tail = dipPct >= 3 ? ' on dips' : rules.minMove1hPct ? ' on the move' : '';
  const lead = [age, size].filter(Boolean).join(' ');
  if (!lead && !tail) return BLANK.name;
  const name = (lead ? `${lead} coins` : 'coins') + tail;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---- The plan in plain words, for the plan step and the settings page. ----
export type PlainIcon = 'sparkles' | 'clock' | 'coins' | 'droplets' | 'chart' | 'users' | 'lock' | 'shield' | 'trending-up' | 'trending-down' | 'scale' | 'receipt' | 'zap' | 'hand' | 'bot' | 'link';
const usd = (n: number) => '$' + (n >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K' : Math.round(n));
const span = (minutes: number) => minutes < 60 ? `${Math.round(minutes)} minutes` : minutes < 1440 ? `${+(minutes / 60).toFixed(1)} ${minutes === 60 ? 'hour' : 'hours'}` : `${+(minutes / 1440).toFixed(1)} ${minutes === 1440 ? 'day' : 'days'}`;
const within = (minutes: number) => minutes === DAY ? 'today' : minutes === 60 ? 'in the last hour' : `in the last ${span(minutes)}`;
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
export type PlainRule = { icon: PlainIcon; text: string; group: 'looks' | 'buys' };
/** The 1h move a strategy likes best, as people say it: "25–100%", or "up to 100%". */
export const sweetSpot = (rules: Pick<TeamRules, 'sweetMove1hLowPct' | 'sweetMove1hHighPct' | 'maxMove1hPct'>) => {
  const low = rules.sweetMove1hLowPct ?? 0, high = rules.sweetMove1hHighPct ?? low;
  return low > 0 ? `${low}–${high}%` : `up to ${high}%`;
};
/** Whether a core research check is a must-have for the strategy (`StrategyPatch.mustHave`). */
const must = (rules: TeamRules, key: 'liquidity' | 'volume' | 'market_cap' | 'age' | 'holders') => rules.researchPolicy?.checks[key].mode === 'hard';
/** What ResearchBot looks for and how the team buys, one chip each. Rules that are off don't appear; mint and freeze are always checked. */
export function plainRules(rules: TeamRules, dipPct = 0): PlainRule[] {
  const looks = (icon: PlainIcon, text: string) => ({ icon, text, group: 'looks' as const }), buys = (icon: PlainIcon, text: string) => ({ icon, text, group: 'buys' as const });
  const { minMarketCapUsd: low, maxMarketCapUsd: high, minAgeMinutes: minAge, maxAgeMinutes: maxAge } = rules;
  return [
    ...(maxAge ? [looks('sparkles', rules.maxAgeHard ? (minAge > 0 ? `Only coins ${span(minAge)} to ${span(maxAge)} old` : `Only coins under ${span(maxAge)} old`) : minAge > 0 ? `${span(minAge)} to ${span(maxAge)} old` : `Launched ${within(maxAge)}`)] : minAge > 0 ? [looks('clock', `Older than ${span(minAge)}`)] : []),
    ...(high > 0 || low > 0 ? [looks('coins', (must(rules, 'market_cap') ? 'Only coins worth ' : 'Worth ') + (low > 0 && high > 0 ? `${usd(low)}–${usd(high)}` : high > 0 ? `under ${usd(high)}` : `over ${usd(low)}`))] : []),
    ...(rules.minLiquidityUsd > 0 ? [looks('droplets', rules.researchPolicy?.checks.liquidity.mode === 'hard' ? `Only ${usd(rules.minLiquidityUsd)}+ in liquidity` : `${usd(rules.minLiquidityUsd)}+ in liquidity`)] : []),
    ...(rules.minVolume24hUsd > 0 ? [looks('chart', `${usd(rules.minVolume24hUsd)}+ traded a day`)] : []),
    ...(rules.maxTop10Percent < 100 ? [looks('users', must(rules, 'holders') ? `Only coins whose top 10 wallets own under ${rules.maxTop10Percent}%` : rules.maxTop10Percent <= 50 ? 'No whale owns most of it' : `Top 10 wallets own under ${rules.maxTop10Percent}%`)] : []),
    ...shieldChips(rules).map(text => looks('shield', text)),
    ...(rules.minMove1hPct ? [looks('trending-up', 'Already climbing')] : []),
    ...(rules.maxMove1hPct ? [looks('shield', `Likes coins up ${sweetSpot(rules)} in an hour, wary past ${rules.maxMove1hPct}%`)] : []),
    ...(rules.minBuyers1h ? [looks('users', `${rules.minBuyers1h}+ buyers an hour`)] : []),
    ...(rules.minHolders ? [looks('users', `${rules.minHolders}+ holders`)] : []),
    ...(rules.minTurnover1h !== undefined || rules.maxTurnover1h !== undefined ? [looks('chart', `Traded ${rules.minTurnover1h !== undefined && rules.maxTurnover1h !== undefined ? `${rules.minTurnover1h}–${rules.maxTurnover1h}×` : rules.minTurnover1h !== undefined ? `${rules.minTurnover1h}×+` : `under ${rules.maxTurnover1h}×`} its cap in the hour`)] : []),
    ...(rules.minBuySellRatio ? [looks('scale', 'More buys than sells')] : []),
    ...(rules.maxDrawdownPct ? [looks('trending-up', 'Still near its high')] : []),
    ...(rules.minLpBurnPct ? [looks('lock', rules.lpBurnHard ? 'Only coins with liquidity burned' : 'Liquidity locked')] : []),
    ...(rules.streams ? [looks('zap', `Finds coins in ${rules.streams.map(stream => STREAM_NAMES[stream]).join(', ')}`)] : []),
    ...(rules.hourCrashLimit ? [buys('trending-down', `Skips a ${rules.hourCrashLimit}%+ one-minute fall in the last hour`)] : []),
    ...(rules.minGraduatedSeconds ? [buys('clock', `Waits ${secondsText(rules.minGraduatedSeconds)} after a coin graduates`)] : []),
    dipPct > 0 ? buys('trending-down', `Waits for a ${dipPct}% dip`) : rules.breakout ? buys('trending-up', breakoutText(rules.breakout)) : rules.entryDelayMinutes ? buys('clock', `Watches it ${rules.entryDelayMinutes} min, buys if it still fits${rules.entryMaxUpPct ? ` and didn't run ${rules.entryMaxUpPct}%+` : ''}`) : buys('zap', 'Buys right away'),
    ...(rules.activeTrading ? [buys('chart', 'Waits for active trading')] : []),
    ...(scheduleText(rules) ? [buys('clock', `Buys only ${scheduleText(rules)}`)] : []),
    rules.mode === 'ask' ? buys('hand', 'Asks you first') : buys('bot', 'Buys without asking'),
  ];
}
/** ShieldBot's rules a strategy changed, as plain chips: the checks it tightened or added, and the ones it switched off. */
function shieldChips(rules: TeamRules): string[] {
  const shield = shieldOf(rules), d = SHIELD_DEFAULTS, chips: string[] = [];
  const tighter = (['dev', 'bundlers'] as const).some(key => holdingOn(shield[key]) && (shield[key].weighAbove < d[key].weighAbove || (shield[key].refuseAt > 0 && (shield[key].refuseAt < d[key].refuseAt || !d[key].refuseAt))));
  if (tighter) chips.push('No big creator or bundler bags');
  if (holdingOn(shield.snipers)) chips.push('Few snipers');
  if (shield.launchJump && shield.launchJump !== d.launchJump) chips.push(`Launch spikes under ${shield.launchJump}×`);
  const named: [keyof ShieldRules, string][] = [['proHolders', 'pro holders'], ['launchJump', 'launch jump'], ['selfMadeDays', 'self-made pool'], ['washTrading', 'wash trading']];
  const off = named.filter(([key]) => !shield[key]).map(([, name]) => name).concat((['dev', 'bundlers'] as const).filter(key => !holdingOn(shield[key])).map(key => `${key} holdings`));
  if (off.length) chips.push(`ShieldBot off: ${off.join(', ')}`);
  return chips;
}
/** One plain line per bot. TraderBot's is the exit plan's own summary (the start's plan, or the one the hold style picks). `checks` are what ResearchBot also looks for beyond its line. */
export function plainBots(rules: TeamRules, dipPct = 0) {
  const chips = plainRules(rules, dipPct), find = (icon: PlainIcon) => chips.find(chip => chip.group === 'looks' && chip.icon === icon)?.text;
  const age = find('sparkles') ?? find('clock'), cap = find('coins'), liquidity = find('droplets');
  const finds = [[age, cap].filter(Boolean).map(text => lower(text!)).join(', '), !cap && liquidity ? `with ${lower(liquidity)}` : ''].filter(Boolean).join(' ');
  const said = [age, cap, cap ? undefined : liquidity], ask = rules.mode === 'ask', idle = noTradeOf(rules);
  return {
    research: `Looks for coins ${finds || 'that fit your rules'}`,
    sniper: dipPct > 0 ? `Waits for a ${dipPct}% dip, then ${ask ? 'asks you' : 'buys'}` : rules.breakout ? `Waits for a breakout, then ${ask ? 'asks you' : 'buys'}` : ask ? 'Picks the moment, then asks you first' : 'Buys the moment one checks out',
    trader: `${describeExits(rules.exits)}${idle ? `; sells after ${secondsText(idle)} with no trade` : ''}${rules.drain ? `; sells a coin down ${rules.drain.dropPct}% in ${secondsText(rules.drain.minutes * 60)} on more sells than buys` : ''}${codeOnlyOf(rules) ? '; code alone sells, no AI reviews' : ''}`,
    checks: chips.filter(chip => chip.group === 'looks' && !said.includes(chip.text)),
  };
}
