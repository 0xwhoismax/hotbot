"use client";
import { useRef, useState, type ReactNode } from 'react';
import { ChartColumn, Check, CircleDollarSign, CircleHelp, GraduationCap, Sparkles, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { COINS, EASY_PLANS, MARKETS, STOPS, TOTALS, TRAILS, budgetPatch, easyNameOf, easyPlanName, exitsWith, fixedStop, marketOf, marketPatch, planOf } from '../../../../types/easy';
import { EXIT_PLANS, TRAIL, trailPct } from '../../../../types/exits';
import { SUGGEST } from '../../../../types/lab';
import type { TeamRules } from '../../../../types/hotbot';
import type { StrategyPatch } from '../../../../types/team';
import { signedSol } from './format';
import { QuickPicks, SettingRow, Val, useSpotAttrs } from './Parts';
import { LossStopRow, PracticeStopRow } from './LossStop';
import type { SettingsDraft } from './Settings';
import s from './team.module.css';

const MARKET_ICONS: Record<string, LucideIcon> = { new: Sparkles, graduated: GraduationCap, six: CircleDollarSign, mid: ChartColumn };

/** The `?` beside a setting's name: a dialog, so it reads the same on a phone. */
function Help({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={s.easyHelp} aria-label={`About ${title.toLowerCase()}`} onClick={event => { event.stopPropagation(); setOpen(true); }}><CircleHelp/></button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
        <div className={s.easyHelpBody}><DialogTitle asChild><b>{title}</b></DialogTitle>{children}</div>
      </DialogContent>
    </Dialog>
  </>;
}

/** Easy: the kind of coin, then the exits and the budget, on the same setting rows Advanced uses. Every row writes the rules
 *  Advanced edits. The research checks live in Advanced. */
/** `askInRows`: a phone keeps Ask before each buy in the rows; a desktop puts it beside the button (`EasyAsk`). `examples`: the draft's
 *  example trades, under the coin kinds. */
export function EasyEditor({ draft, open, setOpen, askInRows, twin = false, examples }: { draft: SettingsDraft; open: string | null; setOpen: (key: string | null) => void; askInRows: boolean; twin?: boolean; examples?: ReactNode }) {
  const { rules, patch, strategy, set } = draft, initial = strategy.rules;
  const market = marketOf(rules);
  const plan = planOf(rules.exits), fixed = fixedStop(rules.exits), trail = trailPct(rules.exits);
  const total = rules.allocationSol, coins = rules.maxOpenPositions;
  // Each stop's switch turns it back on at the value it had when it went off (the saved one, or a middle pick for a stop never set). Both
  // rows open while off too; a pick turns the stop on at that value.
  const kept = useRef({ fixed: fixedStop(initial.exits) || STOPS[1], trail: trailPct(initial.exits) ?? TRAILS[1] });
  const toggle = (key: string) => ({ open: open === key, onToggle: () => setOpen(open === key ? null : key) });
  const changed = (...keys: (keyof StrategyPatch)[]) => keys.some(key => key in patch);
  const exitsChanged = (read: (exits: typeof rules.exits) => unknown) => 'exits' in patch && read(rules.exits) !== read(initial.exits);
  const exits = (change: Parameters<typeof exitsWith>[1]) => set({ exits: exitsWith(rules.exits, change) });
  const setTrail = (pct: number) => set({ stopLossPct: Math.round(pct * 10) / 10 });
  const marketSpot = useSpotAttrs('market');
  return <div className={s.easy}>
    <div className={s.easyTiles} role="radiogroup" aria-label="What to trade" {...marketSpot}>
      {MARKETS.map(row => { const Icon = MARKET_ICONS[row.id]; return <button type="button" role="radio" key={row.id} aria-checked={market?.id === row.id} className={s.easyTile} onClick={() => set(marketPatch(row, rules))}>
        <span><Icon/></span><b>{row.name}</b><small>{row.text}</small>
        <em aria-label={`Risk ${row.risk} of 4, ${row.pace.toLowerCase()}`}>Risk{[1, 2, 3, 4].map(n => <i key={n} data-on={n <= row.risk || undefined}/>)}<span>{row.pace}</span></em>
      </button>; })}
    </div>
    {examples}

    <div className={s.setGroup}>
      <SettingRow id="exitPlan" {...toggle('easyPlan')} label="Take profit" changed={exitsChanged(planOf)} value={<span className={s.valText}>{plan ? easyPlanName(plan) : rules.exits.name ? easyNameOf(rules.exits.name) : 'Custom'}</span>}>
        <div className={s.planList} role="listbox" aria-label="Take profit">
          {EASY_PLANS.map(row => <button type="button" key={row.id} role="option" aria-selected={plan === row.id} onClick={() => { exits({ plan: EXIT_PLANS[row.id].exits }); setOpen(null); }}>
            <b>{row.name}{plan === row.id && <Check/>}</b><span>{row.text}</span>
          </button>)}
        </div>
      </SettingRow>
      <SettingRow id="stopLoss" {...toggle('easyStop')} changed={exitsChanged(fixedStop)} label={<>Stop loss<Help title="Stop loss">
        <p>Sells everything once the price falls this far under your buy.</p>
        <p>Off: no stop under the buy. The trailing stop and TraderBot still sell.</p>
      </Help></>} value={fixed ? <Val editing={open === 'easyStop'} autoFocus value={fixed} kind="pct" min={1} max={99} steps={[...STOPS]} label="Stop loss under the buy" pre="−" post="%" onChange={n => exits({ fixed: n })}/> : undefined}
        control={<Switch checked={Boolean(fixed)} aria-label="Stop loss" onCheckedChange={checked => { if (!checked) kept.current.fixed = fixed; exits({ fixed: checked ? kept.current.fixed : 0 }); }}/>}>
        <QuickPicks options={STOPS.map(n => ({ value: n as number, text: `−${n}%` }))} value={fixed} onPick={n => exits({ fixed: n })}/>
      </SettingRow>
      <SettingRow id="trail" {...toggle('easyTrail')} changed={changed('stopLossPct') || exitsChanged(trailPct)} label={<>Trailing stop<Help title="Trailing stop">
        <p>Sells everything once the price falls this far under its highest price since the buy. It rises with the price and never moves down.</p>
        <p>Off: no trailing stop. The take profit, the stop loss and TraderBot still sell.</p>
      </Help></>} value={trail ? <Val editing={open === 'easyTrail'} autoFocus value={trail} kind="pct" min={TRAIL.min} max={TRAIL.max} steps={[...TRAILS]} label="Trailing stop under the high" post="%" onChange={setTrail}/> : undefined}
        control={<Switch checked={Boolean(trail)} aria-label="Trailing stop" onCheckedChange={checked => { if (!checked) kept.current.trail = trail!; set({ stopLossPct: checked ? kept.current.trail : 0 }); }}/>}>
        <QuickPicks options={TRAILS.map(n => ({ value: n as number, text: `${n}%` }))} value={trail ?? 0} onPick={setTrail}/>
      </SettingRow>
    </div>

    <div className={s.setGroup}>
      <SettingRow id="budgetSol" {...toggle('easyBudget')} label="Budget" changed={changed('budgetSol')}
        value={<Val editing={open === 'easyBudget'} autoFocus value={total} kind="sol" min={0.01} steps={[...TOTALS]} label="Budget in SOL" post=" SOL" onChange={n => set(budgetPatch(n, coins))}/>}>
        <QuickPicks options={TOTALS.map(n => ({ value: n as number, text: `${n} SOL` }))} value={total} onPick={n => set(budgetPatch(n, coins))}/>
      </SettingRow>
      <SettingRow id="maxOpen" {...toggle('easyCoins')} label="Coins at once" changed={changed('maxOpen')}
        value={<Val editing={open === 'easyCoins'} autoFocus value={coins} kind="count" min={1} max={20} integer steps={[...COINS]} label="Coins at once" onChange={n => set(budgetPatch(total, n))}/>}>
        <QuickPicks options={COINS.map(n => ({ value: n as number, text: String(n) }))} value={coins} onPick={n => set(budgetPatch(total, n))}/>
      </SettingRow>
      {strategy.mode === 'live' && <LossStopRow draft={draft} {...toggle('easyLossStop')}/>}
      {strategy.mode === 'paper' && <PracticeStopRow draft={draft} twin={twin} {...toggle('easyPracticeStop')}/>}
      {askInRows && <SettingRow id="askFirst" label="Ask before each buy" changed={changed('askFirst')} control={<Switch variant="accent" checked={rules.mode === 'ask'} aria-label="Ask before each buy" onCheckedChange={checked => set({ askFirst: checked })}/>}/>}
    </div>
  </div>;
}

/** Ask before each buy as a switch beside the column's button. */
export function EasyAsk({ draft }: { draft: SettingsDraft }) {
  return <label className={s.easyAsk} {...useSpotAttrs('askFirst')}><span>Ask before each buy</span><Switch variant="accent" checked={draft.rules.mode === 'ask'} onCheckedChange={checked => draft.set({ askFirst: checked })}/></label>;
}

export type Suggestion = { key: string; title: string; change: string; gainSol: number; row: string; patch: (rules: TeamRules) => StrategyPatch };
/** Why HOTBOT has no idea for the draft: the Lab didn't answer (`inResult`: the result already says so), it is still replaying the last days,
 *  the draft picked too few coins to judge a change by, or no change it replayed clears `SUGGEST` (`skipped`: the person passed over or
 *  applied one that did). `days`: what the Lab's data covers, null until it is known. */
export type NoIdea = { days: number | null } & ({ kind: 'unavailable'; error: string; inResult: boolean } | { kind: 'looking' } | { kind: 'few'; picks: number } | { kind: 'none'; picks: number; steps: number; plans: number; skipped: boolean });
/** "the last 5 days", or "the last days" before the Lab says how many. */
export const lastDays = (days: number | null) => days ? `the last ${days} days` : 'the last days';
/** A replay's window as a label: "Last 5 days". */
export const lastDaysTitle = (days: number | null) => days ? `Last ${days} days` : 'Last days';

/** Why HOTBOT has no idea, with the bar a change must clear (`SUGGEST`). */
function NoIdeaNote({ why }: { why: NoIdea }) {
  if (why.kind === 'unavailable') return <p className={s.labNote}>{why.error}</p>;
  if (why.kind === 'looking') return <p className={s.labNote} role="status">Looking at {lastDays(why.days)}…</p>;
  const tried = why.kind === 'none' ? [why.steps ? `${why.steps} rule step${why.steps === 1 ? '' : 's'}` : '', why.plans ? `${why.plans} exit plan${why.plans === 1 ? '' : 's'}` : ''].filter(Boolean) : [];
  const title = why.kind === 'few' ? 'Needs more coins' : `${why.skipped ? 'No other change' : 'None'} made ${signedSol(SUGGEST.sol, 2)} more often enough`;
  const line = why.kind === 'few' ? `${why.picks} of ${SUGGEST.picks} picked in ${lastDays(why.days)}` : `${tried.length ? `Tried ${tried.join(' and ')} on` : 'Replayed'} ${why.picks} coins of ${lastDays(why.days)}`;
  return <div className={s.easyIdea}><span><b>{title}</b><small>{line}</small></span></div>;
}

/** HOTBOT's ideas as cards, best first (`advanced`: named from → to), or why it has none; nothing when the Lab failed, which the result
 *  above already says. Apply puts one in the draft; nothing saves until Save. */
export function Ideas({ ideas, why, advanced, onApply, onSkip }: { ideas: Suggestion[]; why: NoIdea; advanced: boolean; onApply: (idea: Suggestion) => void; onSkip: (idea: Suggestion) => void }) {
  const spotAttrs = useSpotAttrs('ideas');
  if (!ideas.length && why.kind === 'unavailable' && why.inResult) return null;
  return <div className={s.easyIdeas} {...spotAttrs}>
    {ideas.length ? ideas.map(idea => { const name = advanced ? idea.change : idea.title;
      return <div key={idea.key} className={s.easyIdea}>
        <span><b>{name}</b><small><em className={s.up}>{signedSol(idea.gainSol, 2)}</em></small></span>
        <button type="button" className={s.easyIdeaSkip} aria-label={`Dismiss ${name}`} onClick={() => onSkip(idea)}><X/></button>
        <Button size="xs" variant="ember" onClick={() => onApply(idea)}>Apply</Button>
      </div>; }) : <NoIdeaNote why={why}/>}
  </div>;
}

