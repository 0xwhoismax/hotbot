import type { TradePresetTargetConfig } from '../convex/lib/tradePresets';
import { EXIT_RUNGS, SCALE_OUT_MIN_SELL_PCT, TRAIL, exitPlan, soldOutAtPct, trailPct } from './exits';
import { validateQuietExits, type DrainRules } from './inactivity';
import { validateActiveTrading, type ActiveTrading } from './entryActivity';
import { SHIELD_ROWS, pickedInsiders, pickedLaunchpads, type ShieldRules } from './shield';
import { validateSchedule, type TradingHours } from './schedule';
import { validateBreakout, type BreakoutRules } from './breakout';
import { UNREAD_POOL_FEE_BPS } from './market';
import { PLATFORM_FEE_BPS, SWAP_NETWORK_LAMPORTS } from './swapCosts';

export const AGENT_ROLES = ['coordinator', 'research', 'sniper', 'trader', 'launch'] as const;
export type AgentRole = typeof AGENT_ROLES[number];
export type TeamAgent = { id: string; role: AgentRole; name: string; color: string; instructions: string; enabled: boolean };
export type DemoToken = { address: string; name: string; symbol: string; decimals: number };
export const RESEARCH_RULE_KEYS = ['liquidity', 'volume', 'market_cap', 'age', 'holders'] as const;
export type ResearchRuleKey = typeof RESEARCH_RULE_KEYS[number];
export type RuleTreatment = { mode: 'weighted' | 'hard' | 'off'; weight: number };
export type ResearchPolicy = {
  minimumScore: number;
  checks: Record<ResearchRuleKey, RuleTreatment>;
};
// Equal weights avoid pretending to have empirically fitted coefficients. 100 = meets target.
/** A strategy's own floors (liquidity, volume, market cap, age) are must-haves unless Settings turns one back to weighted (with every
 *  launchpad coin in the rows, the weighted fit admitted coins at half the floors). */
export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  minimumScore: 100,
  checks: { liquidity: { mode: 'hard', weight: 1 }, volume: { mode: 'hard', weight: 1 }, market_cap: { mode: 'hard', weight: 1 }, age: { mode: 'hard', weight: 1 }, holders: { mode: 'weighted', weight: 1 } },
};
/** The largest share (%) of a pool's liquidity (one side: the quote side it prices on, the indexer row's `liquidity`) one buy may take,
 *  for a strategy without its own `maxPoolSharePct`, and the range people may set. */
export const POOL_SHARE = { pct: 1, min: 0.1, max: 10 } as const;
/** The smallest buy any strategy sends (types/team `pickSol`): a Real SOL strategy's per-coin size is at least this, so its largest buy is its own size. */
export const MIN_BUY_SOL = 0.01;
/** The least a stop under the buy that nothing arms (no trail, gain or time) may sit under the entry. A buy fills above the price by its
 *  fees: pump.fun's pool fee (`UNREAD_POOL_FEE_BPS`), HOTBOT's and the network's on the smallest buy. A stop inside them sells a coin whose
 *  price never moved, so the price itself must fall a further `STOP_ROOM_PCT` before the stop sells. */
const STOP_ROOM_PCT = 1;
const BUY_FEES_PCT = (1 - (1 - SWAP_NETWORK_LAMPORTS / 1e9 / MIN_BUY_SOL) / ((1 + UNREAD_POOL_FEE_BPS / 10_000) * (1 + PLATFORM_FEE_BPS / 10_000))) * 100;
export const FIXED_STOP_MIN_PCT = Math.ceil(BUY_FEES_PCT + STOP_ROOM_PCT);
/** A Real SOL strategy's loss stop, for one without its own `lossStopPct`: buys stop once its losses below its best point reach this share
 *  (%) of its budget (types/buyGate `stopTrips`). `LOSS_STOP_PICKS`: the choices the app offers, for a Practice strategy's stop too. */
export const LOSS_STOP_PCT = 50;
export const LOSS_STOP_PICKS = [25, 50, 75] as const;
export type TeamRules = {
  mode: 'ask' | 'auto'; blockedMints: string[];
  allocationSol: number; amountSol: number; maxOpenPositions: number;
  /** The largest share (%) of the pool's one-sided liquidity one buy may take (`POOL_SHARE`); omitted, `POOL_SHARE.pct`. */
  maxPoolSharePct?: number;
  /** Real SOL: the loss below the strategy's best point, as a share (%) of its budget, that stops its buys; omitted, `LOSS_STOP_PCT`. */
  lossStopPct?: number;
  /** Practice: the same loss stop as a share (%) of the budget; omitted, off. Ignored on a strategy that has a Real SOL copy (types/buyGate `practiceStopTrips`). */
  practiceStopPct?: number;
  minLiquidityUsd: number; minVolume24hUsd: number; minMarketCapUsd: number; maxMarketCapUsd: number;
  minAgeMinutes: number; maxTop10Percent: number;
  buySlippageBps: number; exits: TradePresetTargetConfig;
  /** Omit to use the documented default research policy; save an object for custom weighting. */
  researchPolicy?: ResearchPolicy;
  /** Discovery filters beyond the research checks; omitted means no limit. */
  maxAgeMinutes?: number; minMove1hPct?: number; maxMove1hPct?: number; sweetMove1hLowPct?: number; sweetMove1hHighPct?: number; minBuyers1h?: number;
  /** Quality checks from the peak-outcome rule sets: holder breadth, buy pressure, strength versus the high, locked liquidity. */
  minHolders?: number; minBuySellRatio?: number; maxDrawdownPct?: number; minLpBurnPct?: number;
  /** Turnover: the last hour's volume as a multiple of the market cap, a hard band when either end is set (2–10× marks a coin that is moving; under 1× and over 20× sit stale). */
  minTurnover1h?: number; maxTurnover1h?: number;
  /** Seconds since the coin left its launchpad's curve (research's `graduatedSeconds`): a coin that graduated less long ago waits at the
   *  screen. A coin without a graduation time passes. */
  minGraduatedSeconds?: number;
  /** The max age is a must-have: a coin past it never passes, instead of weighing against the rest. */
  maxAgeHard?: boolean;
  /** The burned-liquidity floor is a must-have: a coin whose creator can still pull its pool (or with no burn data) never passes. */
  lpBurnHard?: boolean;
  /** ShieldBot's scam checks (types/shield.ts), only what the strategy changed from `SHIELD_DEFAULTS`. */
  shield?: Partial<ShieldRules>;
  /** Optional entry rule: reject a measured one-minute fall at or above this percent in the last hour. Unset is off. */
  hourCrashLimit?: number;
  /** SniperBot watches a pick this many minutes after research and buys at market then if code's recheck still passes it, letting it go if it ran
   *  `entryMaxUpPct` past the research price by then (`ENTRY` in types/team). */
  entryDelayMinutes?: number; entryMaxUpPct?: number;
  /** SniperBot's active-trading check (types/entryActivity.ts): discovery passes over a coin that misses it and an entry waits for it;
   *  omitted is off. */
  activeTrading?: ActiveTrading;
  /** SniperBot buys the break of a quiet range (types/breakout.ts) instead of at once; omitted is off. Not with a dip or an entry delay. */
  breakout?: BreakoutRules;
  /** When it buys (types/schedule.ts): UTC hours and weekdays (`getUTCDay`); omitted is always. New picks, entries and re-buys wait outside them. */
  tradingHours?: TradingHours; tradingDays?: number[];
  /** Where it finds coins (`STREAMS`): bonding, graduated or, omitted, both. */
  streams?: Stream[];
  /** SniperBot's re-buys (types/rebuy.ts); omitted, a coin the strategy traded never comes back to it. */
  rebuy?: RebuyRules;
  /** TraderBot's quiet-coin exits (types/inactivity.ts): no trade for `noTradeSeconds` sells the rest (omitted, `NO_TRADE.seconds`; null
   *  off), and `drain` sells a coin falling on more sells than buys (omitted is off). */
  noTradeSeconds?: number | null; drain?: DrainRules;
  /** ResearchBot's re-check of a coin it turned down and the strategy never traded (types/repick.ts): the move (%) from the price at the
   *  verdict that sends it back to research, once its live fit also clears the pass mark. Omitted, `REPICK.movePct` (50; types/team
   *  `recheckMove`); 0, a turned-down coin never comes back. Research that threw still retries after `REPICK.failedRetryMs`. */
  recheckMovePct?: number;
  /** Code alone buys and sells (stored only when true): the worker asks no model about this strategy's coins. TraderBot runs no Jev review
   *  and no GLM second opinion, so the exit plan, the trailing stop and the quiet-coin exits sell; a pending ask keeps or goes on plain
   *  limits (`ASK_LIMITS_OFFLINE`). Levels TraderBot set before it was switched on stay in force; they only tighten. */
  codeOnly?: boolean;
  skipTwinCoins?: boolean;
};
/** Every strategy trades by code alone while this is true, whatever its own `codeOnly` says; Settings shows the switch on and locked. */
export const CODE_ONLY_FOR_ALL = true;
/** Whether the worker asks no model about a strategy's coins. */
export const codeOnlyOf = (rules: Pick<TeamRules, 'codeOnly'> | null | undefined) => CODE_ONLY_FOR_ALL || rules?.codeOnly === true;
/** Who decides what on a strategy set to Code only. `rules`: every decision on its coins, made by code. `ai`: where a model still answers,
 *  none of which buys or sells the strategy's coins (the call sites are on /dev/models). `bot`: the face shown beside it. */
export const CODE_ONLY_SPLIT: Record<'rules' | 'ai', { bot: AgentRole | 'shield'; text: string }[]> = {
  rules: [{ bot: 'research', text: 'ResearchBot’s checks and score' }, { bot: 'shield', text: 'ShieldBot’s scam checks' }, { bot: 'sniper', text: 'SniperBot’s entries' }, { bot: 'trader', text: 'TraderBot’s exits' }],
  ai: [{ bot: 'coordinator', text: 'HOTBOT chat' }, { bot: 'coordinator', text: 'Settings from your words' }, { bot: 'coordinator', text: 'HOTBOT’s suggestions' }, { bot: 'coordinator', text: 'Portfolios' }],
};
/** How SniperBot buys a coin the strategy sold again (types/rebuy.ts). After each sale it watches the coin for `watchMinutes` and sends it
 *  back to research on the `direction`'s move: 'pullback' (omitted) once `steadyCloses` minutes in a row each closed at 99% or more of the
 *  one before ('weighted': 2 with a positive volume uptick or buys overtaking sells, else 3) and the `confirmation` holds, with `chasePct`
 *  keeping it within this far over the lowest close since the sale (0 off); 'continuation' on a close over the sale price and every close
 *  since, with buyers coming in; 'either' on whichever comes first. `afterLoss` 'stop': a re-buy that lost ends re-buys of that coin.
 *  `maxPerCoin`: re-buys of one coin at most (0 no limit). A re-buy sells on the strategy's own exit plan. */
export type RebuyRules = { direction?: RebuyDirection; steadyCloses: 2 | 3 | 'weighted'; confirmation: RebuyConfirmation; chasePct: number; watchMinutes: number; afterLoss: 'stop' | 'keep'; maxPerCoin: number };
export const REBUY_DIRECTIONS = ['pullback', 'continuation', 'either'] as const;
export type RebuyDirection = typeof REBUY_DIRECTIONS[number];
export const REBUY_CONFIRMATIONS = ['none', 'volume', 'positiveVolume', 'buysOvertake', 'volumeAndBuys'] as const;
export type RebuyConfirmation = typeof REBUY_CONFIRMATIONS[number];
/** The choices the owner had on the re-buy replay page; validation takes any value in range. */
export const REBUY_CHOICES = { watchMinutes: [15, 30, 60], chasePct: [0, 15, 25, 40], maxPerCoin: [1, 2, 3, 0] } as const;
export const STREAMS = ['bonding', 'graduated'] as const;
export type Stream = typeof STREAMS[number];
export const STREAM_NAMES: Record<Stream, string> = { bonding: 'Bonding', graduated: 'Graduated' };
/** The longest wait after a coin's graduation a strategy can set (`TeamRules.minGraduatedSeconds`). */
export const GRADUATED_MAX_SECONDS = 86_400;
export const streamsOf = (rules: TeamRules): Stream[] => rules.streams ?? [...STREAMS];
/** Bot colours match the landing character palette (public/hotbot/cloud-agents/character-design.json). ResearchBot's white is the theme token
 *  `--bot-research` (globals.css), which a light page shades so the cloud keeps its shape. */
export const STARTER_AGENTS: TeamAgent[] = [
  { id: 'coordinator', role: 'coordinator', name: 'HOTBOT', color: '#f47a38', instructions: 'Coordinate the team. Follow the saved rules and surface work needing attention.', enabled: true },
  { id: 'research', role: 'research', name: 'ResearchBot', color: 'var(--bot-research)', instructions: 'Collect current token evidence and check it against the strategy\'s rules.', enabled: true },
  { id: 'sniper', role: 'sniper', name: 'SniperBot', color: '#ef6689', instructions: 'Watch approved candidates and wait for the configured entry conditions.', enabled: true },
  { id: 'trader', role: 'trader', name: 'TraderBot', color: '#649af1', instructions: 'Prepare paper trades within the team budget and manage configured exits.', enabled: true },
  { id: 'launch', role: 'launch', name: 'LaunchBot', color: '#68d69b', instructions: 'Prepare simulated token launches. Account for the paper budget and return unused funds.', enabled: true },
];
export const DEFAULT_RULES: TeamRules = {
  mode: 'auto', blockedMints: [],
  allocationSol: 2, amountSol: 0.1, maxOpenPositions: 3,
  minLiquidityUsd: 0, minVolume24hUsd: 0, minMarketCapUsd: 0, maxMarketCapUsd: 0,
  minAgeMinutes: 1440, maxTop10Percent: 50,
  researchPolicy: DEFAULT_RESEARCH_POLICY,
  buySlippageBps: 100,
  exits: exitPlan('stake', 100, 20),
};
/** The $HOTBOT token's mint (pump.fun). */
export const HOTBOT_MINT = '8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF';
export const LAMPORTS = 1_000_000_000;
export function solToRaw(value: number): string {
  const raw = Math.round(value * LAMPORTS);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(raw)) throw new Error('Invalid SOL amount.');
  return String(raw);
}
/** `dipPct`: the strategy's entry dip (stored beside the rules), which a breakout entry can't share. `live`: a Real SOL strategy, whose
 *  per-coin size is at least `MIN_BUY_SOL`, so the largest buy its budget is judged by is the size it is set to. */
export function validateRules(rules: TeamRules, dipPct = 0, live = false) {
  validateQuietExits(rules);
  const policy = rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY;
  if (!Number.isFinite(policy.minimumScore) || policy.minimumScore < 50 || policy.minimumScore > 125) throw new Error('Weighted pass score must be between 50 and 125.');
  for (const key of RESEARCH_RULE_KEYS) if (!policy.checks[key]) throw new Error('Every market check needs a rule treatment.');
  for (const rule of Object.values(policy.checks)) {
    if (!['weighted', 'hard', 'off'].includes(rule.mode) || !Number.isInteger(rule.weight) || rule.weight < 1 || rule.weight > 5) throw new Error('Rule weights must be whole numbers from 1 to 5.');
  }
  const nonnegative = [rules.allocationSol, rules.amountSol, rules.minLiquidityUsd, rules.minVolume24hUsd, rules.minMarketCapUsd, rules.maxMarketCapUsd, rules.minAgeMinutes];
  if (nonnegative.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Rule values must be finite and nonnegative.');
  if (rules.amountSol <= 0 || rules.allocationSol <= 0 || rules.allocationSol < rules.amountSol) throw new Error('Set a positive trade size within the budget.');
  if (!Number.isInteger(rules.maxOpenPositions) || rules.maxOpenPositions < 1 || rules.maxOpenPositions > 20) throw new Error('Choose between 1 and 20 open positions.');
  if (live && rules.amountSol < MIN_BUY_SOL) throw new Error(`A Real SOL strategy buys at least ${MIN_BUY_SOL} SOL a coin.`);
  if (rules.lossStopPct !== undefined && !(Number.isFinite(rules.lossStopPct) && rules.lossStopPct > 0 && rules.lossStopPct <= 100)) throw new Error('Set the loss stop above 0% and up to 100% of the budget.');
  if (rules.practiceStopPct !== undefined && !(Number.isFinite(rules.practiceStopPct) && rules.practiceStopPct > 0 && rules.practiceStopPct <= 100)) throw new Error('Set the loss stop above 0% and up to 100% of the budget.');
  for (const bound of [rules.minTurnover1h, rules.maxTurnover1h]) if (bound !== undefined && !(bound > 0 && bound <= 1000)) throw new Error('Set the turnover between 0 and 1000× the cap.');
  if (rules.minTurnover1h !== undefined && rules.maxTurnover1h !== undefined && rules.minTurnover1h > rules.maxTurnover1h) throw new Error('The turnover floor sits under its ceiling.');
  if (rules.minGraduatedSeconds !== undefined && !(rules.minGraduatedSeconds > 0 && rules.minGraduatedSeconds <= GRADUATED_MAX_SECONDS)) throw new Error(`Set the time since graduation between 1 second and ${GRADUATED_MAX_SECONDS / 3600} hours.`);
  validateShield(rules.shield);
  if (rules.hourCrashLimit !== undefined && !(rules.hourCrashLimit > 0 && rules.hourCrashLimit < 100)) throw new Error('Set the hour-crash limit between 0 and 100%.');
  validateActiveTrading(rules.activeTrading);
  if (rules.skipTwinCoins !== undefined && typeof rules.skipTwinCoins !== 'boolean') throw new Error('Choose on or off for skipping Practice’s coins.');
  if (rules.entryDelayMinutes !== undefined && !(rules.entryDelayMinutes >= 0 && rules.entryDelayMinutes <= 60)) throw new Error('Set the entry delay between 0 and 60 minutes.');
  if (rules.entryMaxUpPct !== undefined && !(rules.entryMaxUpPct > 0)) throw new Error('Set how far a coin may run before the entry above 0%.');
  if (rules.breakout) {
    validateBreakout(rules.breakout);
    if (dipPct > 0 || rules.entryDelayMinutes) throw new Error('A breakout entry can’t wait for a dip or an entry delay too.');
  }
  validateSchedule(rules);
  if (rules.streams !== undefined && (!rules.streams.length || rules.streams.some(stream => !STREAMS.includes(stream)))) throw new Error('Pick at least one of the streams.');
  if (rules.rebuy) validateRebuy(rules.rebuy);
  if (rules.maxPoolSharePct !== undefined && !(Number.isFinite(rules.maxPoolSharePct) && rules.maxPoolSharePct >= POOL_SHARE.min && rules.maxPoolSharePct <= POOL_SHARE.max)) throw new Error(`Set the share of the pool one buy may take between ${POOL_SHARE.min}% and ${POOL_SHARE.max}%.`);
  if (rules.recheckMovePct !== undefined && !(Number.isInteger(rules.recheckMovePct) && rules.recheckMovePct >= 0 && rules.recheckMovePct <= 500)) throw new Error('Set the move that re-checks a turned-down coin between 0 (off) and 500%.');
  if (rules.maxMarketCapUsd && rules.maxMarketCapUsd <= rules.minMarketCapUsd) throw new Error('Maximum market cap must exceed the minimum.');
  if (rules.maxAgeMinutes && rules.maxAgeMinutes <= rules.minAgeMinutes) throw new Error('Maximum age must exceed the minimum age.');
  if (rules.minMove1hPct !== undefined && rules.maxMove1hPct !== undefined && rules.minMove1hPct > rules.maxMove1hPct) throw new Error('The 1h move floor sits under its ceiling.');
  if (!Number.isInteger(rules.buySlippageBps) || rules.buySlippageBps < 1 || rules.buySlippageBps > 5000) throw new Error('Buy slippage must be between 0.01% and 50%.');
  if (!(rules.maxTop10Percent >= 0 && rules.maxTop10Percent <= 100)) throw new Error('Set the top 10 holders limit between 0 and 100%.');
  if (rules.blockedMints.length > 100) throw new Error('Use up to 100 excluded mints.');
  if (rules.exits.takeProfits.length > EXIT_RUNGS.takeProfits) throw new Error(`Use up to ${EXIT_RUNGS.takeProfits} take-profits.`);
  if (rules.exits.stopLosses.length > EXIT_RUNGS.stopLosses) throw new Error(`Use up to ${EXIT_RUNGS.stopLosses} stops, the trailing stop included.`);
  const share = (n: number | undefined, max: number) => n === undefined || (Number.isFinite(n) && n > 0 && n <= max);
  if (rules.exits.takeProfits.some(tp => !share(tp.gainPct, 100_000) || !share(tp.sellPct, 100) || !share(tp.pullbackPct, 99)) || rules.exits.takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0) > 100) throw new Error('Take-profits need a positive gain and together sell at most the whole bag.');
  // A stop armed by time may sit at the entry itself (0%): it sells a coin that isn't up by then.
  if (rules.exits.stopLosses.some(sl => !(sl.afterMinutes ? sl.lossPct >= 0 && sl.lossPct <= 99 : share(sl.lossPct, 99)) || !share(sl.trailDistancePct, 99) || !share(sl.armAtGainPct, 100_000) || !share(sl.afterMinutes, 24 * 60))) throw new Error('Stops sit between 1% and 99% below the entry or the high, or at the entry once a coin has been held a while.');
  if (rules.exits.stopLosses.some(sl => !sl.trailing && !sl.armAtGainPct && !sl.afterMinutes && sl.lossPct < FIXED_STOP_MIN_PCT)) throw new Error(`A stop under the buy sits at least ${FIXED_STOP_MIN_PCT}% under it: a buy pays its fees on top of the price.`);
  // Only a trail armed by a gain may sell a share (a trail step, types/exits.ts `isTrailStep`); the exit engine sells the rest on any other stop.
  if (rules.exits.stopLosses.some(sl => sl.sellPct !== 100 && !(sl.trailing && sl.armAtGainPct && share(sl.sellPct, 100)))) throw new Error('Only a trail that starts at a gain sells a share of the bag; every other stop sells the whole bag.');
  const { scaleOut, lockStepPct, stall } = rules.exits;
  if (scaleOut && (!share(scaleOut.fromPct, 100_000) || !share(scaleOut.stepPct, 10_000) || !share(scaleOut.sellPct, 100) || scaleOut.sellPct < SCALE_OUT_MIN_SELL_PCT)) throw new Error(`Scale out needs a gain to start at, a step and a share to sell each time, ${SCALE_OUT_MIN_SELL_PCT}% or more.`);
  if (lockStepPct !== undefined && !share(lockStepPct, 10_000)) throw new Error('Lock in steps of a positive gain.');
  if (stall && (!share(stall.armAtGainPct, 100_000) || !share(stall.minutes, 24 * 60))) throw new Error('A stall sell needs a gain and between 1 minute and a day without a new high.');
  const stop = trailPct(rules.exits);
  if (stop !== undefined && !(stop >= TRAIL.min && stop <= TRAIL.max)) throw new Error(`A trailing stop sits ${TRAIL.min}–${TRAIL.max}% below the high.`);
  const soldOut = soldOutAtPct(rules.exits);
  if (soldOut !== undefined) {
    const sold = rules.exits.takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0) >= 100;
    const dead = [scaleOut && sold && 'the scale-out', stall && stall.armAtGainPct >= soldOut && 'the stall sell', lockStepPct && 2 * lockStepPct >= soldOut && 'the step lock',
      ...rules.exits.stopLosses.flatMap(sl => [sl.armAtGainPct && sl.armAtGainPct >= soldOut && `the stop armed at +${sl.armAtGainPct}%`, sl.widenAtGainPct && sl.widenAtGainPct >= soldOut && `the trail that widens at +${sl.widenAtGainPct}%`])].filter(Boolean);
    if (dead.length) throw new Error(`Take-profits sell the whole bag at +${+soldOut.toFixed(2)}%, so ${dead.join(' and ')} never ${dead.length > 1 ? 'run' : 'runs'}.`);
  }
  const low = rules.sweetMove1hLowPct ?? 0, high = rules.sweetMove1hHighPct ?? low;
  if (rules.maxMove1hPct !== undefined && !(low >= 0 && high >= low && rules.maxMove1hPct >= high)) throw new Error('The 1h move range runs from its best low to its best high, then to the move it barely accepts.');
  if (BigInt(solToRaw(rules.amountSol)) < 1n) throw new Error('Trade size must be at least one lamport.');
  if (rules.blockedMints.some(address => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))) throw new Error('Excluded tokens must be Solana mint addresses.');
  solToRaw(rules.amountSol); solToRaw(rules.allocationSol);
}
/** SniperBot's re-buy settings, each in its range. The Lab checks these on a request's rules too: they size its replay's memory and time. */
export function validateRebuy(rebuy: RebuyRules) {
  const { direction, steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin } = rebuy;
  if (direction !== undefined && !REBUY_DIRECTIONS.includes(direction)) throw new Error('Re-buy on a pullback, on a new high, or on either.');
  if (steadyCloses !== 2 && steadyCloses !== 3 && steadyCloses !== 'weighted') throw new Error('Re-buys wait for 2 or 3 steady closes, or 2 with a confirmation.');
  if (!REBUY_CONFIRMATIONS.includes(confirmation)) throw new Error('Choose how a re-buy is confirmed.');
  if (!(Number.isFinite(chasePct) && chasePct >= 0 && chasePct <= 100)) throw new Error('Set how far over the low a re-buy may be between 0 and 100%.');
  if (!(Number.isInteger(watchMinutes) && watchMinutes >= 1 && watchMinutes <= 240)) throw new Error('Watch a sold coin between 1 and 240 minutes.');
  if (afterLoss !== 'stop' && afterLoss !== 'keep') throw new Error('Choose whether a losing re-buy stops re-buys.');
  if (!(Number.isInteger(maxPerCoin) && maxPerCoin >= 0 && maxPerCoin <= 20)) throw new Error('Set re-buys per coin between 0 (no limit) and 20.');
}
/** ShieldBot's settings: known fields only, each a switch, a number in its row's range or 0 (off; a parameter is 0 only where its row names
 *  `zero`, and one with `only` is one of its steps), a holder group's two shares (0–100), or at least one launchpad or insider group. */
function validateShield(shield: Partial<ShieldRules> | undefined) {
  if (!shield) return;
  for (const [key, value] of Object.entries(shield) as [keyof ShieldRules, unknown][]) {
    const row = SHIELD_ROWS[key];
    if (!row) throw new Error('Unknown ShieldBot rule.');
    if (row.kind === 'switch' && typeof value !== 'boolean') throw new Error(`${row.name} is on or off.`);
    if (row.kind === 'launchpads') pickedLaunchpads(value);
    if (row.kind === 'insiders') pickedInsiders(value);
    if (row.kind === 'number') {
      const inRange = typeof value === 'number' && value >= row.min && value <= row.max && (!row.integer || Number.isInteger(value)) && (!row.only || row.steps.includes(value));
      if (row.only && !inRange) throw new Error(`Set ${row.name.toLowerCase()} to one of ${row.steps.join(', ')}.`);
      const zero = !row.parents || row.zero !== undefined;
      if (!inRange && (!zero || value !== 0)) throw new Error(`Set ${row.name.toLowerCase()} between ${row.min} and ${row.max}${zero ? `, or 0 for ${(row.zero ?? 'off').toLowerCase()}` : ''}.`);
    }
    if (row.kind === 'holding') {
      const h = value as ShieldRules['dev'];
      if (!(h && [h.weighAbove, h.refuseAt].every(n => typeof n === 'number' && n >= 0 && n <= 100))) throw new Error(`${row.name} take shares between 0 and 100%.`);
      if (h.weighAbove && h.refuseAt && h.refuseAt < h.weighAbove) throw new Error(`${row.name}: refuse at a share at or above the one it starts weighing.`);
    }
  }
}
