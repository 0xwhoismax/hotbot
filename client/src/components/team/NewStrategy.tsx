"use client";
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'convex/react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { BLANK, PRESETS, applyPatch, blankRules, draftPatch, presetRules, type Draft, type PresetId, type StrategyPatch } from '../../../../types/team';
import type { HomeData, StrategyRow } from './data';
import { appHref } from './format';
import { PlanStep, StageShell, STYLES } from './Onboarding';
import { useTwoColumns } from './Parts';
import { SettingsEditor, useSettingsDraft, type DraftBase } from './Settings';
import { failToast, useCommand } from './state';
import o from './onboarding.module.css';
import s from './team.module.css';

/** A blank start (`blankRules`: no optional rule, the trailing stop alone at 15%) as the patch `createStrategy` applies to its preset. */
const BLANK_PATCH: StrategyPatch = { minLiquidityUsd: 0, minVolume24hUsd: 0, minMarketCapUsd: 0, maxMarketCapUsd: 0, minAgeMinutes: 0, maxTop10Percent: 100, exits: blankRules().exits };
type Start = PresetId | 'blank';
/** The strategy a pick starts from, before it exists: the preset's rules at its own budget, or the blank start. */
function startRow(pick: Start): DraftBase {
  const id = 'new' as StrategyRow['id'];
  if (pick === 'blank') return { id, name: BLANK.name, status: 'paused', preset: BLANK.preset, dipPct: 0, rules: applyPatch(presetRules(BLANK.preset, 1, false), BLANK_PATCH) };
  const preset = PRESETS.find(row => row.id === pick)!;
  return { id, name: STYLES.find(row => row.id === pick)?.name ?? preset.name, status: 'paused', preset: pick, dipPct: preset.dipPct, rules: presetRules(pick, preset.budgetSol ?? 1, false) };
}

/** Adding a strategy: pick a preset (or start blank) and set it up in the settings editor, Easy or Advanced; or describe it and see the plan. */
export function NewStrategy({ data }: { data: HomeData }) {
  const router = useRouter(), draftPlan = useAction(api.team.draft), command = useCommand();
  const [style, setStyle] = useState<Start>('oracle'), [describing, setDescribing] = useState(false), [words, setWords] = useState(''), [editing, setEditing] = useState<Start | null>(null);
  const [plan, setPlan] = useState<Draft | null>(null), [budget, setBudget] = useState(1), [loading, setLoading] = useState(false), [starting, setStarting] = useState(false);
  const row = useMemo(() => editing ? startRow(editing) : undefined, [editing]), draft = useSettingsDraft(row);
  const [pageRef, wide] = useTwoColumns();
  const build = async (text: string) => {
    setLoading(true);
    try {
      const next = await draftPlan({ text });
      // Only an invite before sign-in is asked to sign in; this page is signed in, and an account past its allowance is refused instead.
      if ('signIn' in next) return;
      setPlan(next);
      setBudget(next.budgetSol);
    } catch (cause) { failToast(cause); } finally { setLoading(false); }
  };
  const created = (id: unknown, name: string) => { if (typeof id === 'string') { toast.success(name + ' is running'); router.push(appHref('strategies', id)); } };
  const createPlan = async () => {
    if (!plan) return;
    setStarting(true);
    const id = await command({ type: 'createStrategy', name: plan.name, description: plan.description, preset: plan.preset, budgetSol: budget, askFirst: plan.askFirst, patch: draftPatch(plan, budget) });
    setStarting(false);
    created(id, plan.name);
  };
  // The server builds the preset's rules at this budget and applies the draft's patch, so the strategy is exactly what the editor showed.
  const createDraft = async () => {
    if (!draft || !editing) return;
    setStarting(true);
    const id = await command({ type: 'createStrategy', name: draft.strategy.name, preset: editing === 'blank' ? BLANK.preset : editing, budgetSol: draft.rules.allocationSol, askFirst: draft.rules.mode === 'ask',
      patch: editing === 'blank' ? { ...BLANK_PATCH, ...draft.patch } : draft.patch });
    setStarting(false);
    created(id, draft.strategy.name);
  };

  if (draft) return <div ref={pageRef} className={`${s.page} ${s.strategyPage} ${s.settingsPage}`} data-wide={wide || undefined}>
    {wide && <button type="button" className={s.back} onClick={() => setEditing(null)}><ArrowLeft size={14}/>Presets</button>}
    <SettingsEditor data={data} draft={draft} onClose={() => setEditing(null)} start={{ label: starting ? 'Starting…' : 'Start strategy', busy: starting, onStart: () => void createDraft() }}/>
  </div>;
  return <StageShell>
    {plan ? <PlanStep plan={plan} onPlan={setPlan} budget={budget} setBudget={setBudget} starting={starting} signedIn onBack={() => setPlan(null)} onStart={createPlan} cta="Add this strategy"/>
      : <div className={o.step}>
        <button type="button" className={`${o.back} ${o.wideOnly}`} onClick={() => router.push(appHref('strategies'))}><ArrowLeft size={15}/>Strategies</button>
        <h1 className={o.title}>Start from a preset</h1>
        <p className={o.lead}>Your other {data.strategies.length === 1 ? 'strategy keeps' : 'strategies keep'} running.</p>
        <div className={o.options} role="radiogroup" aria-label="Preset">
          {STYLES.map(option => <button type="button" key={option.id} role="radio" aria-checked={!describing && style === option.id} data-style={option.id} className={o.option} onClick={() => { setStyle(option.id); setDescribing(false); }}>
            <span className={o.icon}><option.icon/></span>
            <span className={o.optionText}><strong>{option.name}</strong><span>{option.text}</span></span>
            <span className={o.radio}/>
          </button>)}
          <button type="button" role="radio" aria-checked={!describing && style === 'blank'} className={o.option} onClick={() => { setStyle('blank'); setDescribing(false); }}>
            <span className={o.icon}><SlidersHorizontal/></span>
            <span className={o.optionText}><strong>Custom</strong><span>Start blank and set every rule.</span></span>
            <span className={o.radio}/>
          </button>
        </div>
        {describing
          ? <textarea className={o.describe} autoFocus value={words} onChange={event => setWords(event.target.value)} placeholder="New memecoins under $5M market cap with rising volume and no dev bags. Ask me before buying." aria-label="Describe your strategy"/>
          : <button type="button" className={o.link} onClick={() => setDescribing(true)}>Or describe it in your own words</button>}
        {/* Phones leave by Cancel under the button, in thumb reach; wider screens by the link at the top. */}
        <div className={o.actions}>
          <Button size="lg" className={o.cta} disabled={loading || Boolean(describing && !words.trim())} onClick={() => describing ? void build(words.trim()) : setEditing(style)}>{describing ? loading ? 'Building the plan…' : 'See the plan' : 'Set it up'}</Button>
          <Button size="lg" variant="secondary" className={`${o.cta} ${o.phoneOnly}`} onClick={() => router.push(appHref('strategies'))}>Cancel</Button>
        </div>
      </div>}
  </StageShell>;
}
