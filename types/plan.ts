import { pctFrom, signalRates, type Mark, type Signals } from './portfolio';
export const RISK_KINDS = ['liquidity', 'holders', 'sellers', 'labels'] as const;
export type RiskKind = typeof RISK_KINDS[number];

/** A step's state. `asked`: the fill waits for the owner (autonomy); it is `open` again when the ask expires and `refused` when the owner
 *  declines it. `refused`: the owner declined it, or Jev judged the fall a breakdown, so code did not buy. A step that is not `open` never
 *  fires again under this plan. */
export const STEP_STATES = ['open', 'filled', 'asked', 'refused'] as const;
export type StepState = typeof STEP_STATES[number];
export type Dip = { priceUsd: number; sol: number; state: StepState };
export type Take = { priceUsd: number; part: number; state: StepState };
/** Sells everything once the price falls `pct` under its high since the plan was set, after the high reached `armUsd`. */
export type Trail = { pct: number; armUsd: number; state: StepState };
/** `value` is a percent, or a count for `labels`. */
export type Risk = { kind: RiskKind; value: number; state: StepState };

/** The events that wake the model between reviews (`stepPlan`). `breakdown` comes from Jev's check of a dip; `dev`, a dev or big-wallet
 *  sell, has no source for held coins yet, so code never raises it. */
export const EVENT_KINDS = ['drain', 'holders', 'shock', 'sellers', 'labels', 'breakdown', 'dev'] as const;
export type EventKind = typeof EVENT_KINDS[number];

/** One coin's plan. `base` is where the coin stood when the plan was set: the levels' reference, and what risk exits and events measure
 *  from (`holders` only past `SIGNAL.holders`). `highUsd` is the highest price since then, for the trailing stop. `seen` are the event
 *  kinds that held when the plan was set or that a model already looked at under this plan: they do not wake it again until a new plan. */
export type Plan = {
  setAt: number; base: { priceUsd: number; liquidityUsd: number; holders?: number }; highUsd: number;
  dips: Dip[]; takes: Take[]; trail?: Trail; risks: Risk[]; notes?: string; seen: EventKind[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const RISK_TEXT: Record<RiskKind, (value: number) => string> = {
  liquidity: value => `liquidity down ${value}%`, holders: value => `pump.fun holders down ${value}%`, sellers: value => `sells at ${value}% of an hour's trades`, labels: value => `${value} posts labelled automated or scam`,
};
const priceText = (value: number) => '$' + (value >= 1 ? value.toFixed(2) : value.toPrecision(3));

/** One meter of a plan on the page: how far the coin has moved from where the plan was set toward a step, from 0 to 1 (1: it fires).
 *  `tone`: up for a take, ember for a dip, warn for an exit. A trailing stop's `priceUsd` is its stop once `armed`, else where it starts.
 *  A step that is not open shows its state; a risk without its source has no meter. */
export type PlanMeter = { key: string; kind: 'dip' | 'take' | 'trail' | 'risk'; priceUsd?: number; sol?: number; part?: number; risk?: RiskKind; value?: number; armed?: boolean; fill: number; state: StepState; tone: 'up' | 'ember' | 'warn' };
export function planMeters(plan: Plan, mark: Mark, signals?: Signals, flagged?: number): PlanMeter[] {
  const price = mark.priceUsd, base = plan.base.priceUsd, part = (moved: number, of: number) => of > 0 ? clamp(moved / of, 0, 1) : 0;
  const rows: PlanMeter[] = [
    ...plan.takes.map((take, index): PlanMeter => ({ key: `take${index}`, kind: 'take', priceUsd: take.priceUsd, part: take.part, fill: take.state === 'open' ? part(price - base, take.priceUsd - base) : 1, state: take.state, tone: 'up' })),
    ...plan.dips.map((dip, index): PlanMeter => ({ key: `dip${index}`, kind: 'dip', priceUsd: dip.priceUsd, sol: dip.sol, fill: dip.state === 'open' ? part(base - price, base - dip.priceUsd) : 1, state: dip.state, tone: 'ember' })),
  ];
  const trail = plan.trail;
  if (trail) {
    const armed = plan.highUsd >= trail.armUsd, stop = plan.highUsd * (1 - trail.pct / 100);
    rows.push({ key: 'trail', kind: 'trail', priceUsd: armed ? stop : trail.armUsd, value: trail.pct, armed, fill: trail.state !== 'open' ? 1 : armed ? part(plan.highUsd - price, plan.highUsd - stop) : 0, state: trail.state, tone: 'warn' });
  }
  const rate = signalRates(mark);
  for (const [index, risk] of plan.risks.entries()) {
    const fill = risk.kind === 'liquidity' ? (mark.liquidityUsd > 0 ? part(-pctFrom(plan.base.liquidityUsd, mark.liquidityUsd), risk.value) : null)
      : risk.kind === 'holders' ? (plan.base.holders !== undefined && signals?.pumpUsers !== undefined ? part(-pctFrom(plan.base.holders, signals.pumpUsers), risk.value) : null)
      : risk.kind === 'sellers' ? (rate.sellers ? (rate.sellers.ready ? part(rate.sellers.value - 50, risk.value - 50) : 0) : null)
      : flagged !== undefined ? part(flagged, risk.value) : null;
    if (fill !== null || risk.state !== 'open') rows.push({ key: `risk${index}`, kind: 'risk', risk: risk.kind, value: risk.value, fill: risk.state === 'open' ? fill ?? 0 : 1, state: risk.state, tone: 'warn' });
  }
  return rows;
}

/** A plan in a few words per step, as the chat and the Agent API read it. */
export function planText(plan: Plan): string[] {
  return [
    ...plan.dips.map((dip, index) => `dip ${index + 1}: buy ${dip.sol} SOL at ${priceText(dip.priceUsd)}${dip.state === 'open' ? '' : ` (${dip.state})`}`),
    ...plan.takes.map((take, index) => `take ${index + 1}: sell ${take.part >= 1 ? 'the rest' : Math.round(take.part * 100) + '%'} at ${priceText(take.priceUsd)}${take.state === 'open' ? '' : ` (${take.state})`}`),
    ...(plan.trail ? [`trailing stop ${plan.trail.pct}% off the high${plan.highUsd >= plan.trail.armUsd ? '' : `, from ${priceText(plan.trail.armUsd)}`}${plan.trail.state === 'open' ? '' : ` (${plan.trail.state})`}`] : []),
    ...plan.risks.map(row => `exit on ${RISK_TEXT[row.kind](row.value)}${row.state === 'open' ? '' : ` (${row.state})`}`),
  ];
}
