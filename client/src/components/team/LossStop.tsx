"use client";
import { useState, type ReactNode } from 'react';
import { ArchiveRestore, LoaderCircle, RotateCcw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LOSS_STOP_PCT, LOSS_STOP_PICKS, type TeamRules } from '../../../../types/hotbot';
import { budgetLeft, heldCost, stopAtSol, twinned } from '../../../../types/buyGate';
import { loosens, type Mode } from '../../../../types/team';
import type { HomeData, StrategyRow } from './data';
import { useCommand } from './state';
import { signedSol, sol, tone } from './format';
import { QuickPicks, SettingRow, Val } from './Parts';
import type { SettingsDraft } from './Settings';
import s from './team.module.css';

/** Where a Real SOL strategy's loss stop sits, as a loss: its SOL, or its first loss when its budget holds no more than one buy (types/buyGate `stopAtSol`). */
export const stopText = (rules: TeamRules) => { const stop = stopAtSol(rules); return stop > 1e-9 ? signedSol(-stop) : 'First loss'; };
/** A strategy's drawdown stop against what it lost below its best point: where the stop sits (`at`, SOL) and the room left above it, 0–1. Null for a
 *  Practice strategy with no stop, or whose Real SOL copy (`twin`) holds the comparison uncapped. */
export function stopRoom(row: Pick<StrategyRow, 'mode' | 'rules' | 'loss'>, twin: boolean) {
  const { rules } = row, live = row.mode === 'live';
  if (!live && (!rules.practiceStopPct || twin)) return null;
  const lost = row.loss?.lostSol ?? 0, at = live ? stopAtSol(rules) : rules.practiceStopPct! / 100 * rules.allocationSol;
  return { lost, at };
}
/** What the Real SOL budgets left (types/buyGate `budgetLeft`, `extraSol` more for copies about to be made) need beyond the wallet's SOL
 *  (`cashOutSol` less, for a withdrawal) and the cost of the coins it holds; 0 or less when they fit. */
export function realSolShort(data: HomeData, extraSol = 0, cashOutSol = 0) {
  const budgets = data.strategies.filter(row => row.mode === 'live').reduce((sum, row) => sum + budgetLeft({ mode: 'live', rules: row.rules, lostSol: row.loss?.lostSol ?? 0 }), extraSol);
  return budgets - (data.portfolios.live.cash - cashOutSol + heldCost(data.bags.filter(bag => bag.mode === 'live').map(bag => bag.entry?.sol ?? bag.amountSol)));
}

/** One fact of a Real SOL confirmation; `warn` where it needs the person. */
type Fact = { label: string; value: ReactNode; warn?: boolean };
/** A Real SOL change that waits for the person's own tap (types/team `loosens`): a re-arm, a raised limit. Its facts as rows, Cancel and
 *  the act. Opens from `trigger`, or from its caller (`open`). */
export function MoneyConfirm({ trigger, open, onOpenChange, icon, title, facts, act, onConfirm }: { trigger?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; icon: ReactNode;
  title: string; facts: Fact[]; act: string; onConfirm: () => Promise<unknown> }) {
  const [own, setOwn] = useState(false), [busy, setBusy] = useState(false), shown = open ?? own, show = onOpenChange ?? setOwn;
  async function confirm() {
    setBusy(true);
    if (await onConfirm() !== false) show(false);
    setBusy(false);
  }
  return <Dialog open={shown} onOpenChange={show}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}>{icon}</span><span className={s.grow}><DialogTitle asChild><b>{title}</b></DialogTitle></span></div>
        <dl className={s.walletBreakdown}>{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.warn ? s.warnText : undefined}>{fact.value}</dd></div>)}</dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button disabled={busy} onClick={() => void confirm()}>{busy ? <LoaderCircle className="animate-spin"/> : null}{act}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/** A Real SOL strategy its loss stop paused: Re-arm in its run button's place, after the loss and what comes back. */
export function RearmStrategy({ strategy }: { strategy: StrategyRow }) {
  const command = useCommand(), lost = strategy.loss?.lostSol ?? 0, budget = strategy.rules.allocationSol, live = strategy.mode === 'live';
  return <MoneyConfirm trigger={<button type="button" className={s.toggleButton} data-go><RotateCcw/>Re-arm</button>} icon={<RotateCcw size={18}/>} title={`Re-arm ${strategy.name}?`} act="Re-arm"
    facts={[{ label: 'Down', value: <span className={s.down}>{signedSol(-lost)}</span> }, { label: 'Limit', value: live ? stopText(strategy.rules) : signedSol(-(strategy.rules.practiceStopPct ?? 0) / 100 * budget) },
      ...(live ? [{ label: 'Budget back', value: `${sol(budget - lost)} → ${sol(budget)}` }] : []), { label: 'Then', value: strategy.loss?.stoppedFrom === 'running' ? 'Runs' : 'Stays paused' }]}
    onConfirm={() => command({ type: 'rearm', strategyId: strategy.id })}/>;
}

/** Saves a draft's changes to its strategy, in Settings and the Lab (`then` after a save that went through). A Real SOL change that loosens
 *  a limit (types/team `loosens`) opens its MoneyConfirm first, with the loss and the limits it moves; `confirm` is that dialog, to render
 *  beside the button. */
export function useStrategySave(draft: SettingsDraft, then?: () => void) {
  const command = useCommand(), [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false);
  const { strategy, patch, rules } = draft, was = strategy.rules, lost = strategy.loss?.lostSol ?? 0;
  const update = async () => { const done = await command({ type: 'update', strategyId: strategy.id, patch }); if (done !== false) then?.(); return done; };
  const loosening = loosens({ type: 'update', strategyId: strategy.id, patch }, { ...(strategy.mode === 'live' ? { live: true as const } : {}), rules: was });
  const save = async () => { if (loosening) { setConfirming(true); return; } setSaving(true); await update(); setSaving(false); };
  const limits: [string, string | number, string | number][] = [['Drawdown', stopText(was), stopText(rules)], ['Budget', sol(was.allocationSol), sol(rules.allocationSol)],
    ['Per coin', sol(was.amountSol), sol(rules.amountSol)], ['Coins at once', was.maxOpenPositions, rules.maxOpenPositions]];
  const confirm = confirming && <MoneyConfirm open onOpenChange={setConfirming} icon={<TrendingUp size={18}/>} title={`Raise ${strategy.name}’s limits?`} act="Save"
    facts={[{ label: 'Down', value: <span className={s[tone(-lost, 3) ?? 'muted']}>{signedSol(-lost)}</span> }, ...limits.filter(([, from, to]) => from !== to).map(([label, from, to]) => ({ label, value: `${from} → ${to}` }))]}
    onConfirm={update}/>;
  return { save, saving, confirm };
}

/** A strategy's Restore, or Keep while it sells out to its archive (`then` after one that went through). A Real SOL one opens its
 *  MoneyConfirm first, with its budget, its loss and a loss stop it still has; `confirm` is that dialog. */
export function useRestore(row: { id: string; name: string; status?: StrategyRow['status']; mode: Mode; budgetSol: number; loss: { lostSol: number; stoppedAt: number | null } | null }, then?: () => void) {
  const command = useCommand(), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), lost = row.loss?.lostSol ?? 0, keep = row.status === 'archiving';
  const send = async () => { const done = await command({ type: 'restore', strategyId: row.id }); if (done !== false) then?.(); return done; };
  const restore = async () => { if (row.mode === 'live') { setConfirming(true); return; } setBusy(true); await send(); setBusy(false); };
  const confirm = confirming && <MoneyConfirm open onOpenChange={setConfirming} icon={<ArchiveRestore size={18}/>} title={`${keep ? 'Keep' : 'Restore'} ${row.name} on Real SOL?`} act={keep ? 'Keep' : 'Restore'}
    facts={[{ label: 'Budget', value: sol(row.budgetSol) }, { label: 'Down', value: <span className={s[tone(-lost, 3) ?? 'muted']}>{signedSol(-lost)}</span> },
      ...(row.loss?.stoppedAt != null ? [{ label: 'Drawdown', value: 'Holds until re-arm', warn: true }] : []), { label: 'Then', value: 'Paused' }]}
    onConfirm={send}/>;
  return { restore, busy, confirm };
}

/** A Real SOL strategy's loss stop as a setting row, in Easy and in Advanced's Budget: the share of its budget it may lose, and that loss. */
export function LossStopRow({ draft, open, onToggle }: { draft: SettingsDraft; open: boolean; onToggle: () => void }) {
  const { rules, patch, set } = draft, pct = rules.lossStopPct ?? LOSS_STOP_PCT;
  return <SettingRow id="lossStopPct" open={open} onToggle={onToggle} label="Drawdown" sub={stopText(rules)} changed={'lossStopPct' in patch}
    value={<Val editing={open} autoFocus value={pct} kind="pct" min={1} max={100} steps={[...LOSS_STOP_PICKS]} label="Drawdown, share of the budget" post="%" onChange={n => set({ lossStopPct: n })}/>}>
    <QuickPicks options={LOSS_STOP_PICKS.map(pick => { const at = stopAtSol({ ...rules, lossStopPct: pick }); return { value: pick as number, text: at > 1e-9 ? `${pick}% · ${at.toFixed(2)}` : `${pick}% · First loss` }; })} value={pct} onPick={n => set({ lossStopPct: n })}/>
  </SettingRow>;
}

/** Whether a Real SOL copy runs beside the practice strategy: its Practice loss stop does not apply then. */
export const hasCopy = (data: HomeData, id: string) => twinned(id, data.strategies.filter(row => row.mode === 'live'));

/** A Practice strategy's loss stop as a setting row: off, or the share of its budget it may lose below its best point. `twin`: a Real SOL copy runs
 *  beside it, so it stays uncapped and the row shows off. */
export function PracticeStopRow({ draft, twin, open, onToggle }: { draft: SettingsDraft; twin: boolean; open: boolean; onToggle: () => void }) {
  const { rules, patch, set } = draft, pct = rules.practiceStopPct ?? 0, at = (pick: number) => pick / 100 * rules.allocationSol;
  if (twin) return <SettingRow id="practiceStopPct" label="Drawdown" value="Off" control={<span className={s.pill} title="Its Real SOL copy has the stop; this one stays uncapped for comparison">Twin</span>}/>;
  return <SettingRow id="practiceStopPct" open={open} onToggle={onToggle} label="Drawdown" sub={pct ? signedSol(-at(pct)) : undefined} changed={'practiceStopPct' in patch}
    value={<Val editing={open && pct > 0} autoFocus value={pct} zero="Off" kind="pct" min={1} max={100} steps={[...LOSS_STOP_PICKS]} label="Drawdown, share of the budget" post="%" onChange={n => set({ practiceStopPct: n })}/>}>
    <QuickPicks options={[{ value: 0, text: 'Off' }, ...LOSS_STOP_PICKS.map(pick => ({ value: pick as number, text: `${pick}% · ${at(pick).toFixed(2)}` }))]} value={pct} onPick={n => set({ practiceStopPct: n })}/>
  </SettingRow>;
}
