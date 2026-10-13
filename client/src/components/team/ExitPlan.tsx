"use client";
import { useLayoutEffect, useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EXIT_PLANS, EXIT_PLAN_GROUPS, SAVED_PLANS, TRAIL, describeExits, exitPlan, exitTrigger, isTrail, namedExitPlan, stopLevel, trailPct, withTrail, withoutTrail, type ExitPlan, type ExitPlanId } from '../../../../types/exits';
import { signedSol } from './format';
import { QuickPicks, SettingRow, Val, minutesText } from './Parts';
import s from './team.module.css';

type Stop = ExitPlan['stopLosses'][number];
type TakeProfit = ExitPlan['takeProfits'][number];
/** The stops a plan keeps beside its trailing stop, by what arms them. */
const kindOf = (stop: Stop) => stop.armAtGainPct ? 'armed' : stop.afterMinutes ? stop.trailing ? 'tighten' : 'time' : 'fixed';
/** Key-sorted JSON, so a stored plan (Convex returns sorted keys) and an edited one compare by content. */
export const stable = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b))) : v);
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const gainText = (pct: number) => pct % 100 === 0 && pct > 0 ? `${pct / 100 + 1}×` : `+${Math.round(pct)}%`;

const share = (pct: number) => pct >= 100 ? 'all' : `${Math.round(pct)}%`;
const GAINS = [20, 30, 50, 100, 200, 300, 500], SHARES = [10, 25, 33, 50, 100], MINUTES = [5, 10, 15, 30, 60], TRAILS = [5, 8, 10, 15, 20, 25];
const picks = (values: number[], text: (n: number) => string) => values.map(value => ({ value, text: text(value) }));

/** What a plan sells above the trailing stop, in words. */
const sellsText = (plan: ExitPlan) => describeExits({ ...plan, stopLosses: plan.stopLosses.filter(stop => !isTrail(stop)) });

/** TraderBot's exit plan as rows: the trailing stop, the plan it starts from (Custom, which starts empty, and the person's own saved plans, then
 *  each named plan with what the last days would make with it, when the Lab's data has loaded; the row's trash also empties it), one row per step, the steps it can add and, for a plan of one's own, saving
 *  it. Every change goes back as a whole plan, and picking a plan keeps the trailing stop as it is; `onTrail` sets the trailing stop, 0 for none. */
export function ExitPlanRows({ plan, initial, onChange, onTrail, open, onOpen, planDelta, saved = [], onSave, onForget }: { plan: ExitPlan; initial: ExitPlan; onChange: (plan: ExitPlan) => void; onTrail: (pct: number) => void; open: string | null; onOpen: (key: string | null) => void; planDelta?: (id: ExitPlanId) => number | undefined; saved?: ExitPlan[]; onSave?: (exits: ExitPlan) => Promise<boolean>; onForget?: (name: string) => void }) {
  const on = trailPct(plan), trail = on ?? trailPct(initial) ?? TRAIL.choices[1], stops = plan.stopLosses.filter(stop => !isTrail(stop)), before = initial.stopLosses.filter(stop => !isTrail(stop));
  // A saved plan matches by name and steps, whatever trailing stop and sell slippage the strategy carries; the server stores take-profits by gain.
  const keep = (p: ExitPlan) => on ? withTrail(p, on) : withoutTrail(p);
  const steps = (p: ExitPlan) => stable({ ...withTrail(p, trail), takeProfits: [...p.takeProfits].sort((x, y) => x.gainPct - y.gainPct), sellSlippageBps: undefined });
  const named = namedExitPlan(plan), mine = saved.find(p => steps(p) === steps(plan));
  const known = Object.values(EXIT_PLANS).some(row => row.exits.name === plan.name) || saved.some(p => p.name === plan.name);
  const title = named ? EXIT_PLANS[named].exits.name : mine ? mine.name : known ? `${plan.name}, edited` : 'Custom';
  const pick = (p: ExitPlan) => { onChange(keep({ ...p, sellSlippageBps: plan.sellSlippageBps })); onOpen(null); };
  // Custom starts empty: only the trailing stop sells until steps are added, so it opens the steps to add.
  const blank = !plan.takeProfits.length && !stops.length && !plan.scaleOut && !plan.lockStepPct && !plan.stall, isCustom = blank && !named && !mine;
  const custom = () => { onChange(keep({ name: 'Custom', takeProfits: [], stopLosses: [], sellSlippageBps: plan.sellSlippageBps })); onOpen('add'); };
  const setStops = (next: Stop[]) => onChange(keep({ ...plan, stopLosses: next }));
  const setStop = (index: number, change: Partial<Stop>) => setStops(stops.map((stop, i) => i === index ? { ...stop, ...change } : stop));
  const setTake = (index: number, change: Partial<TakeProfit>) => onChange({ ...plan, takeProfits: plan.takeProfits.map((tp, i) => i === index ? { ...tp, ...change } : tp) });
  const sold = plan.takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0);
  const row = (key: string) => ({ open: open === key, onToggle: () => onOpen(open === key ? null : key) });
  const additions: { key: string; label: string; summary: string; next: () => ExitPlan; opens: string; hidden?: boolean }[] = [
    { key: 'take', label: 'Take profit', summary: 'Sells a share at a gain', hidden: sold >= 100, opens: `tp${plan.takeProfits.length}`, next: () => ({ ...plan, takeProfits: [...plan.takeProfits, { gainPct: plan.takeProfits.length ? Math.max(...plan.takeProfits.map(tp => tp.gainPct)) * 2 : 100, sellPct: Math.min(50, 100 - sold) }] }) },
    { key: 'armed', label: 'Trail once up', summary: 'Once up 30%, trails 10% under its high', opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 10, sellPct: 100, trailing: true, trailDistancePct: 10, armAtGainPct: 30 }] }) },
    { key: 'tighten', label: 'Tighten over time', summary: 'After 30 min, trails 10% under its high', opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 10, sellPct: 100, trailing: true, trailDistancePct: 10, afterMinutes: 30 }] }) },
    { key: 'time', label: 'Time stop', summary: 'Sells at the buy price if not up after 10 min', hidden: stops.some(stop => kindOf(stop) === 'time'), opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 0, sellPct: 100, afterMinutes: 10 }] }) },
    { key: 'fixed', label: 'Stop under the buy', summary: 'Sells everything 25% under the buy', hidden: stops.some(stop => kindOf(stop) === 'fixed'), opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 25, sellPct: 100 }] }) },
    { key: 'scale', label: 'Scale out', summary: '10% at +20% and at every +10% after', hidden: Boolean(plan.scaleOut), opens: 'scale', next: () => ({ ...plan, scaleOut: { fromPct: 20, stepPct: 10, sellPct: 10 } }) },
    { key: 'lock', label: 'Lock in steps', summary: 'Every +25% it climbs locks in the step below', hidden: Boolean(plan.lockStepPct), opens: 'lock', next: () => ({ ...plan, lockStepPct: 25 }) },
    { key: 'stall', label: 'Sell on a stall', summary: 'Once up 15%, sells after 5 min without a new high', hidden: Boolean(plan.stall), opens: 'stall', next: () => ({ ...plan, stall: { armAtGainPct: 15, minutes: 5 } }) },
  ];
  const deltaText = (id: ExitPlanId) => { const d = planDelta?.(id); return d === undefined ? null : <em className={d > 0.005 ? s.up : d < -0.005 ? s.down : s.muted}>{Math.abs(d) < 0.005 ? '0.00' : signedSol(d, 2).replace(' SOL', '')}</em>; };

  const stopRow = (stop: Stop, index: number) => {
    const kind = kindOf(stop), key = `stop${index}`, o = open === key, changed = !same(stop, before[index]), remove = () => { onOpen(null); setStops(stops.filter((_, i) => i !== index)); };
    const distance = <Val editing={o} value={stop.trailDistancePct ?? stop.lossPct} kind="pct" min={1} max={99} steps={TRAILS} label="Trail distance" post="%" onChange={n => setStop(index, { trailDistancePct: n, lossPct: n })}/>;
    const distancePicks = <QuickPicks label="Trails" options={picks(TRAILS, n => `${n}%`)} value={stop.trailDistancePct ?? stop.lossPct} onPick={n => setStop(index, { trailDistancePct: n, lossPct: n })}/>;
    if (kind === 'armed') return <SettingRow key={key} id="armedTrail" {...row(key)} label="Trail once up" sub="Trails under its high once it reaches the gain" changed={changed} onRemove={remove}
      value={<><Val editing={o} autoFocus pre="+" value={stop.armAtGainPct!} kind="pct" min={1} max={100_000} steps={[15, 20, 30, 50, 100]} label="Arms at a gain of" post="%" onChange={n => setStop(index, { armAtGainPct: n })}/> · {distance}</>}>
      <QuickPicks label="Once up" options={picks([15, 20, 30, 50, 100], n => `+${n}%`)} value={stop.armAtGainPct!} onPick={n => setStop(index, { armAtGainPct: n })}/>{distancePicks}
    </SettingRow>;
    if (kind === 'tighten') return <SettingRow key={key} id="tighten" {...row(key)} label="Tighten over time" sub="Trails closer under its high after a while" changed={changed} onRemove={remove}
      value={<><Val editing={o} autoFocus value={stop.afterMinutes!} kind="min" min={1} max={1440} integer steps={MINUTES} label="Tightens after" onChange={n => setStop(index, { afterMinutes: n })}/> · {distance}</>}>
      <QuickPicks label="After" options={picks(MINUTES, n => minutesText(n))} value={stop.afterMinutes!} onPick={n => setStop(index, { afterMinutes: n })}/>{distancePicks}
    </SettingRow>;
    if (kind === 'time') return <SettingRow key={key} id="timeStop" {...row(key)} label={stop.lossPct ? 'Sell if down after' : 'Sell if not up after'} sub={stop.lossPct ? `Sells if ${stop.lossPct}% under the buy by then` : 'Sells at the buy price'} changed={changed} onRemove={remove}
      value={<Val editing={o} autoFocus value={stop.afterMinutes!} kind="min" min={1} max={1440} integer steps={MINUTES} label="Checks after" onChange={n => setStop(index, { afterMinutes: n })}/>}>
      <QuickPicks options={picks(MINUTES, n => minutesText(n))} value={stop.afterMinutes!} onPick={n => setStop(index, { afterMinutes: n })}/>
    </SettingRow>;
    return <SettingRow key={key} id="stopLoss" {...row(key)} label="Stop under the buy" sub="Sells everything this far under the buy" changed={changed} onRemove={remove}
      value={<><Val editing={o} autoFocus pre="−" value={stop.lossPct} kind="pct" min={1} max={99} steps={[10, 15, 20, 25, 30, 40]} label="Under the buy by" post="%" onChange={n => setStop(index, { lossPct: n })}/></>}>
      <QuickPicks options={picks([10, 15, 20, 25, 30, 40], n => `−${n}%`)} value={stop.lossPct} onPick={n => setStop(index, { lossPct: n })}/>
    </SettingRow>;
  };

  return <>
    <SettingRow id="trail" {...(on ? row('trail') : {})} label="Trailing stop" sub={on ? 'Sells everything this far under its high' : 'Off: no stop follows the high'} changed={on !== trailPct(initial)}
      value={on ? <Val editing={open === 'trail'} autoFocus value={on} kind="pct" min={TRAIL.min} max={TRAIL.max} steps={[...TRAIL.choices]} label="Trailing stop under the high" post="%" onChange={n => onTrail(Math.round(n * 10) / 10)}/> : undefined}
      control={<Switch checked={Boolean(on)} aria-label="Trailing stop" onCheckedChange={checked => { onTrail(checked ? trail : 0); if (!checked && open === 'trail') onOpen(null); }}/>}>
      {on ? <QuickPicks options={picks([...TRAIL.choices], n => `${n}%`)} value={on} onPick={n => onTrail(n)}/> : null}
    </SettingRow>
    <SettingRow id="exitPlan" {...row('plan')} label="Exit plan" sub="Start from one, then change any step" changed={stable(plan) !== stable(initial)} value={<span className={s.valText}>{title}</span>} onRemove={blank ? undefined : custom}>
      <div className={s.planList} role="listbox" aria-label="Exit plans">
        <div role="group" aria-label="Yours"><small>Yours</small>
          <button type="button" role="option" aria-selected={isCustom} onClick={custom}><b>Custom{isCustom && <Check/>}</b><span>Starts empty for steps of your own; the trailing stop stays</span></button>
          {saved.map(p => <div key={p.name} className={s.planMine}>
            <button type="button" role="option" aria-selected={mine?.name === p.name} onClick={() => pick(p)}><b>{p.name}{mine?.name === p.name && <Check/>}</b><span>{sellsText(p)}</span></button>
            {onForget && <button type="button" className={s.planForget} aria-label={`Forget ${p.name}`} onClick={() => onForget(p.name)}><Trash2/></button>}
          </div>)}
        </div>
        {EXIT_PLAN_GROUPS.map(group => <div key={group.label} role="group" aria-label={group.label}><small>{group.label}</small>
          {group.ids.map(id => <button type="button" key={id} role="option" aria-selected={named === id} onClick={() => { onChange(exitPlan(id, plan.sellSlippageBps ?? 300, on)); onOpen(null); }}>
            <b>{EXIT_PLANS[id].exits.name}{named === id ? <Check/> : deltaText(id)}</b><span>{EXIT_PLANS[id].summary}</span>
          </button>)}
        </div>)}
        {planDelta && <small className={s.planNote}>Beside each plan: what the last days would make with it, against now.</small>}
      </div>
    </SettingRow>
    {plan.takeProfits.map((tp, index) => { const key = `tp${index}`, o = open === key;
      return <SettingRow key={key} id="takeProfit" {...row(key)} label="Take profit" sub={tp.pullbackPct ? `Sells on a ${tp.pullbackPct}% pullback after it` : 'Sells at once'} changed={!same(tp, initial.takeProfits[index])}
        onRemove={() => { onOpen(null); onChange({ ...plan, takeProfits: plan.takeProfits.filter((_, i) => i !== index) }); }}
        value={<><Val editing={o} autoFocus pre="+" value={tp.gainPct} kind="pct" min={1} max={100_000} steps={GAINS} label="Take profit at a gain of" post="%" onChange={n => setTake(index, { gainPct: n })}/> · {o ? <Val editing value={tp.sellPct} kind="pct" min={1} max={100} steps={SHARES} label="Share of the bag sold" post="%" onChange={n => setTake(index, { sellPct: n })}/> : `sells ${share(tp.sellPct)}`}</>}>
        <QuickPicks label="At" options={picks(GAINS, gainText)} value={tp.gainPct} onPick={n => setTake(index, { gainPct: n })}/>
        <QuickPicks label="Sells" options={picks(SHARES, n => n >= 100 ? 'All' : `${n}%`)} value={tp.sellPct} onPick={n => setTake(index, { sellPct: n })}/>
        <QuickPicks label="When" options={[{ value: 0, text: 'At once' }, ...picks([10, 15, 20, 30], n => `On a ${n}% pullback`)]} value={tp.pullbackPct ?? 0} onPick={n => setTake(index, { pullbackPct: n || undefined })}/>
      </SettingRow>; })}
    {stops.map(stopRow)}
    {plan.scaleOut && <SettingRow id="scaleOut" {...row('scale')} label="Scale out" sub={`From +${plan.scaleOut.fromPct}%`} changed={!same(plan.scaleOut, initial.scaleOut)} onRemove={() => { onOpen(null); onChange({ ...plan, scaleOut: undefined }); }}
      value={<><Val editing={open === 'scale'} value={plan.scaleOut.sellPct} kind="pct" min={1} max={100} steps={[5, 10, 20, 25]} label="Share sold each step" post="%" onChange={n => onChange({ ...plan, scaleOut: { ...plan.scaleOut!, sellPct: n } })}/> every <Val editing={open === 'scale'} pre="+" value={plan.scaleOut.stepPct} kind="pct" min={1} max={1000} steps={[5, 10, 20, 50]} label="Step between sells" post="%" onChange={n => onChange({ ...plan, scaleOut: { ...plan.scaleOut!, stepPct: n } })}/></>}>
      <QuickPicks label="From" options={picks([10, 20, 30, 50, 100], n => `+${n}%`)} value={plan.scaleOut.fromPct} onPick={n => onChange({ ...plan, scaleOut: { ...plan.scaleOut!, fromPct: n } })}/>
      <QuickPicks label="Sells each step" options={picks([5, 10, 20, 25], n => `${n}%`)} value={plan.scaleOut.sellPct} onPick={n => onChange({ ...plan, scaleOut: { ...plan.scaleOut!, sellPct: n } })}/>
    </SettingRow>}
    {plan.lockStepPct ? <SettingRow id="lockSteps" {...row('lock')} label="Lock in steps" sub="Each step it climbs locks in the one below" changed={plan.lockStepPct !== initial.lockStepPct} onRemove={() => { onOpen(null); onChange({ ...plan, lockStepPct: undefined }); }}
      value={<>every <Val editing={open === 'lock'} autoFocus pre="+" value={plan.lockStepPct} kind="pct" min={1} max={1000} steps={[10, 20, 25, 50, 100]} label="Step size" post="%" onChange={n => onChange({ ...plan, lockStepPct: n })}/></>}>
      <QuickPicks options={picks([10, 20, 25, 50, 100], n => `+${n}%`)} value={plan.lockStepPct} onPick={n => onChange({ ...plan, lockStepPct: n })}/>
    </SettingRow> : null}
    {plan.stall && <SettingRow id="stall" {...row('stall')} label={`Sell on a stall once up ${plan.stall.armAtGainPct}%`} sub="Sells after this long without a new high" changed={!same(plan.stall, initial.stall)} onRemove={() => { onOpen(null); onChange({ ...plan, stall: undefined }); }}
      value={<Val editing={open === 'stall'} autoFocus value={plan.stall.minutes} kind="min" min={1} max={240} integer steps={[2, 3, 5, 10, 15]} label="Minutes without a new high" onChange={n => onChange({ ...plan, stall: { ...plan.stall!, minutes: n } })}/>}>
      <QuickPicks label="Once up" options={picks([10, 15, 20, 30, 50], n => `+${n}%`)} value={plan.stall.armAtGainPct} onPick={n => onChange({ ...plan, stall: { ...plan.stall!, armAtGainPct: n } })}/>
      <QuickPicks label="No new high for" options={picks([2, 3, 5, 10, 15], n => minutesText(n))} value={plan.stall.minutes} onPick={n => onChange({ ...plan, stall: { ...plan.stall!, minutes: n } })}/>
    </SettingRow>}
    <SettingRow id="addStep" {...row('add')} add label="Add a step">
      <div className={s.planList} role="listbox" aria-label="Steps to add">{additions.filter(addition => !addition.hidden).map(addition => <button type="button" key={addition.key} role="option" aria-selected={false} onClick={() => { onChange(addition.next()); onOpen(addition.opens); }}><b>{addition.label}</b><span>{addition.summary}</span></button>)}</div>
    </SettingRow>
    {onSave && !named && !mine && <SettingRow id="savePlan" {...row('save')} add label="Save as your plan" sub={saved.length >= SAVED_PLANS.max ? `You keep up to ${SAVED_PLANS.max}: forget one under Exit plan first` : 'Pick it under Exit plan in any strategy'} warn={saved.length >= SAVED_PLANS.max}>
      {saved.length < SAVED_PLANS.max && <SavePlan suggested={known ? '' : plan.name} taken={saved.map(p => p.name)} onSave={async name => { if (await onSave({ ...plan, name })) { onChange({ ...plan, name }); onOpen(null); } }}/>}
    </SettingRow>}
  </>;
}

/** Names the plan and keeps it: a name already among one's own plans replaces that plan. */
function SavePlan({ suggested, taken, onSave }: { suggested: string; taken: string[]; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(suggested), [saving, setSaving] = useState(false), clean = name.trim();
  const replaces = taken.find(other => other.toLowerCase() === clean.toLowerCase());
  return <form className={s.planSave} onSubmit={async event => { event.preventDefault(); if (!clean || saving) return; setSaving(true); await onSave(clean); setSaving(false); }}>
    <Input autoFocus value={name} maxLength={SAVED_PLANS.nameLength} placeholder="Name this plan" aria-label="Plan name" onChange={event => setName(event.target.value)}/>
    <Button type="submit" size="sm" disabled={!clean || saving}>{replaces ? 'Replace' : 'Save'}</Button>
  </form>;
}

type Point = { t: number; p: number };
type Mark = { t: number; p: number; take: boolean; label: string };
/** One made-up coin run through the real exit evaluator (exitTrigger and stopLevel, the code the worker sells with): it climbs past the plan's
 *  levels, then falls. What it draws is what the engine would do to that coin: the stop that follows it, each sell and when the bag is gone. */
function simulate(plan: ExitPlan) {
  const cues = [...plan.takeProfits.map(tp => tp.gainPct), ...plan.stopLosses.flatMap(stop => stop.armAtGainPct ? [stop.armAtGainPct] : []), plan.stall?.armAtGainPct ?? 0, (plan.scaleOut?.fromPct ?? 0) * 1.6, (plan.lockStepPct ?? 0) * 2.6].filter(g => g > 0 && g <= 400);
  const peak = Math.max(40, Math.min(320, (cues.length ? Math.max(...cues) : 50) * 1.2)) / 100;
  const times = [...plan.stopLosses.flatMap(stop => stop.afterMinutes ? [stop.afterMinutes] : []), (plan.stall?.minutes ?? 0) * 3];
  const span = Math.max(30, Math.min(240, Math.max(0, ...times) * 1.7)), steps = 180;
  const gain = (u: number) => u <= 0.5 ? peak * Math.sin(Math.PI / 2 * u / 0.5) ** 1.15 + 0.06 * peak * Math.sin(u * 29) * u : peak - (peak + 0.5) * ((u - 0.5) / 0.5) ** 1.6 + 0.04 * peak * Math.sin(u * 23) * (1 - u);
  const path: Point[] = [], stop: Point[] = [], marks: Mark[] = [];
  let high = 1, highAt = 0, rungs = 0, left = 100, soldAt = span;
  for (let i = 0; i <= steps; i++) {
    const t = span * i / steps, p = 1 + gain(i / steps);
    path.push({ t, p });
    if (left <= 0) continue;
    if (p > high) { high = p; highAt = t; }
    const state = { entryPriceUsd: 1, highUsd: high, rungs, heldMs: t * 60_000, sinceHighMs: (t - highAt) * 60_000 };
    const level = stopLevel(plan, state).level;
    if (level > 0) stop.push({ t, p: level });
    const hit = exitTrigger(plan, state, p);
    if (!hit) continue;
    const name = hit.reason.split(':')[0];
    if (hit.rung !== undefined) { rungs = hit.rung + 1; const share = Math.min(left, hit.sellPct); left -= share; marks.push({ t, p: hit.atUsd ?? p, take: true, label: left <= 0 ? `Sold all at ${gainText(((hit.atUsd ?? p) - 1) * 100)}` : `Sold ${Math.round(share)}%` }); }
    else { left = 0; marks.push({ t, p: hit.atUsd ?? p, take: false, label: name === 'Took profit' ? 'Sold the rest' : name }); }
    if (left <= 0) soldAt = t;
  }
  return { path, stop, marks, soldAt, span };
}

const L = 44, R = 14, TOP = 14, BOTTOM = 24;
/** The plan as a picture: one coin's price (white until the bag is gone, faint after), the stop following it in ember, take-profit levels in green,
 *  the minutes timed rules wait for, and a dot with its reason at every sell. */
export function ExitGraph({ plan }: { plan: ExitPlan }) {
  // Drawn at its real width, so labels keep their size from a phone to a wide column.
  const [box, setBox] = useState<SVGSVGElement | null>(null), [W, setW] = useState(560);
  useLayoutEffect(() => {
    if (!box) return;
    const measure = () => setW(Math.max(260, Math.round(box.getBoundingClientRect().width)));
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    measure();
    return () => observer.disconnect();
  }, [box]);
  const H = Math.round(Math.min(210, Math.max(160, W * 0.3)));
  const key = JSON.stringify(plan);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the plan's JSON is its identity; the board hands a new object on every update.
  const sim = useMemo(() => simulate(plan), [key]);
  // After the last sell the coin carries on faintly for a short while, so the picture shows what the plan stepped away from.
  const drawn = sim.path.filter(point => point.t <= sim.soldAt + sim.span * 0.25), after = drawn.filter(point => point.t >= sim.soldAt);
  const peak = Math.max(...drawn.map(point => point.p));
  const levels = plan.takeProfits.map(tp => 1 + tp.gainPct / 100);
  const top = Math.max(peak, ...levels.filter(level => level <= peak * 1.5)) * 1.06 - 0.06;
  const bottom = Math.min(...drawn.map(point => point.p), ...sim.stop.map(point => point.p), 1) - 0.08;
  const end = Math.max(...drawn.map(point => point.t)), x = (t: number) => L + (W - L - R) * t / end, y = (p: number) => TOP + (H - TOP - BOTTOM) * (top - Math.min(top, p)) / (top - bottom);
  const line = (points: Point[]) => points.map((point, i) => `${i ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(point.p).toFixed(1)}`).join(' ');
  const timed = [...new Set(plan.stopLosses.flatMap(stop => stop.afterMinutes && stop.afterMinutes < end ? [stop.afterMinutes] : []))];
  return <svg ref={setBox} className={s.exitGraph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`What the plan does to a coin that climbs and falls back: ${describeExits(plan)}`}>
    <line className={s.gBuy} x1={L} x2={W - R} y1={y(1)} y2={y(1)}/>
    <text className={s.gAxis} x={0} y={y(1) + 4}>Buy</text>
    {levels.map((level, i) => <g key={i} className={s.gTake}>
      <line x1={L} x2={W - R} y1={y(level)} y2={y(level)}/>
      <text x={0} y={y(level) + 4}>{level > top ? '↑ ' : ''}{gainText((level - 1) * 100)}</text>
    </g>)}
    {timed.map(minutes => <g key={minutes} className={s.gTime}>
      <line x1={x(minutes)} x2={x(minutes)} y1={TOP} y2={H - BOTTOM}/>
      <text x={x(minutes) + 5} y={H - 6}>{minutes < 60 ? `${minutes} min` : `${+(minutes / 60).toFixed(1)} h`}</text>
    </g>)}
    {after.length > 1 && <path className={s.gAfter} d={line(after)}/>}
    <path className={s.gPath} d={line(sim.path.filter(point => point.t <= sim.soldAt))}/>
    {sim.stop.length > 1 && <path className={s.gStop} d={line(sim.stop)}/>}
    {sim.marks.slice(0, 4).map((mark, i) => <g key={i} className={mark.take ? s.gTakeMark : s.gStopMark}>
      <circle cx={x(mark.t)} cy={y(mark.p)} r={4.5}/>
      <text x={x(mark.t) > W - 150 ? x(mark.t) - 8 : x(mark.t) + 8} y={y(mark.p) + (mark.take ? -9 : 16)} textAnchor={x(mark.t) > W - 150 ? 'end' : 'start'}>{mark.label}</text>
    </g>)}
  </svg>;
}
