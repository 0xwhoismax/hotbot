"use client";
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { BLANK, startRules, tradesAs } from '../../../../types/team';
import type { HomeData, StrategyRow } from './data';
import { appHref } from './format';
import { useTwoColumns } from './Parts';
import { SettingsEditor, useSettingsDraft, type DraftBase } from './Settings';
import { useCommand } from './state';
import s from './team.module.css';
import { useRouter } from '@/lib/appNavigation';
import { useStrategyLimit } from './Limits';

/** A new strategy before it exists: the start every new strategy gets (`startRules`), or a copy of `from`'s rules and entry, none of its money or coins. */
export const newStrategyRow = (from?: StrategyRow): DraftBase => ({ id: 'new' as StrategyRow['id'], name: from ? `${from.name} copy` : BLANK.name, status: 'paused', dipPct: from?.dipPct ?? 0, rules: from?.rules ?? startRules() });

/** Adding a strategy: the new start (or a copy, `?from=<id>`) in the settings editor, Easy or Advanced, with Start, on Real SOL too where it is open to the person. */
export function NewStrategy({ data }: { data: HomeData }) {
  const router = useRouter(), command = useCommand(), fromId = useSearchParams().get('from');
  const from = data.strategies.find(row => row.id === fromId && row.status !== 'archiving');
  const [starting, setStarting] = useState(false), [named, setNamed] = useState<string | null>(null), [real, setReal] = useState(false);
  const row = useMemo(() => newStrategyRow(from), [from?.id]), draft = useSettingsDraft(row); // eslint-disable-line react-hooks/exhaustive-deps
  const [pageRef, wide] = useTwoColumns(), pairLimit = useStrategyLimit(2);
  // A copy that trades exactly like a Practice strategy that runs or is paused would be refused: only money differs.
  const twin = draft && from ? data.strategies.find(other => other.mode === 'paper' && (other.status === 'running' || other.status === 'paused') && tradesAs(other) === tradesAs({ dipPct: draft.dip, rules: draft.rules })) : undefined;
  // The server builds the start at this budget and applies the draft's patch, so the strategy is exactly what the editor showed. The
  // per-coin size always goes: the draft leaves out a value equal to the start's, and the rebuild at a new budget would change it. A copy
  // applies the patch on its source's rules instead.
  const create = async () => {
    if (!draft) return;
    // Real SOL takes two slots, the practice strategy and its copy: refused before either exists, so no half pair is left running.
    if (real && pairLimit) { toast(pairLimit.title, { id: 'capacity', description: pairLimit.detail }); return; }
    const name = named ?? draft.strategy.name;
    setStarting(true);
    const id = await command(from ? { type: 'labStrategy', name, from: from.id, patch: draft.patch, run: true }
      : { type: 'createStrategy', name, budgetSol: draft.rules.allocationSol, askFirst: draft.rules.mode === 'ask', patch: { ...draft.patch, tradeSol: draft.rules.amountSol } });
    // Real SOL starts the practice strategy and its copy at once (`realSolCopy`); the practice one keeps running beside it.
    const copied = typeof id === 'string' && real && await command({ type: 'realSolCopy', strategyIds: [id] }) !== false;
    setStarting(false);
    if (typeof id === 'string') { toast.success(name + (copied ? ' is running on Real SOL' : ' is running')); router.push(copied ? appHref('strategies') : appHref('strategies', id)); }
  };
  const leave = () => router.push(from ? appHref('strategies', from.id) : appHref('strategies'));
  if (!draft) return null;
  return <div ref={pageRef} className={`${s.page} ${s.strategyPage} ${s.settingsPage}`} data-wide={wide || undefined}>
    {wide && <button type="button" className={s.back} onClick={leave}><ArrowLeft size={14}/>{from?.name ?? 'Strategies'}</button>}
    <SettingsEditor data={data} draft={draft} onClose={wide ? undefined : leave} start={{ label: starting ? 'Starting…' : real ? 'Start on Real SOL' : from ? 'Start copy' : 'Start strategy', busy: starting, onStart: () => void create(), name: named ?? draft.strategy.name, onRename: setNamed, real: { on: real, onChange: setReal },
      ...(twin ? { sameAs: twin.name } : {}) }}/>
  </div>;
}
