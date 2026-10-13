import type { TradePresetTargetConfig } from '../convex/lib/tradePresets';

/** How a strategy sells. Code runs the plan on price; TraderBot may sell earlier or tighten, never loosen.
 *  Stored in `rules.exits`: take-profits sell a share of the original bag at a gain (or, with `pullbackPct`, once the coin
 *  has reached that gain and then falls that far below its high), then `scaleOut` keeps selling a share at every further step up;
 *  stop-losses sell the rest, measured below the entry or, when `trailing`, below the high since the buy, and only once the coin has
 *  been up `armAtGainPct` or held `afterMinutes` (a 0% stop after 10 minutes sells a coin that isn't up by then); `lockStepPct` locks in
 *  the step below each step climbed, and `stall` sells a coin that stops making new highs. */
export type ExitPlan = TradePresetTargetConfig;
export const EXIT_PLAN_IDS = ['clip', 'stake', 'flip', 'ladder', 'trailingTp', 'trail', 'scaleOut', 'scalp', 'take30', 'stall', 'stepLock', 'tighten', 'doubling'] as const;
export type ExitPlanId = typeof EXIT_PLAN_IDS[number];
/** A strategy's trailing stop (`TRAIL`): the one always-on untimed trail in `stopLosses`, measured below the high since the buy. Presets start
 *  it at `Preset.trailPct`, so it is on unless someone turns it off in Settings (`StrategyPatch.stopLossPct` 0); people change it there or by
 *  telling HOTBOT a stop, and TraderBot only ever tightens it. A plan is what happens above it, so no plan carries one of its own; `exitPlan`
 *  composes the two. */
export const TRAIL = { min: 5, max: 49, choices: [10, 15, 20, 25, 30] } as const;
const trail = (pct: number, armAtGainPct?: number) => ({ lossPct: pct, sellPct: 100, trailing: true, trailDistancePct: pct, ...(armAtGainPct ? { armAtGainPct } : {}) });
const atBuyAfter = (minutes: number) => ({ lossPct: 0, sellPct: 100, afterMinutes: minutes });
const floor = [atBuyAfter(10)];
const afterFloor = ' and sells at the buy price if it isn’t up after 10 minutes';
export const EXIT_PLANS: Record<ExitPlanId, { summary: string; exits: Omit<ExitPlan, 'sellSlippageBps'> }> = {
  clip: { summary: 'Once up 30%, trails 10% below its high and sells everything at 2×; sells at the buy price if it isn’t up after 10 minutes', exits: { name: 'Clip', takeProfits: [{ gainPct: 100, sellPct: 100 }], stopLosses: [trail(10, 30), atBuyAfter(10)] } },
  stake: { summary: 'Half at 2× takes your stake back; the rest rides the trailing stop', exits: { name: 'Stake back', takeProfits: [{ gainPct: 100, sellPct: 50 }], stopLosses: [] } },
  flip: { summary: 'Sells everything at 2×', exits: { name: 'Quick flip', takeProfits: [{ gainPct: 100, sellPct: 100 }], stopLosses: [] } },
  ladder: { summary: 'A third at +50%, a third at 2×, the rest rides the trailing stop', exits: { name: 'Ladder', takeProfits: [{ gainPct: 50, sellPct: 33 }, { gainPct: 100, sellPct: 33 }], stopLosses: [] } },
  trailingTp: { summary: 'Once at 2×, sells half on a 15% pullback; the rest rides the trailing stop', exits: { name: 'Trailing take-profit', takeProfits: [{ gainPct: 100, sellPct: 50, pullbackPct: 15 }], stopLosses: [] } },
  trail: { summary: 'Only the trailing stop sells', exits: { name: 'Trailing stop only', takeProfits: [], stopLosses: [] } },
  scaleOut: { summary: 'Sells 10% of the bag at +20% and again at every further +10%' + afterFloor, exits: { name: 'Scale out', takeProfits: [], scaleOut: { fromPct: 20, stepPct: 10, sellPct: 10 }, stopLosses: floor } },
  scalp: { summary: 'Half at +20%; sells at the buy price if it isn’t up after 5 minutes', exits: { name: 'Quick scalp', takeProfits: [{ gainPct: 20, sellPct: 50 }], stopLosses: [atBuyAfter(5)] } },
  // The small-caps search pick's exit (lab setup 'Search pick: small caps, strict launch, fast exits'), under a 40% trailing stop.
  take30: { summary: 'Sells everything at +30%; once up 15%, sells if 10 minutes pass without a new high; sells at the buy price if it isn’t up after 20 minutes', exits: { name: 'Take 30%', takeProfits: [{ gainPct: 30, sellPct: 100 }], stall: { armAtGainPct: 15, minutes: 10 }, stopLosses: [atBuyAfter(20)] } },
  stall: { summary: 'Once up 15%, sells if 5 minutes pass without a new high' + afterFloor, exits: { name: 'Stall exit', takeProfits: [], stall: { armAtGainPct: 15, minutes: 5 }, stopLosses: floor } },
  stepLock: { summary: 'Every +25% it climbs locks in the step below (from +50% it can’t fall under +25%)' + afterFloor, exits: { name: 'Step lock', takeProfits: [], lockStepPct: 25, stopLosses: floor } },
  // Half of what is left at every doubling, as near as the plan can say it: a third of the bag at 2×, 4× and 8×, the trailing stop sells the rest.
  doubling: { summary: 'Sells a third at 2×, a third at 4× and the rest at 8×; the trailing stop sells what is left', exits: { name: 'Doubling ladder', takeProfits: [], scaleOut: { fromPct: 100, stepPct: 100, sellPct: 34 }, stopLosses: [] } },
  tighten: { summary: 'Tightens the trailing stop to 15% after 10 minutes and 8% after 30' + afterFloor.replace(' and', ';'), exits: { name: 'Tightening trail', takeProfits: [], stopLosses: [...floor, { ...trail(15), afterMinutes: 10 }, { ...trail(8), afterMinutes: 30 }] } },
};
/** How many plans of their own a person keeps (`userSettings.exitPlans`, saved from Settings → Trader). */
export const SAVED_PLANS = { max: 12, nameLength: 40 } as const;
/** The plans as people pick them, by how they sell. Every plan is in exactly one group. */
export const EXIT_PLAN_GROUPS: { label: string; ids: ExitPlanId[] }[] = [
  { label: 'Gets out early', ids: ['clip', 'scaleOut', 'scalp', 'take30', 'flip'] },
  { label: 'Locks in gains', ids: ['stall', 'stepLock', 'tighten', 'trail'] },
  { label: 'Rides runners', ids: ['stake', 'ladder', 'trailingTp', 'doubling'] },
];
/** The always-on trailing stop: trailing, armed by neither a gain nor time. */
export const isTrail = (sl: ExitPlan['stopLosses'][number]) => Boolean(sl.trailing) && !sl.armAtGainPct && !sl.afterMinutes;
/** The strategy's trailing stop: the distance of its always-on untimed trail (the tightest, if an edited plan carries more than one). */
export function trailPct(plan: Pick<ExitPlan, 'stopLosses'>): number | undefined {
  const rows = plan.stopLosses.filter(isTrail).map(sl => sl.trailDistancePct ?? sl.lossPct);
  return rows.length ? Math.min(...rows) : undefined;
}
/** The plan with its trailing stop set to `pct`, as the one always-on untimed trail, first in the list. */
export function withTrail<P extends Pick<ExitPlan, 'stopLosses'>>(plan: P, pct: number): P {
  return { ...plan, stopLosses: [trail(pct), ...plan.stopLosses.filter(sl => !isTrail(sl))] };
}
/** The plan without its trailing stop. */
export const withoutTrail = <P extends Pick<ExitPlan, 'stopLosses'>>(plan: P): P => ({ ...plan, stopLosses: plan.stopLosses.filter(sl => !isTrail(sl)) });
/** A named plan under a `trailPct` trailing stop (none when undefined), ready to store on a strategy. */
export function exitPlan(id: ExitPlanId, sellSlippageBps: number, trailPct: number | undefined): ExitPlan {
  const plan = { ...structuredClone(EXIT_PLANS[id].exits), sellSlippageBps };
  return trailPct ? withTrail(plan, trailPct) : plan;
}

/** A held coin as the plan sees it: its entry, the high since the buy, how many take-profits have sold, how long it has been held and how
 *  long since its high (without `heldMs`, stops armed by time stay off; without `sinceHighMs`, so does `stall`). */
export type ExitState = { entryPriceUsd: number; highUsd: number; rungs: number; heldMs?: number; sinceHighMs?: number };
/** `atUsd`: the level that fired (a stop, a take-profit or a pullback), absent for a sell at market. */
export type ExitTrigger = { sellPct: number; rung?: number; reason: string; atUsd?: number };
const pct = (n: number) => Math.round(n) + '%';

/** The take-profit at rung `rungs`: the plan's own take-profits first, then the scale-out steps until they have sold the whole bag. */
export function takeProfitAt(plan: ExitPlan, rungs: number): ExitPlan['takeProfits'][number] | undefined {
  if (rungs < plan.takeProfits.length) return plan.takeProfits[rungs];
  const ladder = plan.scaleOut, step = rungs - plan.takeProfits.length;
  if (!ladder || step * ladder.sellPct >= 100) return undefined;
  return { gainPct: ((1 + ladder.fromPct / 100) * (1 + ladder.stepPct / 100) ** step - 1) * 100, sellPct: ladder.sellPct };
}
/** How many full `lockStepPct` steps the high is above the entry. */
const stepsUp = (plan: ExitPlan, state: ExitState) => plan.lockStepPct ? Math.floor((state.highUsd / state.entryPriceUsd - 1) * 100 / plan.lockStepPct + 1e-9) : 0;

/** The stop level every active stop-loss implies now; the highest one wins. */
export function stopLevel(plan: ExitPlan, state: ExitState) {
  let level = 0, reason = '';
  for (const stop of plan.stopLosses) {
    if (stop.armAtGainPct && state.highUsd < state.entryPriceUsd * (1 + stop.armAtGainPct / 100)) continue;
    if (stop.afterMinutes && (state.heldMs === undefined || state.heldMs < stop.afterMinutes * 60_000)) continue;
    // A trail with `widenAtGainPct` runs `widenToPct` under the high once the coin has been up that much.
    const widened = stop.trailing && stop.widenAtGainPct && stop.widenToPct && state.highUsd >= state.entryPriceUsd * (1 + stop.widenAtGainPct / 100);
    const distance = widened ? stop.widenToPct! : stop.trailing ? stop.trailDistancePct ?? stop.lossPct : stop.lossPct;
    const at = (stop.trailing ? state.highUsd : state.entryPriceUsd) * (1 - distance / 100);
    if (at > level) { level = at; reason = stop.trailing ? `Trailing stop: ${pct(distance)} below the high`
      : stop.afterMinutes ? (distance ? `Time stop: ${pct(distance)} below the entry after ${stop.afterMinutes} min` : `Time stop: not up ${stop.afterMinutes} min after the buy`) : `Stop-loss: ${pct(distance)} below the entry`; }
  }
  // Each full step climbed locks in the step below it.
  const steps = stepsUp(plan, state), locked = state.entryPriceUsd * (1 + (steps - 1) * (plan.lockStepPct ?? 0) / 100);
  if (steps >= 2 && locked > level) { level = locked; reason = `Step lock: holds +${pct((steps - 1) * plan.lockStepPct!)}`; }
  return { level, reason };
}

/** What the plan sells at `price`, given the high already includes it. Stops sell the rest; take-profits sell their share of the original bag.
 *  A price through the stop sells the rest first, whatever pullback line sits above the stop. */
export function exitTrigger(plan: ExitPlan, state: ExitState, price: number): ExitTrigger | null {
  const stop = stopLevel(plan, state);
  if (stop.level > 0 && price <= stop.level) return { sellPct: 100, reason: stop.reason, atUsd: stop.level };
  const next = takeProfitAt(plan, state.rungs);
  if (next?.pullbackPct) {
    const pulled = state.highUsd * (1 - next.pullbackPct / 100);
    if (state.highUsd >= state.entryPriceUsd * (1 + next.gainPct / 100) && price <= pulled && pulled > stop.level) return { sellPct: next.sellPct, rung: state.rungs, reason: `Took profit: ${pct(next.sellPct)} on a ${pct(next.pullbackPct)} pullback after +${pct(next.gainPct)}`, atUsd: pulled };
  }
  const stall = plan.stall;
  if (stall && state.sinceHighMs !== undefined && state.sinceHighMs >= stall.minutes * 60_000 && state.highUsd >= state.entryPriceUsd * (1 + stall.armAtGainPct / 100)) return { sellPct: 100, reason: `Stalled: no new high for ${stall.minutes} min after +${pct(stall.armAtGainPct)}` };
  const level = next && state.entryPriceUsd * (1 + next.gainPct / 100);
  if (next && level && !next.pullbackPct && price >= level) return { sellPct: next.sellPct, rung: state.rungs, reason: state.rungs >= plan.takeProfits.length ? `Scaled out: ${pct(next.sellPct)} at +${pct(next.gainPct)}` : `Took profit: ${pct(next.sellPct)} at +${pct(next.gainPct)}`, atUsd: level };
  return null;
}

/** Prices where the plan acts next, so the price feed can watch closer as a coin nears one: the stop below, and above it the nearest of
 *  the next take-profit, the next trailing stop that arms once the coin is up enough and the next step lock. */
export function exitTargets(plan: ExitPlan, state: ExitState) {
  const next = takeProfitAt(plan, state.rungs), stop = stopLevel(plan, state).level;
  const above = [...(next ? [state.entryPriceUsd * (1 + next.gainPct / 100)] : []), ...plan.stopLosses.flatMap(sl => sl.armAtGainPct ? [state.entryPriceUsd * (1 + sl.armAtGainPct / 100)] : []),
    ...(plan.lockStepPct ? [state.entryPriceUsd * (1 + (Math.max(stepsUp(plan, state), 1) + 1) * plan.lockStepPct / 100)] : [])].filter(price => price > state.highUsd);
  return { stopUsd: stop > 0 ? stop : null, takeProfitUsd: above.length ? Math.min(...above) : null };
}

/** The plan's next sells as people see them, read from the same state the evaluator runs on: the stop that sells the rest (and which
 *  one it is) and the next take-profit. Whatever sets the plan or the high, these follow. */
export function nextSells(plan: ExitPlan, state: ExitState) {
  const stop = stopLevel(plan, state), next = takeProfitAt(plan, state.rungs);
  return { stop: stop.level > 0 ? { priceUsd: stop.level, reason: stop.reason } : null,
    takeProfit: next ? { priceUsd: state.entryPriceUsd * (1 + next.gainPct / 100), sellPct: next.sellPct, pullbackPct: next.pullbackPct ?? null } : null };
}

/** Same targets whatever order their keys come back in (Convex returns stored objects with sorted keys). */
const sorted = (row: object) => JSON.stringify(Object.entries(row).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
const sameTargets = (a: object[], b: object[]) => a.length === b.length && a.every((row, i) => sorted(row) === sorted(b[i]));
const extras = (plan: Omit<ExitPlan, 'sellSlippageBps'>) => JSON.stringify([plan.scaleOut ? sorted(plan.scaleOut) : null, plan.lockStepPct ?? null, plan.stall ? sorted(plan.stall) : null]);

/** The named plan these exits are under any trailing stop, or undefined once they were edited. */
export function namedExitPlan(plan: ExitPlan): ExitPlanId | undefined {
  const stops = plan.stopLosses.filter(sl => !isTrail(sl));
  return EXIT_PLAN_IDS.find(id => EXIT_PLANS[id].exits.name === plan.name && sameTargets(EXIT_PLANS[id].exits.takeProfits, plan.takeProfits) && sameTargets(EXIT_PLANS[id].exits.stopLosses, stops) && extras(EXIT_PLANS[id].exits) === extras(plan));
}
/** A gain as people say it: whole multiples as 2×, 3×; anything else as +50%. */
const gain = (pct: number) => pct % 100 === 0 ? `${pct / 100 + 1}×` : `+${Math.round(pct)}%`;
const share = (pct: number, rest: boolean) => pct >= 100 ? 'everything' : rest ? 'the rest' : pct === 50 ? 'half' : pct === 33 || pct === 34 ? 'a third' : pct === 25 ? 'a quarter' : `${Math.round(pct)}%`;
const list = (parts: string[]) => parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] ?? '';
/** The trailing stop as people read it. */
export const describeTrail = (pct: number) => `trails ${Math.round(pct)}% below its high`;
/** One line for people: the named plan's summary and its trailing stop, or an edited plan in the same plain words ("Sells half at 2× and the rest at 4×; trails 30% below its high"). */
export function describeExits(plan: ExitPlan) {
  const named = namedExitPlan(plan), stop = trailPct(plan);
  if (named) return `${EXIT_PLANS[named].exits.name}: ${EXIT_PLANS[named].summary.charAt(0).toLowerCase()}${EXIT_PLANS[named].summary.slice(1)}${stop ? `; ${describeTrail(stop)}` : ''}`;
  const takeProfits = [...plan.takeProfits].sort((a, b) => a.gainPct - b.gainPct), total = takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0);
  const sells = takeProfits.map((tp, i) => {
    const what = share(tp.sellPct, i === takeProfits.length - 1 && i > 0 && total >= 100);
    return tp.pullbackPct ? `${what} on a ${pct(tp.pullbackPct)} pullback after ${gain(tp.gainPct)}` : `${what} at ${gain(tp.gainPct)}`;
  });
  if (plan.scaleOut && total < 100) sells.push(`${pct(plan.scaleOut.sellPct)} at ${gain(plan.scaleOut.fromPct)} and again every +${pct(plan.scaleOut.stepPct)}`);
  const distance = (sl: ExitPlan['stopLosses'][number]) => sl.trailing ? sl.trailDistancePct ?? sl.lossPct : sl.lossPct;
  // Only the tightest always-on trail matters, and a later trail no tighter than it never fires.
  const always = plan.stopLosses.filter(isTrail).sort((a, b) => distance(a) - distance(b))[0];
  const fixed = plan.stopLosses.filter(sl => !sl.trailing && !sl.armAtGainPct && !sl.afterMinutes).map(sl => `stops out ${pct(sl.lossPct)} below the buy`);
  const timed = plan.stopLosses.filter(sl => sl.afterMinutes && !sl.trailing).map(sl => sl.lossPct ? `after ${sl.afterMinutes} min, stops out ${pct(sl.lossPct)} below the buy` : `sells at the buy price if it isn’t up after ${sl.afterMinutes} min`);
  const tightening = plan.stopLosses.filter(sl => sl.afterMinutes && sl.trailing && !sl.armAtGainPct && (!always || distance(sl) < distance(always))).sort((a, b) => a.afterMinutes! - b.afterMinutes!)
    .map(sl => `trails ${pct(distance(sl))} after ${sl.afterMinutes} min`);
  const locks = [...(plan.lockStepPct ? [`every +${pct(plan.lockStepPct)} it climbs locks in the step below`] : []), ...(plan.stall ? [`once up ${pct(plan.stall.armAtGainPct)}, sells after ${plan.stall.minutes} min without a new high`] : [])];
  const armed = plan.stopLosses.filter(sl => sl.armAtGainPct && (!always || distance(sl) < distance(always))).sort((a, b) => a.armAtGainPct! - b.armAtGainPct!)
    .map(sl => `${sl.armAtGainPct! % 100 === 0 ? `after ${gain(sl.armAtGainPct!)}` : `once up ${pct(sl.armAtGainPct!)}`}, trails ${pct(distance(sl))}`);
  const stops = [...(always ? [describeTrail(distance(always))] : []), ...tightening, ...fixed, ...armed, ...locks, ...timed];
  const line = [sells.length ? `sells ${list(sells)}` : '', ...stops].filter(Boolean).join('; ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : 'Sells only when TraderBot decides';
}
