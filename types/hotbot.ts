import type { TradePresetTargetConfig } from '../convex/lib/tradePresets';
import { TRAIL, exitPlan, trailPct } from './exits';
import { validateInactivity, type InactivityRules } from './inactivity';
import { SHIELD_ROWS, type ShieldRules } from './shield';

export const AGENT_ROLES = ['coordinator', 'research', 'sniper', 'trader', 'launch'] as const;
export type AgentRole = typeof AGENT_ROLES[number];
export type TeamAgent = { id: string; role: AgentRole; name: string; color: string; instructions: string; enabled: boolean };
export type DemoToken = { address: string; name: string; symbol: string; decimals: number; logoUri?: string };
export const RESEARCH_RULE_KEYS = ['liquidity', 'volume', 'market_cap', 'age', 'holders'] as const;
export type ResearchRuleKey = typeof RESEARCH_RULE_KEYS[number];
export type RuleTreatment = { mode: 'weighted' | 'hard' | 'off'; weight: number };
export type ResearchPolicy = {
  minimumScore: number;
  checks: Record<ResearchRuleKey, RuleTreatment>;
};
// Equal weights avoid pretending to have empirically fitted coefficients. 100 = meets target.
export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  minimumScore: 100,
  checks: { liquidity: { mode: 'hard', weight: 1 }, volume: { mode: 'hard', weight: 1 }, market_cap: { mode: 'hard', weight: 1 }, age: { mode: 'hard', weight: 1 }, holders: { mode: 'weighted', weight: 1 } },
};
export const POOL_SHARE = { pct: 1, min: 0.1, max: 10 } as const;
export type TeamRules = {
  mode: 'ask' | 'auto'; blockedMints: string[];
  allocationSol: number; amountSol: number; maxOpenPositions: number;
  maxPoolSharePct?: number;
  minLiquidityUsd: number; minVolume24hUsd: number; minMarketCapUsd: number; maxMarketCapUsd: number;
  minAgeMinutes: number; maxTop10Percent: number;
  buySlippageBps: number; exits: TradePresetTargetConfig;
  /** Omit to use the documented default research policy; save an object for custom weighting. */
  researchPolicy?: ResearchPolicy;
  /** Discovery filters beyond the research checks; omitted means no limit. */
  maxAgeMinutes?: number; minMove1hPct?: number; maxMove1hPct?: number; sweetMove1hLowPct?: number; sweetMove1hHighPct?: number; minBuyers1h?: number;
  /** Quality checks from the peak-outcome rule sets: holder breadth, buy pressure, strength versus the high, locked liquidity. */
  minHolders?: number; minBuySellRatio?: number; maxDrawdownPct?: number; minLpBurnPct?: number;
  /** The entry model's rank a coin must reach, 0–100 (types/entryModel.ts); a hard floor. */
  minEntryScore?: number;
  /** Turnover: the last hour's volume as a multiple of the market cap, a hard band when either end is set (2–10× marks a coin that is moving; under 1× and over 20× sit stale). */
  minTurnover1h?: number; maxTurnover1h?: number;
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
  entryActivity?: boolean;
  /** Where it finds coins (`STREAMS`): bonding, graduated or, omitted, both. */
  streams?: Stream[];
  /** SniperBot's re-buys (types/rebuy.ts); omitted, a coin the strategy traded never comes back to it. */
  rebuy?: RebuyRules;
  /** Held-coin inactivity: omitted uses the ten-minute default; null switches it off. */
  inactivity?: InactivityRules | null;
  sellModelPct?: number;
  /** ResearchBot's re-check of a coin it turned down and the strategy never traded (types/repick.ts): the move (%) from the price at the
   *  verdict that sends it back to research, once its live fit also clears the pass mark. Omitted, `REPICK.movePct` (50; types/team
   *  `recheckMove`); 0, a turned-down coin never comes back. Research that threw still retries after `REPICK.failedRetryMs`. */
  recheckMovePct?: number;
  /** Code alone buys and sells (stored only when true): the worker asks no model about this strategy's coins. TraderBot runs no Jev review
   *  and no GLM second opinion, so the exit plan, the trailing stop and the inactivity exit sell; a pending ask keeps or goes on plain
   *  limits (`ASK_LIMITS_OFFLINE`). Levels TraderBot set before it was switched on stay in force; they only tighten. */
  codeOnly?: boolean;
};
export type RebuyRules = { steadyCloses: 2 | 3 | 'weighted'; confirmation: RebuyConfirmation; chasePct: number; watchMinutes: number; afterLoss: 'stop' | 'keep'; maxPerCoin: number };
export const REBUY_CONFIRMATIONS = ['none', 'volume', 'positiveVolume', 'buysOvertake', 'volumeAndBuys'] as const;
export type RebuyConfirmation = typeof REBUY_CONFIRMATIONS[number];
export const SELL_MODEL = { picks: [50, 55, 60, 70], start: 50, min: 30, max: 95 } as const;
export const REBUY_CHOICES = { watchMinutes: [15, 30, 60], chasePct: [0, 15, 25, 40], maxPerCoin: [1, 2, 3, 0] } as const;
/** Where a strategy finds coins among the indexer's rows: coins still on their launchpad's curve
 *  (`bonding`) and coins that left it for a pool (`graduated`). Both, the default, is every coin that traded in the last hour. */
export const STREAMS = ['bonding', 'graduated'] as const;
export type Stream = typeof STREAMS[number];
export const STREAM_NAMES: Record<Stream, string> = { bonding: 'Bonding', graduated: 'Graduated' };
export const MIN_LIQUIDITY_USD = 1_000;
export const streamsOf = (rules: TeamRules): Stream[] => rules.streams ?? [...STREAMS];
export type LaunchPlan = { name: string; symbol: string; description: string; imageUrl: string; budgetSol: number; simulatedCostSol: number };
/** Bot colours match the landing character palette (public/hotbot/cloud-agents/character-design.json). */
export const STARTER_AGENTS: TeamAgent[] = [
  { id: 'coordinator', role: 'coordinator', name: 'HOTBOT', color: '#f47a38', instructions: 'Coordinate the team. Follow the saved rules and surface work needing attention.', enabled: true },
  { id: 'research', role: 'research', name: 'ResearchBot', color: '#e5e8ef', instructions: 'Collect current token evidence and check it against the strategy\'s rules.', enabled: true },
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
export function rawToSol(value: string): number { return Number(BigInt(value)) / LAMPORTS; }
export function enabledAgent(agents: TeamAgent[], role: AgentRole) { return agents.find(agent => agent.role === role && agent.enabled); }
export function validateRules(rules: TeamRules) {
  validateInactivity(rules.inactivity);
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
  if (rules.minEntryScore !== undefined && !(Number.isInteger(rules.minEntryScore) && rules.minEntryScore >= 0 && rules.minEntryScore <= 100)) throw new Error('Set the entry score between 0 and 100.');
  for (const bound of [rules.minTurnover1h, rules.maxTurnover1h]) if (bound !== undefined && !(bound > 0 && bound <= 1000)) throw new Error('Set the turnover between 0 and 1000× the cap.');
  if (rules.minTurnover1h !== undefined && rules.maxTurnover1h !== undefined && rules.minTurnover1h > rules.maxTurnover1h) throw new Error('The turnover floor sits under its ceiling.');
  validateShield(rules.shield);
  if (rules.hourCrashLimit !== undefined && !(rules.hourCrashLimit > 0 && rules.hourCrashLimit < 100)) throw new Error('Set the hour-crash limit between 0 and 100%.');
  if (rules.entryActivity !== undefined && typeof rules.entryActivity !== 'boolean') throw new Error('Choose on or off for active trading.');
  if (rules.entryDelayMinutes !== undefined && !(rules.entryDelayMinutes >= 0 && rules.entryDelayMinutes <= 60)) throw new Error('Set the entry delay between 0 and 60 minutes.');
  if (rules.entryMaxUpPct !== undefined && !(rules.entryMaxUpPct > 0)) throw new Error('Set how far a coin may run before the entry above 0%.');
  if (rules.streams !== undefined && (!rules.streams.length || rules.streams.some(stream => !STREAMS.includes(stream)))) throw new Error('Pick at least one of the streams.');
  if (rules.rebuy) {
    const { steadyCloses, confirmation, chasePct, watchMinutes, afterLoss, maxPerCoin } = rules.rebuy;
    if (steadyCloses !== 2 && steadyCloses !== 3 && steadyCloses !== 'weighted') throw new Error('Re-buys wait for 2 or 3 steady closes, or 2 with a confirmation.');
    if (!REBUY_CONFIRMATIONS.includes(confirmation)) throw new Error('Choose how a re-buy is confirmed.');
    if (!(Number.isFinite(chasePct) && chasePct >= 0 && chasePct <= 100)) throw new Error('Set how far over the low a re-buy may be between 0 and 100%.');
    if (!(Number.isInteger(watchMinutes) && watchMinutes >= 1 && watchMinutes <= 240)) throw new Error('Watch a sold coin between 1 and 240 minutes.');
    if (afterLoss !== 'stop' && afterLoss !== 'keep') throw new Error('Choose whether a losing re-buy stops re-buys.');
    if (!(Number.isInteger(maxPerCoin) && maxPerCoin >= 0 && maxPerCoin <= 20)) throw new Error('Set re-buys per coin between 0 (no limit) and 20.');
  }
  if (rules.sellModelPct !== undefined && !(Number.isInteger(rules.sellModelPct) && rules.sellModelPct >= SELL_MODEL.min && rules.sellModelPct <= SELL_MODEL.max)) throw new Error(`Set the sell-or-keep model between ${SELL_MODEL.min}% and ${SELL_MODEL.max}%.`);
  if (rules.maxPoolSharePct !== undefined && !(Number.isFinite(rules.maxPoolSharePct) && rules.maxPoolSharePct >= POOL_SHARE.min && rules.maxPoolSharePct <= POOL_SHARE.max)) throw new Error(`Set the share of the pool one buy may take between ${POOL_SHARE.min}% and ${POOL_SHARE.max}%.`);
  if (rules.recheckMovePct !== undefined && !(Number.isInteger(rules.recheckMovePct) && rules.recheckMovePct >= 0 && rules.recheckMovePct <= 500)) throw new Error('Set the move that re-checks a turned-down coin between 0 (off) and 500%.');
  if (rules.maxMarketCapUsd && rules.maxMarketCapUsd < rules.minMarketCapUsd) throw new Error('Maximum market cap must exceed the minimum.');
  if (!Number.isInteger(rules.buySlippageBps) || rules.buySlippageBps < 1 || rules.buySlippageBps > 5000) throw new Error('Buy slippage must be between 0.01% and 50%.');
  if (!(rules.maxTop10Percent >= 0 && rules.maxTop10Percent <= 100)) throw new Error('Set the top 10 holders limit between 0 and 100%.');
  if (rules.blockedMints.length > 100) throw new Error('Use up to 100 excluded mints.');
  const share = (n: number | undefined, max: number) => n === undefined || (Number.isFinite(n) && n > 0 && n <= max);
  if (rules.exits.takeProfits.some(tp => !share(tp.gainPct, 100_000) || !share(tp.sellPct, 100) || !share(tp.pullbackPct, 99)) || rules.exits.takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0) > 100) throw new Error('Take-profits need a positive gain and together sell at most the whole bag.');
  // A stop armed by time may sit at the entry itself (0%): it sells a coin that isn't up by then.
  if (rules.exits.stopLosses.some(sl => !(sl.afterMinutes ? sl.lossPct >= 0 && sl.lossPct <= 99 : share(sl.lossPct, 99)) || !share(sl.trailDistancePct, 99) || !share(sl.armAtGainPct, 100_000) || !share(sl.afterMinutes, 24 * 60))) throw new Error('Stops sit between 1% and 99% below the entry or the high, or at the entry once a coin has been held a while.');
  const { scaleOut, lockStepPct, stall } = rules.exits;
  if (scaleOut && (!share(scaleOut.fromPct, 100_000) || !share(scaleOut.stepPct, 10_000) || !share(scaleOut.sellPct, 100))) throw new Error('Scale out needs a gain to start at, a step and a share to sell each time.');
  if (lockStepPct !== undefined && !share(lockStepPct, 10_000)) throw new Error('Lock in steps of a positive gain.');
  if (stall && (!share(stall.armAtGainPct, 100_000) || !share(stall.minutes, 24 * 60))) throw new Error('A stall sell needs a gain and between 1 minute and a day without a new high.');
  const stop = trailPct(rules.exits);
  if (stop !== undefined && !(stop >= TRAIL.min && stop <= TRAIL.max)) throw new Error(`A trailing stop sits ${TRAIL.min}–${TRAIL.max}% below the high.`);
  const low = rules.sweetMove1hLowPct ?? 0, high = rules.sweetMove1hHighPct ?? low;
  if (rules.maxMove1hPct !== undefined && !(low >= 0 && high >= low && rules.maxMove1hPct >= high)) throw new Error('The 1h move range runs from its best low to its best high, then to the move it barely accepts.');
  if (BigInt(solToRaw(rules.amountSol)) < 1n) throw new Error('Trade size must be at least one lamport.');
  if (rules.blockedMints.some(address => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))) throw new Error('Excluded tokens must be Solana mint addresses.');
  solToRaw(rules.amountSol); solToRaw(rules.allocationSol);
}
/** ShieldBot's settings: known fields only, each a switch, a number in its row's range or 0 (off), or a holder group's two shares (0–100). */
function validateShield(shield: Partial<ShieldRules> | undefined) {
  if (!shield) return;
  for (const [key, value] of Object.entries(shield) as [keyof ShieldRules, unknown][]) {
    const row = SHIELD_ROWS[key];
    if (!row) throw new Error('Unknown ShieldBot rule.');
    if (row.kind === 'switch' && typeof value !== 'boolean') throw new Error(`${row.name} is on or off.`);
    if (row.kind === 'number' && !(typeof value === 'number' && (value === 0 || (value >= row.min && value <= row.max)))) throw new Error(`Set ${row.name.toLowerCase()} between ${row.min} and ${row.max}, or 0 for off.`);
    if (row.kind === 'holding') {
      const h = value as ShieldRules['dev'];
      if (!(h && [h.weighAbove, h.refuseAt].every(n => typeof n === 'number' && n >= 0 && n <= 100))) throw new Error(`${row.name} take shares between 0 and 100%.`);
      if (h.weighAbove && h.refuseAt && h.refuseAt < h.weighAbove) throw new Error(`${row.name}: refuse at a share at or above the one it starts weighing.`);
    }
  }
}
export function validateToken(token: DemoToken) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address) || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 18) throw new Error('Choose a valid Solana token with known decimals.');
  if (!token.name.trim() || token.name.length > 200 || !token.symbol.trim() || token.symbol.length > 40) throw new Error('Invalid token identity.');
}
export function validateLaunch(plan: LaunchPlan) {
  if (!plan.name.trim() || plan.name.length > 80 || !/^[A-Za-z0-9]{1,12}$/.test(plan.symbol) || !plan.description.trim() || plan.description.length > 2000) throw new Error('Enter a name, a 1–12 character symbol and a description.');
  if (plan.imageUrl) { try { const url = new URL(plan.imageUrl); if (url.protocol !== 'https:' || !url.hostname) throw new Error(); } catch { throw new Error('Enter a valid HTTPS image URL.'); } }
  if (!(plan.budgetSol > 0) || !(plan.simulatedCostSol >= 0) || plan.simulatedCostSol > plan.budgetSol) throw new Error('The simulated cost must fit within a positive paper budget.');
  solToRaw(plan.budgetSol); solToRaw(plan.simulatedCostSol);
}
