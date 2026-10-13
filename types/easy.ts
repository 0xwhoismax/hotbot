import { EXIT_PLANS, isTrail, namedExitPlan, trailPct, withTrail, type ExitPlan, type ExitPlanId } from './exits';
import { STREAMS, streamsOf, type Stream, type TeamRules } from './hotbot';
import { mustHaves, type StrategyPatch } from './team';

/** Easy settings: a few plain choices over the same rules Advanced edits. Each control reads the option the rules match, or null when only
 *  Advanced could have set the value (the control then shows that value instead of snapping it to a choice), and writes a StrategyPatch. */

export type CapBand = { min: number; max: number };
export type Market = { id: string; name: string; text: string; buys: string; streams: readonly Stream[]; cap: CapBand; risk: number; pace: string };
/** What to trade: a kind of coin, which sets the streams a strategy takes coins from (`rules.streams`: still on a launchpad's curve, or
 *  graduated) and its market-cap band. New pairs are on the curve, graduations (around $35K and up) have left it, and the larger caps take
 *  both and let the band decide. A band is a must-have, so a coin outside it never buys. Rules that match no
 *  kind pick no tile; Advanced edits them. `risk` (1–4 pips) and `pace` rank the kinds by coin size: the smallest, newest coins swing hardest
 *  and fastest. They are a fixed ranking, not measured rates. */
export const MARKETS: Market[] = [
  { id: 'new', name: 'New pairs', text: 'Launches', buys: 'new pairs', streams: ['bonding'], cap: { min: 0, max: 0 }, risk: 4, pace: 'Fastest moves' },
  { id: 'graduated', name: 'Graduated', text: 'Off the curve', buys: 'just-graduated coins', streams: ['graduated'], cap: { min: 0, max: 0 }, risk: 3, pace: 'Fast moves' },
  { id: 'six', name: '6 figs', text: '$100K–$1M', buys: 'coins at $100K–$1M', streams: STREAMS, cap: { min: 100_000, max: 1_000_000 }, risk: 2, pace: 'Steadier' },
  { id: 'mid', name: 'Mid market', text: '$1M+', buys: 'coins over $1M', streams: STREAMS, cap: { min: 1_000_000, max: 0 }, risk: 1, pace: 'Steadiest' },
];
const capHard = (rules: TeamRules) => mustHaves(rules).includes('marketCap');
const isBand = (rules: TeamRules, cap: CapBand) => cap.min === rules.minMarketCapUsd && cap.max === rules.maxMarketCapUsd && (!cap.min && !cap.max || capHard(rules));
export const marketOf = (rules: TeamRules) => { const picked = streamsOf(rules).join(); return MARKETS.find(row => row.streams.join() === picked && isBand(rules, row.cap)) ?? null; };
/** One-sided pool liquidity at a market cap on the graduated-pool line (AGENTS.md, Liquidity): $15K × √(cap ÷ $100K). */
const poolAt = (capUsd: number) => 15_000 * Math.sqrt(capUsd / 100_000);
/** A band's floors for liquidity and volume: a coin at the band's low end (a quarter of its top when it has no floor) must be able to pass
 *  them, so a floor that only a larger coin meets comes down. Floors only come down. */
function bandFloors(cap: CapBand, rules: TeamRules): StrategyPatch {
  const low = cap.min || cap.max / 4;
  if (!low) return {};
  return { minLiquidityUsd: Math.min(rules.minLiquidityUsd, Math.floor(poolAt(low) * 0.9 / 100) * 100), minVolume24hUsd: Math.min(rules.minVolume24hUsd, Math.floor(low / 2)) };
}
function capPatch(cap: CapBand, rules: TeamRules): StrategyPatch {
  const must = mustHaves(rules).filter(rule => rule !== 'marketCap');
  return { minMarketCapUsd: cap.min, maxMarketCapUsd: cap.max, mustHave: cap.min || cap.max ? [...must, 'marketCap'] : must, ...bandFloors(cap, rules) };
}
/** A kind's streams and band. */
export const marketPatch = (market: Market, rules: TeamRules): StrategyPatch => ({ streams: [...market.streams], ...capPatch(market.cap, rules) });

// ---- Exits: a fixed stop below the buy, the trailing stop below the high, and a named plan above them ----
type Stop = ExitPlan['stopLosses'][number];
/** A stop measured from the buy that is always live: not trailing, not armed by a gain, not timed. */
const isFixed = (sl: Stop) => !sl.trailing && !sl.armAtGainPct && !sl.afterMinutes && sl.lossPct > 0;
export const fixedStop = (exits: ExitPlan) => exits.stopLosses.find(isFixed)?.lossPct ?? 0;
/** Each stop has a switch; its picks are the values it takes while on. */
export const STOPS = [15, 25, 35] as const;
export const TRAILS = [10, 15, 20, 30] as const;
export const EASY_PLANS: { id: ExitPlanId; name: string; text: string }[] = [
  { id: 'flip', name: 'Sell at 2x', text: 'Sells everything when your coin doubles.' },
  { id: 'ladder', name: '1.5x, 2x, Ride', text: 'Sells a third when you\'re up 50%, a third when it doubles, and lets the rest keep going.' },
  { id: 'doubling', name: '2x, 4x, 8x', text: 'Sells a third each time it doubles, at 2x, 4x, and 8x.' },
  { id: 'stake', name: '2x + free Ride', text: 'Sells half at 2x to get your money back, then the rest is free.' },
  { id: 'clip', name: 'Fast scalp', text: 'Grabs quick profits early, and sells at your buy price if there is no PA justifies holding.' },
  { id: 'trail', name: 'Trailing stop only', text: 'Holds until the price drops from its high by your trailing stop amount, then sells.' },
];
export const easyPlanName = (id: ExitPlanId) => EASY_PLANS.find(row => row.id === id)?.name ?? EXIT_PLANS[id].exits.name;
/** A stored plan's name in Easy's words: an edited named plan keeps the name it started from (`exits.name`). */
export const easyNameOf = (name: string) => EASY_PLANS.find(row => EXIT_PLANS[row.id].exits.name === name)?.name ?? name;
/** The named plan above the stops, read with the fixed stop left out (no named plan carries one). */
export const planOf = (exits: ExitPlan) => namedExitPlan({ ...exits, stopLosses: exits.stopLosses.filter(sl => !isFixed(sl)) });
/** The exits with one part changed and the others kept. `fixed` 0 or `trail` null takes that stop off. */
export function exitsWith(exits: ExitPlan, change: { plan?: Omit<ExitPlan, 'sellSlippageBps'>; fixed?: number; trail?: number | null }): ExitPlan {
  const above = change.plan ? { ...structuredClone(change.plan), sellSlippageBps: exits.sellSlippageBps } : { ...exits, stopLosses: exits.stopLosses.filter(sl => !isFixed(sl) && !isTrail(sl)) };
  const fixed = change.fixed ?? fixedStop(exits), trail = change.trail === undefined ? trailPct(exits) : change.trail;
  const plan = { ...above, stopLosses: [...(fixed ? [{ lossPct: fixed, sellPct: 100 }] : []), ...above.stopLosses] };
  return trail ? withTrail(plan, trail) : plan;
}

// ---- Budget: the total and the coins at once; each coin is up to an equal share ----
export const TOTALS = [0.5, 1, 2, 5, 10] as const;
export const COINS = [3, 5, 10] as const;
export const perCoin = (total: number, coins: number) => Math.max(0.01, Math.floor(total / coins * 100) / 100);
export const budgetPatch = (total: number, coins: number): StrategyPatch => ({ budgetSol: total, maxOpen: coins, tradeSol: perCoin(total, coins) });
