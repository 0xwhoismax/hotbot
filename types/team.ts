import { DEFAULT_RESEARCH_POLICY, DEFAULT_RULES, POOL_SHARE, STREAMS, STREAM_NAMES, streamsOf, type DemoToken, type RebuyRules, type Stream, type TeamRules } from './hotbot';
import { INACTIVITY_DEFAULT, inactivityOf, type InactivityRules } from './inactivity';
import { EXIT_PLANS, TRAIL, describeExits, exitPlan, namedExitPlan, trailPct, withTrail, withoutTrail, type ExitPlan, type ExitPlanId } from './exits';
import { SHIELD_DEFAULTS, holdingOn, shieldOf, storedShield, type ShieldRules } from './shield';

/** The contract shared by the UI, Convex and the worker: presets, commands, stages and stream events. */

export type Mode = 'paper' | 'live';
export const REAL_SOL_OPEN = false;
export type BotRole = 'coordinator' | 'research' | 'sniper' | 'trader' | 'launch';
export type Stage = 'research' | 'rejected' | 'blocked' | 'armed' | 'approval' | 'queued' | 'buying' | 'held' | 'selling' | 'closed' | 'expired' | 'skipped' | 'failed';
export const ACTIVE_STAGES: Stage[] = ['research', 'armed', 'approval', 'buying', 'held', 'selling', 'queued'];
/** Coins still in the queue: pausing, archiving or deleting a strategy lets them go. */
export const QUEUED_STAGES = ['research', 'armed', 'approval', 'queued'] as const satisfies Stage[];
export const STRATEGY_STATUSES = ['running', 'paused', 'archiving', 'archived'] as const;
export type StrategyStatus = typeof STRATEGY_STATUSES[number];
export const STAGE_BOT: Record<Stage, BotRole> = { research: 'research', rejected: 'research', blocked: 'research', armed: 'sniper', approval: 'sniper', queued: 'sniper', expired: 'sniper', skipped: 'sniper', buying: 'trader', held: 'trader', selling: 'trader', closed: 'trader', failed: 'trader' };
export const BOT_NAMES: Record<BotRole, string> = { coordinator: 'HOTBOT', research: 'ResearchBot', sniper: 'SniperBot', trader: 'TraderBot', launch: 'LaunchBot' };

/** When TraderBot looks at a held coin again (the fast lane): a `movePct` move from its last check (or the buy), a `pullbackPct`
 *  drop from a high at least `highPct` above that, a `fastPct` swing within a minute, or a routine check after `routineMs` (`quietMs` while the
 *  coin stays within `unchangedPct` of its last check). A big move (`fastPct` from the last check or under its high, or a `fastPct` minute) is
 *  looked at after `fastMs` instead of `slowMs`, at most once per `fastWindowMs`. One confident sell verdict sells; a review
 *  leaning toward a sell may set a stop `leanStopPct` under the price. */
export const REVIEW = { movePct: 5, pullbackPct: 8, highPct: 3, routineMs: 10 * 60_000, quietMs: 30 * 60_000, unchangedPct: 3, fastPct: 10, fastMs: 10_000, slowMs: 30_000, fastWindowMs: 60_000, leanStopPct: 8 } as const;
/** Gains (percent over the entry) at which HOTBOT notes a held coin is running, each once: the worker raises the note as the coin crosses one. */
export const RUNNER_TIERS = [200, 100, 50] as const;
/** Losing-streak lengths HOTBOT judges, longest first: the run since the last win is looked at as it reaches each one, never once per loss. */
export const STREAK_TIERS = [10, 6, 3] as const;
/** A price-gated sale scenario for reviews. The exit engine sells on any confident sell verdict, without these drop thresholds. */
export const SELL_NOW = { confidence: 0.75, fromHighPct: 20, inMinutePct: 15 } as const;
/** TraderBot's own levels on a held coin, set by its reviews and run by the exit engine on every price: only ever tighter than the
 *  strategy's plan, never a reason to hold longer. Jev picks them in the same call as its verdict, GLM when Jev is torn.
 *  `trails`: how far under the high since the review TraderBot's stop follows the coin ("plan" leaves it to the exit plan); the latest review's
 *  choice stands. `parts`: share of what is still held sold at once when Jev or GLM chooses it, the next one no sooner than
 *  `partEveryMs` later or `partAgainPct` higher. `confidence`: how sure Jev must be for either to count. */
export const TRADER = { trails: { wide: 20, close: 12 }, parts: { quarter: 25, half: 50 }, partEveryMs: 10 * 60_000, partAgainPct: 15, confidence: 0.7 } as const;
export type TrailChoice = 'plan' | keyof typeof TRADER.trails;
/** TraderBot's trail as it runs: a stored trail under the tightest of `TRADER.trails` runs at the tightest one (looser, never tighter). */
export const traderTrail = (pct: number | undefined) => pct ? Math.max(pct, Math.min(...Object.values(TRADER.trails))) : undefined;
export type PartChoice = 'none' | keyof typeof TRADER.parts;
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
/** Re-pick eligibility (`types/repick.ts`): a coin the strategy turned down and never traded comes back on a `recheckMove` move in
 *  either direction once its live fit reaches `recheckBar`; FINAL refusals stay out. `movePct` is the default move, for a strategy without
 *  `rules.recheckMovePct`; a strategy's 0 turns the re-check off. Fresh research can still reject a re-pick below its falling 10-minute
 *  average. Research errors without a verdict price retry after `failedRetryMs`, whatever the setting. A coin the strategy traded comes back
 *  only as a re-buy, per strategy (`rules.rebuy`, types/rebuy.ts); without it, never. */
export const REPICK = { movePct: 50, failedRetryMs: 10 * 60_000 } as const;
/** The move (%) from a turned-down coin's verdict price that sends it back to research: the strategy's own, else `REPICK.movePct`; 0 off. */
export const recheckMove = (rules: TeamRules) => rules.recheckMovePct ?? REPICK.movePct;
/** An exit reason that took profit: the plan's take-profits and scale-outs, TraderBot's take-profit and its part sells. */
export const tookProfit = (reason: string | undefined) => /^(Took profit|Scaled out)|TraderBot took profit|TraderBot sold \d+%/.test(reason ?? '');
/** The fit on a turned-down coin's live Pulse row that brings it back to research: the strategy's own pass mark. */
export const recheckBar = (rules: TeamRules) => (rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;
/** The share (%) of the pool one buy of the strategy may take (`POOL_SHARE`). */
export const poolShare = (rules: Pick<TeamRules, 'maxPoolSharePct'>) => rules.maxPoolSharePct ?? POOL_SHARE.pct;
/** The most SOL one buy may spend: `poolShare` of the pool's liquidity at the SOL price; undefined when either read is missing. */
export const poolCapSol = (rules: Pick<TeamRules, 'maxPoolSharePct'>, liquidityUsd: number | undefined, solPriceUsd: number | undefined) =>
  liquidityUsd !== undefined && solPriceUsd !== undefined && solPriceUsd > 0 ? poolShare(rules) / 100 * liquidityUsd / solPriceUsd : undefined;
export const QUEUE = { max: 32, maxUpPct: 35, deadPct: 80, quietMinutes: 15 } as const;
export const ENTRY = { confirmMs: 10_000, waitMs: 10_000, streamMs: 10_000 } as const;
/** What one of the worker's write calls carries, so a transaction stays well inside Convex's limits (32,000 documents scanned, 16,000 written,
 *  4,096 index ranges) whatever the number of teams: prices and peaks per `priced` call; portfolios per `profited` call, and the held coins and
 *  strategies those portfolios hold between them (each strategy writes its candles). The worker cuts its calls to these; Convex refuses more. */
export const WORKER_BATCH = { prices: 400, portfolios: 25, positions: 200, strategies: 100 } as const;
/** Why a pick waits in its strategy's queue: the strategy's own limits (`slots`, `budget`: HOTBOT's budget check), the portfolio's SOL
 *  (`paper`, `wallet`: its wallet check), or better picks that need the places it would take (`outranked`). */
export const QUEUE_REASON = {
  slots: 'Every slot is taken · waits for room',
  budget: 'Budget is full · waits for room',
  paper: 'Not enough practice SOL · waits for a sale',
  wallet: 'Wallet needs more SOL · waits for SOL',
  outranked: 'Better picks are ahead of it · waits its turn',
} as const;
/** A held coin as TraderBot's review timing reads it; `rungs` counts take-profits sold. */
export type ReviewedPosition = { entryPriceUsd: number; markPriceUsd: number; peakPriceUsd: number; since: number; rungs: number; lastReview: { at: number; priceUsd: number | null; rungs: number } | null };
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
export const TRADER_STATUSES = Object.keys(TRADER_STATUS) as TraderStatus[];

export type PresetId = 'runners' | 'dips' | 'clips' | 'degen' | 'oracle';
/** The four floors every preset holds as must-haves (`MUST_HAVE` below has the full list). */
export const FLOOR_MUST = ['liquidity', 'volume', 'marketCap', 'age'] as const;
export type Preset = { id: PresetId; name: string; blurb: string; rules: Partial<TeamRules>; dipPct: number; minFit: number; exitPlan: ExitPlanId; trailPct: number; /** The budget a new strategy of the preset is offered, 1 SOL unless set. */ budgetSol?: number; /** Coins held at once, 5 unless set; each coin's size is the budget split across them. */ maxOpen?: number; /** Rules a new strategy of the preset holds as must-haves from the start. */ mustHave?: MustHave[] };
/** The presets' numbers in production are private. Every `PRIVATE` value here is a placeholder. */
const PRIVATE = 0;
export const PRESETS: Preset[] = [
  { id: 'runners', name: 'Fresh runners', blurb: 'Liquid tokens with momentum', dipPct: PRIVATE, minFit: PRIVATE, exitPlan: 'trail', trailPct: PRIVATE, mustHave: [...FLOOR_MUST], rules: { minLiquidityUsd: PRIVATE, minVolume24hUsd: PRIVATE, minAgeMinutes: PRIVATE, maxTop10Percent: PRIVATE, buySlippageBps: PRIVATE } },
  { id: 'dips', name: 'Dip buyer', blurb: 'Waits for a pullback, then buys', dipPct: PRIVATE, minFit: PRIVATE, exitPlan: 'trail', trailPct: PRIVATE, mustHave: [...FLOOR_MUST], rules: { minLiquidityUsd: PRIVATE, minVolume24hUsd: PRIVATE, minAgeMinutes: PRIVATE, maxTop10Percent: PRIVATE, buySlippageBps: PRIVATE } },
  { id: 'degen', name: 'Degen', blurb: 'Brand-new coins, big swings', dipPct: PRIVATE, minFit: PRIVATE, exitPlan: 'clip', trailPct: PRIVATE, mustHave: [...FLOOR_MUST], rules: { minLiquidityUsd: PRIVATE, minVolume24hUsd: PRIVATE, minAgeMinutes: PRIVATE, maxTop10Percent: PRIVATE, buySlippageBps: PRIVATE } },
  { id: 'oracle', name: 'Oracle', blurb: 'An entry model picks the coins', dipPct: PRIVATE, minFit: PRIVATE, exitPlan: 'doubling', trailPct: PRIVATE, budgetSol: PRIVATE, maxOpen: PRIVATE, mustHave: [...FLOOR_MUST], rules: { minLiquidityUsd: PRIVATE, minVolume24hUsd: PRIVATE, minMarketCapUsd: PRIVATE, minAgeMinutes: PRIVATE, maxTop10Percent: PRIVATE, minEntryScore: PRIVATE, buySlippageBps: PRIVATE } },
  { id: 'clips', name: 'Clips', blurb: 'New coins, small quick profits, out fast', dipPct: PRIVATE, minFit: PRIVATE, exitPlan: 'clip', trailPct: PRIVATE, budgetSol: PRIVATE, maxOpen: PRIVATE, mustHave: [...FLOOR_MUST], rules: { minLiquidityUsd: PRIVATE, minVolume24hUsd: PRIVATE, minAgeMinutes: PRIVATE, maxTop10Percent: PRIVATE, maxMarketCapUsd: PRIVATE, recheckMovePct: PRIVATE, buySlippageBps: PRIVATE } },
];
export const BUDGETS = [0.5, 1, 2, 5];

/** Budget, per-trade size and position count follow from one budget choice. */
export function presetRules(id: PresetId, budgetSol: number, askFirst: boolean): TeamRules {
  const preset = PRESETS.find(row => row.id === id) ?? PRESETS[0], maxOpen = preset.maxOpen ?? 5;
  const tradeSol = Math.max(0.01, Math.round(budgetSol / maxOpen * 100) / 100);
  const rules: TeamRules = { ...structuredClone(DEFAULT_RULES), ...structuredClone(preset.rules), exits: exitPlan(preset.exitPlan, 300, preset.trailPct), mode: askFirst ? 'ask' : 'auto', allocationSol: budgetSol, amountSol: tradeSol, maxOpenPositions: maxOpen, researchPolicy: { ...structuredClone(DEFAULT_RESEARCH_POLICY), minimumScore: preset.minFit } };
  // The preset's must-haves, through the same patch a person's Settings use.
  return preset.mustHave?.length ? applyPatch(rules, { mustHave: preset.mustHave }) : rules;
}

export const BLANK = { preset: 'degen' as PresetId, name: 'New strategy' };
export function blankRules(): TeamRules {
  const rules = presetRules(BLANK.preset, 1, false);
  return { ...rules, minLiquidityUsd: 0, minVolume24hUsd: 0, minMarketCapUsd: 0, maxMarketCapUsd: 0, minAgeMinutes: 0, maxTop10Percent: 100, exits: exitPlan('trail', 300, 15) };
}

/** A strategy as it trades: everything but its name, description and the money in it, with keys sorted so stored and new rules compare.
 *  Two strategies with the same key buy the same coins the same way (`team.command` refuses the second in one workspace). */
export function tradesAs(row: { preset: string; dipPct: number; rules: TeamRules }) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, canonical(field)])) : value;
  return JSON.stringify(canonical({ preset: row.preset, dipPct: row.dipPct, rules: { ...row.rules, allocationSol: undefined, amountSol: undefined, maxPoolSharePct: undefined } }));
}
/** Plain settings shown to people; everything else stays in rules under Advanced. */
export type Extra = { maxAgeMinutes?: number; minMove1hPct?: number; maxMove1hPct?: number; sweetMove1hLowPct?: number; sweetMove1hHighPct?: number; minBuyers1h?: number; minHolders?: number; minBuySellRatio?: number; maxDrawdownPct?: number; minLpBurnPct?: number; minEntryScore?: number; minTurnover1h?: number; maxTurnover1h?: number };
export const EXTRA_KEYS = ['maxAgeMinutes', 'minMove1hPct', 'maxMove1hPct', 'sweetMove1hLowPct', 'sweetMove1hHighPct', 'minBuyers1h', 'minHolders', 'minBuySellRatio', 'maxDrawdownPct', 'minLpBurnPct', 'minEntryScore', 'minTurnover1h', 'maxTurnover1h'] as const;
/** Rules a strategy can make must-haves: a coin that misses one never passes, instead of the miss weighing against the rest. The four floors
 *  (`FLOOR_MUST`, above) are must-haves on every preset and by default (types/hotbot.ts DEFAULT_RESEARCH_POLICY). */
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
export type Fits = { count: number; capped: boolean; tokens: { symbol: string; logo: string | null; address: string; marketCapUsd: number | null }[] };
/** One take-profit: sell `sellPct` of the original bag at a gain of `gainPct` (or on a `pullbackPct` pullback after reaching it). */
export type TakeProfit = { gainPct: number; sellPct: number; pullbackPct?: number };
/** `exits` is a whole plan from Settings: it replaces the strategy's exits (keeping its sell slippage), trailing stop included. */
/** Patch words for ShieldBot's holder groups, as people and drafts say them: the share of supply a group is weighed over (0 off). */
export const HOLDING_WORDS = { maxDevPercent: 'dev', maxBundlersPercent: 'bundlers', maxSnipersPercent: 'snipers' } as const;
export type HoldingWord = keyof typeof HOLDING_WORDS;
export type StrategyPatch = Extra & { [K in HoldingWord]?: number } & { shield?: Partial<ShieldRules>; sellModelPct?: number; inactivity?: InactivityRules | null; name?: string; minMarketCapUsd?: number; maxMarketCapUsd?: number; budgetSol?: number; tradeSol?: number; maxOpen?: number; maxPoolSharePct?: number; exitPlan?: ExitPlanId; exits?: ExitPlan; takeProfits?: TakeProfit[]; stopLossPct?: number; askFirst?: boolean; dipPct?: number; minLiquidityUsd?: number; minAgeMinutes?: number; maxTop10Percent?: number; minVolume24hUsd?: number; mustHave?: MustHave[]; hourCrashLimit?: number; entryActivity?: boolean; entryDelayMinutes?: number; entryMaxUpPct?: number; streams?: Stream[]; rebuy?: RebuyRules | null; recheckMovePct?: number | null; codeOnly?: boolean; passMark?: number };
export function applyPatch(rules: TeamRules, patch: StrategyPatch): TeamRules {
  const next = structuredClone(rules);
  if (patch.budgetSol !== undefined) { next.allocationSol = patch.budgetSol; if (next.amountSol > patch.budgetSol) next.amountSol = patch.budgetSol; }
  if (patch.tradeSol !== undefined) next.amountSol = patch.tradeSol;
  if (patch.maxOpen !== undefined) next.maxOpenPositions = patch.maxOpen;
  // The pool share is stored only when it isn't the default, so a copy at the default reads the same.
  if (patch.maxPoolSharePct !== undefined) { if (patch.maxPoolSharePct === POOL_SHARE.pct) delete next.maxPoolSharePct; else next.maxPoolSharePct = patch.maxPoolSharePct; }
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
  if (patch.entryActivity === true) next.entryActivity = true; else if (patch.entryActivity === false) delete next.entryActivity;
  if (patch.askFirst !== undefined) next.mode = patch.askFirst ? 'ask' : 'auto';
  if (patch.minLiquidityUsd !== undefined) next.minLiquidityUsd = patch.minLiquidityUsd;
  if (patch.minAgeMinutes !== undefined) next.minAgeMinutes = patch.minAgeMinutes;
  if (patch.maxTop10Percent !== undefined) next.maxTop10Percent = patch.maxTop10Percent;
  if (patch.minVolume24hUsd !== undefined) next.minVolume24hUsd = patch.minVolume24hUsd;
  if (patch.minMarketCapUsd !== undefined) next.minMarketCapUsd = patch.minMarketCapUsd;
  if (patch.maxMarketCapUsd !== undefined) next.maxMarketCapUsd = patch.maxMarketCapUsd;
  for (const key of EXTRA_KEYS) if (patch[key] !== undefined) next[key] = patch[key]! > 0 ? patch[key] : undefined;
  for (const key of ['hourCrashLimit', 'entryDelayMinutes', 'entryMaxUpPct', 'sellModelPct'] as const) if (patch[key] !== undefined) { if (patch[key]! > 0) next[key] = patch[key]; else delete next[key]; }
  // Streams are stored in their own order, and all of them as none, so the same pick always reads the same.
  if (patch.streams !== undefined) {
    if (!patch.streams.length || patch.streams.some(stream => !STREAMS.includes(stream))) throw new Error('Pick at least one of the streams.');
    const picked = STREAMS.filter(stream => patch.streams!.includes(stream));
    if (picked.length === STREAMS.length) delete next.streams; else next.streams = picked;
  }
  // SniperBot's re-buys: null turns them off; the settings are stored as their six fields alone.
  if (patch.rebuy === null) delete next.rebuy;
  else if (patch.rebuy !== undefined) { const { steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin } = patch.rebuy; next.rebuy = { steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin }; }
  if (patch.inactivity === null) next.inactivity = null;
  else if (patch.inactivity !== undefined) {
    const { minutes, priceRangePct, maxTrades5m, maxVolumeCapPct5m } = patch.inactivity;
    const rule = { minutes, priceRangePct, maxTrades5m, maxVolumeCapPct5m };
    if (JSON.stringify(rule) === JSON.stringify(INACTIVITY_DEFAULT)) delete next.inactivity; else next.inactivity = rule;
  }
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
/** A strategy's settings as a patch would set them, every key with its value now (null when unset): what applyPatch writes, read back, so an
 *  agent reads in the shape it writes (`convex/agentApi`). Typed over StrategyPatch, so tsc fails until a new key is read back here. */
export function settingsOf(strategy: { name: string; rules: TeamRules; dipPct: number }): { [K in keyof Required<StrategyPatch>]: StrategyPatch[K] | null } {
  const r = strategy.rules, shield = shieldOf(r), extra = (key: typeof EXTRA_KEYS[number]) => r[key] ?? null;
  return {
    name: strategy.name, budgetSol: r.allocationSol, tradeSol: r.amountSol, maxOpen: r.maxOpenPositions, maxPoolSharePct: r.maxPoolSharePct ?? POOL_SHARE.pct,
    exitPlan: namedExitPlan(r.exits) ?? null, exits: r.exits, takeProfits: r.exits.takeProfits, stopLossPct: trailPct(r.exits) ?? 0, askFirst: r.mode === 'ask', dipPct: strategy.dipPct,
    minLiquidityUsd: r.minLiquidityUsd, minAgeMinutes: r.minAgeMinutes, maxTop10Percent: r.maxTop10Percent, minVolume24hUsd: r.minVolume24hUsd, minMarketCapUsd: r.minMarketCapUsd, maxMarketCapUsd: r.maxMarketCapUsd,
    maxAgeMinutes: extra('maxAgeMinutes'), minMove1hPct: extra('minMove1hPct'), maxMove1hPct: extra('maxMove1hPct'), sweetMove1hLowPct: extra('sweetMove1hLowPct'), sweetMove1hHighPct: extra('sweetMove1hHighPct'),
    minBuyers1h: extra('minBuyers1h'), minHolders: extra('minHolders'), minBuySellRatio: extra('minBuySellRatio'), maxDrawdownPct: extra('maxDrawdownPct'), minLpBurnPct: extra('minLpBurnPct'),
    minEntryScore: extra('minEntryScore'), minTurnover1h: extra('minTurnover1h'), maxTurnover1h: extra('maxTurnover1h'),
    maxDevPercent: shield.dev.weighAbove ?? 0, maxBundlersPercent: shield.bundlers.weighAbove ?? 0, maxSnipersPercent: shield.snipers.weighAbove ?? 0, shield,
    sellModelPct: r.sellModelPct ?? 0, inactivity: inactivityOf(r.inactivity), hourCrashLimit: r.hourCrashLimit ?? 0,
    entryActivity: r.entryActivity === true, entryDelayMinutes: r.entryDelayMinutes ?? 0, entryMaxUpPct: r.entryMaxUpPct ?? 0, streams: streamsOf(r), rebuy: r.rebuy ?? null, recheckMovePct: r.recheckMovePct ?? REPICK.movePct,
    codeOnly: r.codeOnly === true, passMark: (r.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore, mustHave: mustHaves(r),
  };
}

/** How every team function fails (a ConvexError's data): `message` is written for everyone, `detail` is the complete cause and only admin accounts
 *  receive it. `fault`: HOTBOT's side broke (a bug, a timeout, a provider), not a message about the person's own input. */
export type Failure = { message: string; detail?: string; fault?: true };

/** Every change a person can make, from buttons or the command bar. */
export type Command =
  | { type: 'priceDisplay'; unit: 'price' | 'marketCap' }
  | { type: 'pause' | 'resume' | 'restore' | 'delete'; strategyId: string }
  /** Archive a strategy that holds nothing; with `sell`, sell what it holds first and archive once the last coin sells. */
  | { type: 'archive'; strategyId: string; sell?: boolean }
  | { type: 'update'; strategyId: string; patch: StrategyPatch }
  | { type: 'approve' | 'skip' | 'buyNow' | 'cancel' | 'sell'; itemId: string }
  | { type: 'sellAll'; strategyId?: string }
  | { type: 'stopAll' | 'resumeAll' | 'resetPractice' }
  /** Admin only, on their own team: add practice SOL (it raises the starting balance too), and leave archived strategies' losses out of the totals. */
  | { type: 'addPaperSol'; amountSol: number }
  | { type: 'hideArchivedLosses'; hide: boolean }
  | { type: 'research'; token: DemoToken; strategyId?: string }
  | { type: 'newStrategy'; preset: PresetId; budgetSol: number; askFirst: boolean }
  | { type: 'createStrategy'; name: string; description?: string; preset: PresetId; budgetSol: number; askFirst: boolean; patch: StrategyPatch }
  /** A strategy made in the Lab: a copy of one of the team's (`from`) or a blank one (`blankRules`), with the draft's changes, saved paused. */
  | { type: 'labStrategy'; name: string; from?: string; patch: StrategyPatch }
  /** Keep a plan as one of the person's own exit plans under its name (one of the same name is replaced), or forget one. */
  | { type: 'saveExitPlan'; exits: ExitPlan }
  | { type: 'forgetExitPlan'; name: string }
  /** Which portfolio the pages show. It moves no coin: each strategy trades in its own portfolio (`realSolCopy`). */
  | { type: 'mode'; mode: Mode }
  /** A running copy of each practice strategy that trades Real SOL, same rules and budget; the practice ones keep running beside them. */
  | { type: 'realSolCopy'; strategyIds: string[] };

/** Events in the action stream. Buttons come from the event kind and the item's current stage. */
/** `watch` is HOTBOT noting something about the team, `alert` is HOTBOT asking for you, `review` is TraderBot's second-opinion review. */
export type EventKind = 'started' | 'found' | 'passed' | 'rejected' | 'armed' | 'approval' | 'queued' | 'bought' | 'sold' | 'expired' | 'skipped' | 'failed' | 'blocked' | 'paused' | 'resumed' | 'updated' | 'proposal' | 'mode' | 'wallet' | 'watch' | 'alert' | 'review' | 'archived' | 'restored' | 'deleted';
/** What a HOTBOT alert is about, so the app can offer its one action: practice SOL spent, the live wallet short of SOL, buys waiting for
 *  your OK, or the trading worker stopped. */
export const ALERT_TOPICS = ['practiceSol', 'walletSol', 'approvals', 'worker'] as const;
export type AlertTopic = typeof ALERT_TOPICS[number];
export const RISKY: Command['type'][] = ['sellAll', 'stopAll', 'mode', 'realSolCopy', 'resetPractice'];

// ---- Strategy drafts from plain words: Jev reads the choices and numbers a person states, code builds every rule from them. ----
export type Risk = 'low' | 'medium' | 'high';
export type Hold = 'quick' | 'swing' | 'moon';
/** What a plan was built from: the choices Jev read (`age` and the rest are null or false when the words don't say) and the numbers a person stated in `set`.
 *  Refining changes only what is said; every rule is rebuilt from it in code, on the server and in the browser. */
export type Intent = { base: PresetId; risk: Risk; hold: Hold; age: 'new' | 'established' | null; clean: boolean; moving: boolean; askFirst: boolean; budgetSol: number; set: StrategyPatch };
/** One tap that changes the plan: applied in the browser, no call. */
export type Fix = { label: string; patch: StrategyPatch };
/** `team.draft`'s answer: the plan, or a sign-in ask once an invite's drafts in words for the hour are used. */
export type DraftReply = Draft | { signIn: true };
export type Draft = {
  intent: Intent; name: string; description: string; preset: PresetId; budgetSol: number; askFirst: boolean; patch: StrategyPatch;
  matches: { count: number; tokens: { symbol: string; logo: string | null; address: string }[] } | null;
  /** HOTBOT's one honest remark about the plan, and the taps that fix it. */
  note: string | null; fixes: Fix[];
};
export const presetIntent = (base: PresetId, budgetSol = PRESETS.find(row => row.id === base)?.budgetSol ?? 1): Intent => ({ base, risk: 'medium', hold: 'swing', age: null, clean: false, moving: false, askFirst: false, budgetSol, set: {} });

const RISK = { low: { floors: 2, age: 2, top10: -5 }, medium: { floors: 1, age: 1, top10: 0 }, high: { floors: 0.4, age: 0.25, top10: 15 } } as const;
const HOLD_PLAN: Record<Hold, ExitPlanId | null> = { quick: 'trail', swing: null, moon: 'stake' };
const DAY = 24 * 60;
/** Two significant digits, rounded down, so a derived floor reads like a number a person would pick. */
const nice = (n: number) => n < 100 ? Math.round(n) : Math.floor(n / 10 ** (Math.floor(Math.log10(n)) - 1)) * 10 ** (Math.floor(Math.log10(n)) - 1);
const TINY = { note: 'Coins this small often jump before the team finishes checking them', fix: { label: 'Use $5K–$50K', patch: { minMarketCapUsd: 5_000, maxMarketCapUsd: 50_000 } } satisfies Fix };

/** Every rule a plan comes to: the preset's numbers scaled by risk, then the person's own numbers, then a pass so the plan can match what it describes. */
export function planDraft(intent: Intent): Omit<Draft, 'matches'> {
  // Brand-new coins are Degen's ground (Clips trades them too); Degen's own age floor makes no sense for established coins.
  const base: PresetId = intent.age === 'new' && intent.base !== 'clips' ? 'degen' : intent.age === 'established' && intent.base === 'degen' ? 'runners' : intent.base;
  const preset = PRESETS.find(row => row.id === base) ?? PRESETS[0], start = presetRules(preset.id, intent.budgetSol, intent.askFirst), scale = RISK[intent.risk], set = intent.set;
  const patch: StrategyPatch = {
    exitPlan: HOLD_PLAN[intent.hold] ?? preset.exitPlan,
    minLiquidityUsd: Math.round(start.minLiquidityUsd * scale.floors), minVolume24hUsd: Math.round(start.minVolume24hUsd * scale.floors),
    minAgeMinutes: Math.round(start.minAgeMinutes * scale.age), maxTop10Percent: Math.min(80, start.maxTop10Percent + scale.top10),
  };
  // Clips keeps its 10-minute floor on new coins: most one-minute rugs come before it.
  if (intent.age === 'new') { patch.maxAgeMinutes = DAY; if (base !== 'clips') patch.minAgeMinutes = 0; }
  if (intent.age === 'established') patch.minAgeMinutes = Math.max(patch.minAgeMinutes ?? 0, DAY);
  if (intent.clean) Object.assign(patch, { maxDevPercent: 10, maxBundlersPercent: 10 });
  if (intent.moving) Object.assign(patch, { minMove1hPct: 5, minBuyers1h: 50 });
  Object.assign(patch, set);
  // Explicit cap bounds override preset bounds. Unspecified liquidity and volume floors are capped by draft heuristics below.
  const cap = { low: patch.minMarketCapUsd ?? start.minMarketCapUsd, high: patch.maxMarketCapUsd ?? start.maxMarketCapUsd };
  if (cap.high > 0 && cap.low > cap.high) [cap.low, cap.high] = set.minMarketCapUsd !== undefined && set.maxMarketCapUsd !== undefined ? [cap.high, cap.low] : [0, cap.high];
  if (cap.high > 0) {
    patch.minMarketCapUsd = cap.low; patch.maxMarketCapUsd = cap.high;
    const smallest = cap.low > 0 ? cap.low : cap.high;
    if (set.minLiquidityUsd === undefined) patch.minLiquidityUsd = Math.min(patch.minLiquidityUsd ?? 0, nice(smallest * 0.25));
    if (set.minVolume24hUsd === undefined) patch.minVolume24hUsd = Math.min(patch.minVolume24hUsd ?? 0, nice(smallest * 0.5));
  }
  const rules = applyPatch(start, patch), dip = patch.dipPct ?? preset.dipPct, bots = plainBots(rules, dip);
  const tiny = cap.high > 0 && cap.high < 10_000;
  return { intent, name: draftName(preset, rules, dip), description: `${bots.research}. ${bots.sniper}.`, preset: preset.id, budgetSol: intent.budgetSol, askFirst: intent.askFirst, patch, note: tiny ? TINY.note : null, fixes: tiny ? [TINY.fix] : [] };
}
/** A fix applied in the browser: the plan is rebuilt from what it was built from, so its numbers stay coherent. The live count belongs to the old rules, so it goes until the next rebuild. */
export const withFix = (draft: Draft, fix: Fix): Draft => ({ ...planDraft({ ...draft.intent, set: { ...draft.intent.set, ...fix.patch } }), matches: null });
/** The dip a draft waits for before buying: the person's own, or its preset's. */
export const draftDip = (draft: Pick<Draft, 'preset' | 'patch'>) => draft.patch.dipPct ?? PRESETS.find(row => row.id === draft.preset)!.dipPct;
/** A plan keeps its name through every change; only a new name in the words ("call it …") replaces it. */
export const keepName = (before: Draft, after: Draft): Draft => after.name !== planDraft(after.intent).name ? after : { ...after, name: before.name };

/** Rules words can turn off, by name. */
export const CLEARABLE = ['maxAgeMinutes', 'minAgeMinutes', 'minMarketCapUsd', 'maxMarketCapUsd', 'dipPct', ...EXTRA_KEYS.filter(key => key !== 'maxAgeMinutes'), 'maxDevPercent', 'maxBundlersPercent', 'maxSnipersPercent'] as const satisfies readonly (keyof StrategyPatch)[];
/** A clearable rule's value on a strategy, 0 when off: a holder word reads its ShieldBot group's weighed share. */
export const clearableValue = (rules: TeamRules, dipPct: number, key: Clearable) => key === 'dipPct' ? dipPct : key in HOLDING_WORDS ? shieldOf(rules)[HOLDING_WORDS[key as HoldingWord]].weighAbove : (rules[key as Exclude<Clearable, HoldingWord | 'dipPct'>] ?? 0);
export type Clearable = typeof CLEARABLE[number];
/** What a person's words say, and only that: a change to a plan or a strategy, never a whole plan. `age: null` means any age was asked for. */
export type Reading = { base?: PresetId; risk?: Risk; hold?: Hold; age?: 'new' | 'established' | null; askFirst?: boolean; clean?: true; moving?: true; budgetSol?: number; set: StrategyPatch; clear: Clearable[]; name?: string; fresh: boolean; unrealistic: boolean; unsure?: true };
/** A plan's intent with a reading applied: what the words said changes, the rest stays. */
export function refine(intent: Intent, reading: Reading): Intent {
  const set: StrategyPatch = { ...intent.set, ...reading.set };
  for (const key of reading.clear) set[key] = 0;
  return { base: reading.base ?? intent.base, risk: reading.risk ?? intent.risk, hold: reading.hold ?? intent.hold, age: reading.age === undefined ? intent.age : reading.age, clean: reading.clean ?? intent.clean, moving: reading.moving ?? intent.moving, askFirst: reading.askFirst ?? intent.askFirst, budgetSol: reading.budgetSol ?? intent.budgetSol, set };
}
/** The same reading on a running strategy: its numbers, the rules turned off, and the style words as moves from where the rules are now (safer doubles the floors, riskier cuts them; a holding style picks its exit plan). */
export function tune(rules: TeamRules, reading: Reading): StrategyPatch {
  const patch: StrategyPatch = {};
  if (reading.risk && reading.risk !== 'medium') {
    const step = RISK[reading.risk];
    Object.assign(patch, { minLiquidityUsd: Math.round(rules.minLiquidityUsd * step.floors), minVolume24hUsd: Math.round(rules.minVolume24hUsd * step.floors), minAgeMinutes: Math.round(rules.minAgeMinutes * step.age), maxTop10Percent: Math.max(10, Math.min(80, rules.maxTop10Percent + step.top10)) });
  }
  const plan = reading.hold && HOLD_PLAN[reading.hold];
  if (plan) patch.exitPlan = plan;
  if (reading.age === 'new') Object.assign(patch, { maxAgeMinutes: DAY, minAgeMinutes: 0 });
  if (reading.age === 'established') Object.assign(patch, { maxAgeMinutes: 0, minAgeMinutes: Math.max(patch.minAgeMinutes ?? rules.minAgeMinutes, DAY) });
  if (reading.age === null) patch.maxAgeMinutes = 0;
  if (reading.clean) Object.assign(patch, { maxDevPercent: 10, maxBundlersPercent: 10 });
  if (reading.moving) Object.assign(patch, { minMove1hPct: 5, minBuyers1h: 50 });
  if (reading.askFirst !== undefined) patch.askFirst = reading.askFirst;
  if (reading.budgetSol !== undefined) patch.budgetSol = reading.budgetSol;
  Object.assign(patch, reading.set);
  for (const key of reading.clear) patch[key] = 0;
  if (reading.name) patch.name = reading.name;
  return patch;
}
/** What a draft comes to at a budget: the size of each coin follows the budget unless the person stated one. */
export function draftPatch(draft: Pick<Draft, 'patch'>, budgetSol: number): StrategyPatch {
  return { ...draft.patch, budgetSol, ...(draft.patch.tradeSol !== undefined ? { tradeSol: Math.min(draft.patch.tradeSol, budgetSol) } : {}) };
}
export const draftRules = (draft: Pick<Draft, 'preset' | 'askFirst' | 'patch'>, budgetSol: number) => applyPatch(presetRules(draft.preset, budgetSol, draft.askFirst), draftPatch(draft, budgetSol));

/** A short plain name from the rules; a preset with nothing added keeps its own. */
function draftName(preset: Preset, rules: TeamRules, dipPct: number) {
  const age = rules.maxAgeMinutes ? 'brand-new' : rules.minAgeMinutes >= DAY ? 'established' : '';
  const size = rules.maxMarketCapUsd > 0 && rules.maxMarketCapUsd <= 25_000 ? 'tiny' : rules.maxMarketCapUsd > 0 && rules.maxMarketCapUsd <= 5e6 ? 'small' : rules.minMarketCapUsd >= 10e6 ? 'big' : '';
  const tail = dipPct >= 3 ? ' on dips' : rules.minMove1hPct ? ' on the move' : '';
  const lead = [age, size].filter(Boolean).join(' ');
  if (!lead && !tail) return preset.name;
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
    ...(rules.minEntryScore !== undefined ? [looks('sparkles', `Only coins the entry model ranks ${rules.minEntryScore}+ of 100`)] : []),
    ...(rules.minTurnover1h !== undefined || rules.maxTurnover1h !== undefined ? [looks('chart', `Traded ${rules.minTurnover1h !== undefined && rules.maxTurnover1h !== undefined ? `${rules.minTurnover1h}–${rules.maxTurnover1h}×` : rules.minTurnover1h !== undefined ? `${rules.minTurnover1h}×+` : `under ${rules.maxTurnover1h}×`} its cap in the hour`)] : []),
    ...(rules.minBuySellRatio ? [looks('scale', 'More buys than sells')] : []),
    ...(rules.maxDrawdownPct ? [looks('trending-up', 'Still near its high')] : []),
    ...(rules.minLpBurnPct ? [looks('lock', rules.lpBurnHard ? 'Only coins with liquidity burned' : 'Liquidity locked')] : []),
    ...(rules.streams ? [looks('zap', `Finds coins in ${rules.streams.map(stream => STREAM_NAMES[stream]).join(', ')}`)] : []),
    ...(rules.hourCrashLimit ? [buys('trending-down', `Skips a ${rules.hourCrashLimit}%+ one-minute fall in the last hour`)] : []),
    dipPct > 0 ? buys('trending-down', `Waits for a ${dipPct}% dip`) : rules.entryDelayMinutes ? buys('clock', `Watches it ${rules.entryDelayMinutes} min, buys if it still fits${rules.entryMaxUpPct ? ` and didn't run ${rules.entryMaxUpPct}%+` : ''}`) : buys('zap', 'Buys right away'),
    ...(rules.entryActivity === true ? [buys('chart', 'Waits for active trading')] : []),
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
/** One plain line per bot. TraderBot's is the exit plan's own summary (a preset's plan, or the one the hold style picks). `checks` are what ResearchBot also looks for beyond its line. */
export function plainBots(rules: TeamRules, dipPct = 0) {
  const chips = plainRules(rules, dipPct), find = (icon: PlainIcon) => chips.find(chip => chip.group === 'looks' && chip.icon === icon)?.text;
  const age = find('sparkles') ?? find('clock'), cap = find('coins'), liquidity = find('droplets');
  const finds = [[age, cap].filter(Boolean).map(text => lower(text!)).join(', '), !cap && liquidity ? `with ${lower(liquidity)}` : ''].filter(Boolean).join(' ');
  const said = [age, cap, cap ? undefined : liquidity], ask = rules.mode === 'ask', idle = inactivityOf(rules.inactivity);
  return {
    research: `Looks for coins ${finds || 'that fit your rules'}`,
    sniper: dipPct > 0 ? `Waits for a ${dipPct}% dip, then ${ask ? 'asks you' : 'buys'}` : ask ? 'Picks the moment, then asks you first' : 'Buys the moment one checks out',
    trader: `${describeExits(rules.exits)}${rules.sellModelPct ? `; sells the rest once the sell-or-keep model is ${rules.sellModelPct}% sure` : ''}${idle ? `; sells after ${idle.minutes} minutes with price, trades and volume quiet` : ''}${rules.codeOnly ? '; code alone sells, no AI reviews' : ''}`,
    checks: chips.filter(chip => chip.group === 'looks' && !said.includes(chip.text)),
  };
}

/** Applies the discovery filters to a Mobula Pulse row. Missing data never passes a set limit. */
export function passesExtra(rules: TeamRules, row: Record<string, unknown>) {
  const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const created = typeof row.createdAt === 'string' ? Date.parse(row.createdAt) : typeof row.created_at === 'string' ? Date.parse(row.created_at as string) : NaN;
  const ageMinutes = Number.isFinite(created) ? (Date.now() - created) / 60000 : undefined;
  if (rules.maxAgeMinutes !== undefined && (ageMinutes === undefined || ageMinutes > rules.maxAgeMinutes)) return false;
  if (rules.minAgeMinutes > 0 && ageMinutes !== undefined && ageMinutes < rules.minAgeMinutes) return false;
  if (rules.minMove1hPct !== undefined && !((n(row.price_change_1h) ?? -Infinity) >= rules.minMove1hPct)) return false;
  // The 1h move is weighted: discovery only drops a coin past twice its limit, which no fit can carry.
  if (rules.maxMove1hPct !== undefined && !((n(row.price_change_1h) ?? Infinity) <= rules.maxMove1hPct * 2)) return false;
  if (rules.minBuyers1h !== undefined && !((n(row.buyers_1h) ?? 0) >= rules.minBuyers1h)) return false;
  // Turnover on the row's own hour volume and cap; a row missing either is left to research.
  if (rules.minTurnover1h !== undefined || rules.maxTurnover1h !== undefined) {
    const hour = n(row.volume_1h) ?? ((n(row.volume_buy_1h) !== undefined || n(row.volume_sell_1h) !== undefined) ? (n(row.volume_buy_1h) ?? 0) + (n(row.volume_sell_1h) ?? 0) : undefined), cap = n(row.marketCap);
    if (hour !== undefined && cap !== undefined && cap > 0) { const turnover = hour / cap; if ((rules.minTurnover1h !== undefined && turnover < rules.minTurnover1h) || (rules.maxTurnover1h !== undefined && turnover > rules.maxTurnover1h)) return false; }
  }
  // A holder group ShieldBot refuses at needs its share on the row: missing data never passes a set limit.
  const shield = shieldOf(rules), under = (key: 'dev' | 'bundlers' | 'snipers', value: unknown) => !shield[key].refuseAt || (n(value) !== undefined && n(value)! < shield[key].refuseAt);
  return under('dev', row.devHoldings) && under('bundlers', row.bundlersHoldings) && under('snipers', row.snipersHoldings);
}
