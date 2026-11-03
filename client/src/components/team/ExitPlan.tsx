"use client";
import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EXIT_PLANS, EXIT_PLAN_GROUPS, EXIT_RUNGS, SAVED_PLANS, TRAIL, describeExits, exitPlan, isTrail, namedExitPlan, trailPct, withTrail, withoutTrail, type ExitPlan, type ExitPlanId } from '../../../../types/exits';
import { FIXED_STOP_MIN_PCT } from '../../../../types/hotbot';
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
const GAINS = [20, 30, 50, 100, 200, 300, 500], SHARES = [10, 25, 33, 50, 100], MINUTES = [5, 10, 15, 30, 60], TRAILS = [5, 8, 10, 15, 20, 25, 30, 40];
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
  const sold = plan.takeProfits.reduce((sum, tp) => sum + tp.sellPct, 0), stopsFull = plan.stopLosses.length >= EXIT_RUNGS.stopLosses;
  const row = (key: string) => ({ open: open === key, onToggle: () => onOpen(open === key ? null : key) });
  // Every "Trail once up" step as one ladder: each arms at its gain and trails under the high, then sells its share once (`isTrailStep`) or the rest.
  const ladder = stops.flatMap((stop, index) => kindOf(stop) === 'armed' ? [{ stop, index }] : []);
  const distanceOf = (stop: Stop) => stop.trailDistancePct ?? stop.lossPct;
  const parts = ladder.reduce((sum, { stop }) => sum + (stop.sellPct < 100 ? stop.sellPct : 0), 0), sellsRest = ladder.some(({ stop }) => stop.sellPct >= 100);
  // A step sells nothing while a trail that sells the rest sits as close or closer whenever it is armed: the trailing stop, or a step that
  // sells the rest from no higher a gain.
  const beaten = (stop: Stop) => (on !== undefined && on <= distanceOf(stop))
    || (stop.sellPct < 100 && ladder.some(({ stop: other }) => other.sellPct >= 100 && other.armAtGainPct! <= stop.armAtGainPct! && distanceOf(other) <= distanceOf(stop)));
  // A new level doubles the highest gain, trails a step closer than the closest level and sells half, or what the levels leave of the bag.
  const addLevel = () => {
    const closest = Math.min(...ladder.map(({ stop }) => distanceOf(stop))), trailAt = [...TRAILS].reverse().find(n => n < closest) ?? closest;
    const armAtGainPct = Math.min(100_000, 2 * Math.max(...ladder.map(({ stop }) => stop.armAtGainPct!)));
    setStops([...stops, { lossPct: trailAt, sellPct: Math.min(50, Math.max(SHARES[0], 100 - parts)), trailing: true, trailDistancePct: trailAt, armAtGainPct }]);
    onOpen(`stop${stops.length}`);
  };
  const additions: { key: string; label: string; summary: string; next: () => ExitPlan; opens: string; hidden?: boolean }[] = [
    { key: 'take', label: 'Take profit', summary: 'Sells a share at a gain', hidden: sold >= 100 || plan.takeProfits.length >= EXIT_RUNGS.takeProfits, opens: `tp${plan.takeProfits.length}`, next: () => ({ ...plan, takeProfits: [...plan.takeProfits, { gainPct: plan.takeProfits.length ? Math.max(...plan.takeProfits.map(tp => tp.gainPct)) * 2 : 100, sellPct: Math.min(50, 100 - sold) }] }) },
    { key: 'armed', label: 'Trail once up', summary: 'Once up 30%, trails 10% under its high', hidden: stopsFull || ladder.length > 0, opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 10, sellPct: 100, trailing: true, trailDistancePct: 10, armAtGainPct: 30 }] }) },
    { key: 'tighten', label: 'Tighten over time', summary: 'After 30 min, trails 10% under its high', hidden: stopsFull, opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 10, sellPct: 100, trailing: true, trailDistancePct: 10, afterMinutes: 30 }] }) },
    { key: 'time', label: 'Time stop', summary: 'Sells at the buy price if not up after 10 min', hidden: stopsFull || stops.some(stop => kindOf(stop) === 'time'), opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 0, sellPct: 100, afterMinutes: 10 }] }) },
    { key: 'fixed', label: 'Stop under the buy', summary: 'Sells everything 25% under the buy', hidden: stopsFull || stops.some(stop => kindOf(stop) === 'fixed'), opens: `stop${stops.length}`, next: () => keep({ ...plan, stopLosses: [...stops, { lossPct: 25, sellPct: 100 }] }) },
    { key: 'scale', label: 'Scale out', summary: '10% at +20% and at every +10% after', hidden: Boolean(plan.scaleOut), opens: 'scale', next: () => ({ ...plan, scaleOut: { fromPct: 20, stepPct: 10, sellPct: 10 } }) },
    { key: 'lock', label: 'Lock in steps', summary: 'Every +25% it climbs locks in the step below', hidden: Boolean(plan.lockStepPct), opens: 'lock', next: () => ({ ...plan, lockStepPct: 25 }) },
    { key: 'stall', label: 'Sell on a stall', summary: 'Once up 15%, sells after 5 min without a new high', hidden: Boolean(plan.stall), opens: 'stall', next: () => ({ ...plan, stall: { armAtGainPct: 15, minutes: 5 } }) },
  ];
  const deltaText = (id: ExitPlanId) => { const d = planDelta?.(id); return d === undefined ? null : <em className={d > 0.005 ? s.up : d < -0.005 ? s.down : s.muted}>{Math.abs(d) < 0.005 ? '0.00' : signedSol(d, 2).replace(' SOL', '')}</em>; };

  const distanceVal = (stop: Stop, index: number, editing: boolean) => <Val editing={editing} value={distanceOf(stop)} kind="pct" min={1} max={99} steps={TRAILS} label="Trail distance" post="%" onChange={n => setStop(index, { trailDistancePct: n, lossPct: n })}/>;
  const distancePicks = (stop: Stop, index: number) => <QuickPicks label="Trails" options={picks(TRAILS, n => `${n}%`)} value={distanceOf(stop)} onPick={n => setStop(index, { trailDistancePct: n, lossPct: n })}/>;
  const remove = (index: number) => { onOpen(null); setStops(stops.filter((_, i) => i !== index)); };
  const levelRow = (stop: Stop, index: number) => {
    const key = `stop${index}`, o = open === key, warn = beaten(stop);
    return <SettingRow key={key} {...row(key)} label={gainText(stop.armAtGainPct!)} sub={warn ? 'A closer trail sells everything first' : undefined} warn={warn} changed={!same(stop, before[index])} onRemove={() => remove(index)}
      value={<>{o && <><Val editing autoFocus pre="+" value={stop.armAtGainPct!} kind="pct" min={1} max={100_000} steps={GAINS} label="Arms at a gain of" post="%" onChange={n => setStop(index, { armAtGainPct: n })}/> · </>}
        trails {distanceVal(stop, index, o)} · sells {o ? <Val editing value={stop.sellPct} kind="pct" min={1} max={100} steps={SHARES} label="Share of the bag sold" post="%" onChange={n => setStop(index, { sellPct: n })}/> : stop.sellPct >= 100 ? 'the rest' : share(stop.sellPct)}</>}>
      <QuickPicks label="Once up" options={picks(GAINS, gainText)} value={stop.armAtGainPct!} onPick={n => setStop(index, { armAtGainPct: n })}/>
      {distancePicks(stop, index)}
      <QuickPicks label="Sells" options={picks(SHARES, n => n >= 100 ? 'The rest' : `${n}%`)} value={stop.sellPct} onPick={n => setStop(index, { sellPct: n })}/>
    </SettingRow>;
  };
  const stopRow = (stop: Stop, index: number) => {
    const kind = kindOf(stop), key = `stop${index}`, o = open === key, changed = !same(stop, before[index]);
    if (kind === 'tighten') return <SettingRow key={key} id="tighten" {...row(key)} label="Tighten over time" sub="Trails closer under its high after a while" changed={changed} onRemove={() => remove(index)}
      value={<><Val editing={o} autoFocus value={stop.afterMinutes!} kind="min" min={1} max={1440} integer steps={MINUTES} label="Tightens after" onChange={n => setStop(index, { afterMinutes: n })}/> · {distanceVal(stop, index, o)}</>}>
      <QuickPicks label="After" options={picks(MINUTES, n => minutesText(n))} value={stop.afterMinutes!} onPick={n => setStop(index, { afterMinutes: n })}/>{distancePicks(stop, index)}
    </SettingRow>;
    if (kind === 'time') return <SettingRow key={key} id="timeStop" {...row(key)} label={stop.lossPct ? 'Sell if down after' : 'Sell if not up after'} sub={stop.lossPct ? `Sells if ${stop.lossPct}% under the buy by then` : 'Sells at the buy price'} changed={changed} onRemove={() => remove(index)}
      value={<Val editing={o} autoFocus value={stop.afterMinutes!} kind="min" min={1} max={1440} integer steps={MINUTES} label="Checks after" onChange={n => setStop(index, { afterMinutes: n })}/>}>
      <QuickPicks options={picks(MINUTES, n => minutesText(n))} value={stop.afterMinutes!} onPick={n => setStop(index, { afterMinutes: n })}/>
    </SettingRow>;
    return <SettingRow key={key} id="stopLoss" {...row(key)} label="Stop under the buy" sub="Sells everything this far under the buy" changed={changed} onRemove={() => remove(index)}
      value={<><Val editing={o} autoFocus pre="−" value={stop.lossPct} kind="pct" min={FIXED_STOP_MIN_PCT} max={99} steps={[10, 15, 20, 25, 30, 40]} label="Under the buy by" post="%" onChange={n => setStop(index, { lossPct: n })}/></>}>
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
    {ladder.length > 0 && <>
      <SettingRow id="armedTrail" label="Trail once up" changed={ladder.some(({ stop, index }) => !same(stop, before[index])) || ladder.length !== before.filter(stop => kindOf(stop) === 'armed').length}
        onRemove={() => { onOpen(null); setStops(stops.filter(stop => kindOf(stop) !== 'armed')); }}
        value={<><span className={s.ladderBar} role="img" aria-label={`${ladder.length} ${ladder.length > 1 ? 'levels sell' : 'level sells'} ${sellsRest || parts >= 100 ? 'the whole bag' : `${parts}% of the bag`}`}>
          {ladder.map(({ stop, index }) => stop.sellPct < 100 && <i key={index} style={{ flexGrow: stop.sellPct }}/>)}{parts < 100 && <i data-rest={sellsRest ? 'sold' : 'kept'} style={{ flexGrow: 100 - parts }}/>}
        </span><span className={s.valText}>{sellsRest || parts >= 100 ? 'sells all' : `sells ${parts}%`}</span></>}/>
      <div className={s.setParams}>
        {ladder.map(({ stop, index }) => levelRow(stop, index))}
        {!stopsFull && <SettingRow add label="Add a level" onToggle={addLevel}/>}
      </div>
    </>}
    {stops.map((stop, index) => kindOf(stop) === 'armed' ? null : stopRow(stop, index))}
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
