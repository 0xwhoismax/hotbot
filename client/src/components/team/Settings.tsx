"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAction, useQuery } from 'convex/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Check, LoaderCircle, Settings as GearIcon, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { api } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { EASY_PLANS, easyPlanName, exitsWith, planOf } from '../../../../types/easy';
import { EXIT_PLANS, isTrail, namedExitPlan, trailPct, type ExitPlan, type ExitPlanId } from '../../../../types/exits';
import { ENTRY_ACTIVITY_DESCRIPTION } from '../../../../types/entryActivity';
import { guideOf } from '../../../../types/settingsGuide';
import { INACTIVITY_DEFAULT, inactivityOf, type InactivityRules } from '../../../../types/inactivity';
import { DEFAULT_RESEARCH_POLICY, POOL_SHARE, REBUY_CHOICES, REBUY_CONFIRMATIONS, SELL_MODEL, STREAMS, STREAM_NAMES, streamsOf, validateRules, type RebuyConfirmation, type RebuyRules, type Stream, type TeamRules } from '../../../../types/hotbot';
import { researchCriteria } from '../../../../types/hotbotResearch';
import { SHIELD_DEFAULTS, SHIELD_ROWS, holdingOn, shieldOf, type Holding, type ShieldHolding, type ShieldNumber, type ShieldRules, type ShieldSwitch } from '../../../../types/shield';
import { rebuyWords } from '../../../../types/rebuy';
import { BUDGETS, REPICK, applyPatch, mustHaves, poolShare, recheckMove, type Fits, type MustHave, type StrategyPatch } from '../../../../types/team';
import { ArchiveStrategyButton } from './ArchiveStrategy';
import type { HomeData, StrategyRow } from './data';
import { ExitGraph, ExitPlanRows, stable } from './ExitPlan';
import { CHECKS, CHECK_GROUPS, type CheckRow } from './checks';
import { signedSol } from './format';
import { useLab, useLabData } from './labData';
import { rulesOfCheck, type Result } from './labModel';
import { tipWorth, type Tip } from '../../../../types/lab';
import { CoinPill, QuickPicks, SettingRow, Shield, StrategyStatus, Val, numText, usePhone, useSettingSpot, useSpotAttrs } from './Parts';
import { checkCoinAtom, dockOpenAtom, draftBridgeAtom, draftProposalAtom, settingSpotAtom, settingsEditingAtom, settingsViewAtom, useCommand, viewAsAtom } from './state';
import { EasyAsk, EasyColumn, EasyDock, EasyEditor, EasyResult, type Suggestion } from './EasySettings';
import { useHome } from './useHome';
import s from './team.module.css';

const MUST_NAMES: Record<MustHave, string> = { liquidity: 'liquidity', volume: 'volume', marketCap: 'market cap', age: 'age', top10: 'top 10', maxAge: 'max age', lpBurn: 'burned liquidity' };
/** A new 1h move range starts at Clips' own: best 25–100%, barely acceptable at 500%. */
const MOVE_RANGE = { low: 25, high: 100 };
/** Re-buys switched on start here; every field is the person's to change (types/rebuy.ts). */
const REBUY_START: RebuyRules = { steadyCloses: 'weighted', confirmation: 'none', chasePct: 15, watchMinutes: 30, afterLoss: 'stop', maxPerCoin: 1 };
const CONFIRM_NAMES: Record<RebuyConfirmation, string> = { none: 'None', volume: 'Volume uptick', positiveVolume: 'Positive volume uptick', buysOvertake: 'Buys overtake sells', volumeAndBuys: 'Volume + buys' };
const passOf = (r: TeamRules) => (r.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;

/** A patch key's value on a strategy, in the shape the patch carries it. */
export function valueOf(r: TeamRules, dip: number, key: keyof StrategyPatch): unknown {
  switch (key) {
    case 'budgetSol': return r.allocationSol;
    case 'tradeSol': return r.amountSol;
    case 'maxOpen': return r.maxOpenPositions;
    case 'maxPoolSharePct': return poolShare(r);
    case 'askFirst': return r.mode === 'ask';
    case 'entryActivity': return r.entryActivity === true;
    case 'codeOnly': return Boolean(r.codeOnly);
    case 'dipPct': return dip;
    case 'exits': return stable(r.exits);
    case 'mustHave': return [...mustHaves(r)].sort().join();
    case 'streams': return streamsOf(r).join();
    case 'rebuy': return stable(r.rebuy ?? null);
    case 'inactivity': return stable(inactivityOf(r.inactivity));
    case 'recheckMovePct': return recheckMove(r);
    case 'passMark': return passOf(r);
    case 'shield': return stable(shieldOf(r));
    case 'stopLossPct': return trailPct(r.exits) ?? 0;
    default: return (r as Record<string, unknown>)[key] ?? 0;
  }
}
export const normal = (key: keyof StrategyPatch, value: unknown) => key === 'inactivity' ? stable(inactivityOf(value as InactivityRules | null | undefined)) : key === 'shield' ? stable({ ...SHIELD_DEFAULTS, ...(value as Partial<ShieldRules>) }) : key === 'exits' || key === 'rebuy' ? stable(value ?? null) : key === 'mustHave' ? [...value as MustHave[]].sort().join() : key === 'streams' ? (value as Stream[]).join()
  : key === 'recheckMovePct' ? value ?? REPICK.movePct : key === 'maxPoolSharePct' ? value ?? POOL_SHARE.pct : key === 'entryActivity' ? value === true : key === 'codeOnly' ? Boolean(value) : value ?? 0;
const sol = (n: number) => `${+n.toFixed(3)} SOL`;
const checkText = (row: CheckRow, n: number) => `${row.before}${numText(row.kind, n)}${row.after}`;

/** What a patch changes, in words: one line per changed setting. */
export function describeChanges(patch: StrategyPatch, r: TeamRules, next: TeamRules, dip: number): string[] {
  return (Object.keys(patch) as (keyof StrategyPatch)[]).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct').map(key => {
    const before = valueOf(r, dip, key) as number, after = patch[key];
    const row = CHECKS.find(check => check.key === key);
    if (row) return !before ? `Adds: ${checkText(row, after as number).trim()}` : !after ? `Removes ${row.name.toLowerCase()}` : `${row.name}: ${numText(row.kind, before)} → ${numText(row.kind, after as number)}`;
    switch (key) {
      case 'budgetSol': return `Budget: ${sol(before)} → ${sol(after as number)}`;
      case 'tradeSol': return `Per coin: ${sol(before)} → ${sol(after as number)}`;
      case 'maxOpen': return `Coins at once: ${before} → ${after}`;
      case 'maxPoolSharePct': return `Pool share per buy: ${before}% → ${after}%`;
      case 'askFirst': return after ? 'Asks you before each buy' : 'Buys on its own';
      case 'codeOnly': return after ? 'Code alone buys and sells, no AI reviews' : 'TraderBot’s AI reviews can sell again';
      case 'dipPct': return `Entry: ${before ? `${before}% dip` : 'right away'} → ${after ? `${after}% dip` : 'right away'}`;
      case 'entryActivity': return after ? 'Waits for active trading before buying' : 'Active-trading entry check off';
      case 'entryDelayMinutes': return after ? `Watches it ${after} min before buying` : 'Buys right after the pick';
      case 'entryMaxUpPct': return after ? `Lets a coin go once up ${after}%` : 'Buys however far a coin ran';
      case 'mustHave': return `Must pass: ${(after as MustHave[]).map(rule => MUST_NAMES[rule]).join(', ') || 'none'}`;
      case 'streams': return (after as Stream[]).length === STREAMS.length ? 'Finds bonding and graduated coins' : `Finds ${(after as Stream[]).map(stream => STREAM_NAMES[stream].toLowerCase()).join(' and ')} coins only`;
      case 'rebuy': return !after ? 'No re-buys' : r.rebuy ? 'Re-buy settings' : 'Re-buys on';
      case 'sellModelPct': return after ? `Sells the rest once the sell-or-keep model is ${after}% sure` : 'Sell-or-keep model off';
      case 'inactivity': return after === null ? 'Inactivity exit off' : `Sells after ${(after as InactivityRules).minutes} min with price, trades and volume quiet`;
      case 'recheckMovePct': return after === 0 ? 'Never re-checks a turned-down coin' : `Re-checks a turned-down coin after a ${after ?? REPICK.movePct}% move`;
      case 'passMark': return `Soft rules pass at ${after} points`;
      case 'shield': return shieldChanges(shieldOf(r), shieldOf(next)).join('; ') || 'ShieldBot unchanged';
      case 'exitPlan': return `Exit plan: ${EXIT_PLANS[after as keyof typeof EXIT_PLANS]?.exits.name ?? after}`;
      case 'stopLossPct': return `Trailing stop: ${trailPct(r.exits) ? `${trailPct(r.exits)}%` : 'off'} → ${after ? `${after}%` : 'off'}`;
      case 'exits': {
        const named = namedExitPlan(next.exits), rest = (plan: ExitPlan) => stable({ ...plan, stopLosses: plan.stopLosses.filter(stop => !isTrail(stop)) });
        const trail = (plan: ExitPlan) => trailPct(plan) ? `${trailPct(plan)}%` : 'off';
        if (rest(r.exits) === rest(next.exits)) return `Trailing stop: ${trail(r.exits)} → ${trail(next.exits)}`;
        return named ? `Exit plan: ${EXIT_PLANS[named].exits.name}` : 'Exit plan edited';
      }
      default: return 'Edited';
    }
  });
}

/** What changed in ShieldBot's rules, one phrase per rule. */
function shieldChanges(before: ShieldRules, after: ShieldRules): string[] {
  return (Object.keys(SHIELD_ROWS) as (keyof ShieldRules)[]).filter(key => stable(before[key]) !== stable(after[key])).map(key => {
    const row = SHIELD_ROWS[key], value = after[key];
    if (row.kind === 'switch') return `${row.name} ${value ? 'on' : 'off'}`;
    if (row.kind === 'number') return value ? `${row.name}: ${numText(row.unit, value as number)}${row.unit === 'pct' ? '%' : row.unit === 'x' ? '×' : ''}` : `${row.name} off`;
    const h = value as Holding;
    return holdingOn(h) ? `${row.name}: ${[h.weighAbove ? `weighed over ${h.weighAbove}%` : '', h.refuseAt ? `refused at ${h.refuseAt}%` : ''].filter(Boolean).join(', ')}` : `${row.name} off`;
  });
}

type FitState = { fits: Fits | null; loading: boolean; retry: () => void };
const fitCache = new Map<string, { at: number; fits: Fits }>();
/** The research numbers a fit count reads: the server asks one live Mobula Pulse view for coins that pass them (no Convex reads). */
const fitRules = (r: TeamRules) => ({ minLiquidityUsd: r.minLiquidityUsd, minVolume24hUsd: r.minVolume24hUsd, maxTop10Percent: r.maxTop10Percent, minMarketCapUsd: r.minMarketCapUsd, maxMarketCapUsd: r.maxMarketCapUsd, minAgeMinutes: r.minAgeMinutes,
  maxAgeMinutes: r.maxAgeMinutes, minMove1hPct: r.minMove1hPct, maxMove1hPct: r.maxMove1hPct, minBuyers1h: r.minBuyers1h, minEntryScore: r.minEntryScore, minTurnover1h: r.minTurnover1h, maxTurnover1h: r.maxTurnover1h, shield: r.shield });
/** Coins that fit the research rules right now: asked once when Settings opens and again 800ms after the rules stop changing. A count is kept a
 *  minute per rule set, so flipping tabs doesn't ask again; one for rules already edited away is dropped; a failed one waits for Try again. */
function useFits(rules: TeamRules): FitState {
  const run = useAction(api.team.fits), key = stable(fitRules(rules));
  const [state, setState] = useState<{ fits: Fits | null; loading: boolean }>(() => ({ fits: fitCache.get(key)?.fits ?? null, loading: !fitCache.has(key) })), [attempt, setAttempt] = useState(0);
  const first = state.fits === null;
  useEffect(() => {
    const cached = fitCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) { setState({ fits: cached.fits, loading: false }); return; }
    let live = true;
    setState(previous => ({ ...previous, loading: true }));
    const timer = setTimeout(() => {
      run({ rules: key }).then(fits => { if (fits) fitCache.set(key, { at: Date.now(), fits }); if (live) setState({ fits, loading: false }); })
        .catch(() => { if (live) setState({ fits: null, loading: false }); });
    }, first ? 0 : 800);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new rule set (or Try again) starts a count; the first one goes at once.
  }, [key, run, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}

/** A strategy's unsaved settings: they live as long as its page, so closing Settings and opening it again keeps them. Only what differs from the
 *  saved strategy stays in the patch, so typing a number back leaves nothing to save; saved changes arrive as new rules and the edits start over. */
export type SettingsDraft = NonNullable<ReturnType<typeof useSettingsDraft>>;
/** What a draft edits: a strategy, or one not made yet (a new strategy's preset, before Start). */
export type DraftBase = Pick<StrategyRow, 'id' | 'name' | 'status' | 'preset' | 'rules' | 'dipPct'>;
export function useSettingsDraft(strategy: DraftBase | undefined) {
  const signature = strategy ? stable([strategy.rules, strategy.dipPct]) : '';
  const [edits, setEdits] = useState<StrategyPatch>({}), [seen, setSeen] = useState(signature);
  if (seen !== signature) { setSeen(signature); setEdits({}); }
  if (!strategy) return null;
  const initial = strategy.rules, dip0 = strategy.dipPct;
  const patch = Object.fromEntries(Object.entries(edits).filter(([key, value]) => normal(key as keyof StrategyPatch, value) !== valueOf(initial, dip0, key as keyof StrategyPatch))) as StrategyPatch;
  // The page shows the rules exactly as the server will store them, and refuses to save what the server would refuse.
  let rules = initial, error: string | null = null;
  try { rules = applyPatch(initial, patch); validateRules(rules); } catch (cause) { error = cause instanceof Error ? cause.message : 'These rules can’t be saved.'; }
  const dirty = Object.keys(patch).length > 0;
  return {
    strategy, patch, rules, error, dirty, dip: patch.dipPct ?? dip0,
    set: (change: StrategyPatch) => setEdits(previous => ({ ...previous, ...change })),
    drop: (keys: (keyof StrategyPatch)[]) => setEdits(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !keys.includes(key as keyof StrategyPatch)))),
    reset: () => setEdits({}),
  };
}

/** The strategy page's Settings button: the page swaps its body for the editor below its back link. It says when the draft holds unsaved
 *  changes; `round` is the phone header's gear. */
export function SettingsButton({ draft, onOpen, round }: { draft: SettingsDraft; onOpen: () => void; round?: boolean }) {
  return round ? <button type="button" className={s.headRound} data-active={draft.dirty || undefined} aria-label={draft.dirty ? 'Settings, unsaved changes' : 'Settings'} onClick={onOpen}><GearIcon/></button>
    : <Button size="sm" variant="outline" onClick={onOpen}><SlidersHorizontal/>Settings{draft.dirty && <span className={s.unsavedDot} aria-label="unsaved changes"/>}</Button>;
}

export type Tab = 'search' | 'shield' | 'sniper' | 'trader' | 'budget';
export const TAB_KEYS: Record<Tab, (key: string) => boolean> = {
  search: key => CHECKS.some(row => row.key === key && row.group !== 'shield') || ['streams', 'mustHave', 'recheckMovePct', 'passMark', 'sweetMove1hLowPct', 'sweetMove1hHighPct'].includes(key),
  shield: key => CHECKS.some(row => row.key === key && row.group === 'shield') || ['shield', 'maxDevPercent', 'maxBundlersPercent', 'maxSnipersPercent'].includes(key),
  sniper: key => ['dipPct', 'askFirst', 'entryActivity', 'entryDelayMinutes', 'entryMaxUpPct', 'rebuy'].includes(key),
  trader: key => key === 'exits' || key === 'inactivity' || key === 'sellModelPct' || key === 'codeOnly',
  budget: key => ['budgetSol', 'tradeSol', 'maxOpen', 'maxPoolSharePct'].includes(key),
};
export const UNREPLAYED = new Set(['askFirst', 'rebuy', 'inactivity', 'sellModelPct', 'streams', 'codeOnly', 'name']);
const pre = (row: CheckRow) => row.kind === 'usd' ? '$' : '';
const post = (row: CheckRow) => row.kind === 'pct' ? '%' : row.kind === 'x' ? '×' : '';
export const looserIsLower = (key: string) => !key.startsWith('max') && key !== 'launchJumpLimit' && key !== 'hourCrashLimit';

/** The checks a rule set has on: every check without an off state, and the removable ones set above zero. */
export function checksOn(rules: TeamRules) {
  return CHECKS.filter(row => (row.start === undefined || ((rules[row.key] as number | undefined) ?? 0) > 0));
}
export function useSettingsSections({ data, draft, open, setOpen, evidence, labLoaded, planDelta, suggestOf }: { data: HomeData; draft: SettingsDraft; open: string | null; setOpen: (key: string | null) => void;
  evidence: (row: CheckRow) => { n: number; doubled: number } | null; labLoaded: boolean; planDelta?: (id: string) => number | undefined; suggestOf?: (row: CheckRow) => ReactNode }) {
  const command = useCommand(), phone = usePhone(), home = useHome();
  // One small read while the rows show: the person's own exit plans.
  const savedPlans = useQuery(api.team.exitPlans, useAtomValue(viewAsAtom));
  const { strategy, patch, rules, dip, set } = draft, initial = strategy.rules;
  useEffect(() => {
    if (open === null) return;
    const away = (event: PointerEvent) => { if (!(event.target as Element).closest?.('[data-open], [data-radix-popper-content-wrapper], [role=dialog]')) setOpen(null); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, setOpen]);
  const toggle = (key: string) => ({ open: open === key, onToggle: () => setOpen(open === key ? null : key) });
  const changed = (...keys: (keyof StrategyPatch)[]) => keys.some(key => key in patch);
  const value = (row: CheckRow) => (rules[row.key] as number | undefined) ?? 0;
  const on = CHECKS.filter(row => row.group !== 'shield' && (row.start === undefined || value(row) > 0)), off = CHECKS.filter(row => row.group !== 'shield' && row.start !== undefined && !value(row));

  // ---- Search ----
  const must = mustHaves(rules), picked = streamsOf(rules), modes = researchCriteria(rules, { missing: [] }, 'probe');
  const modeOf = (row: CheckRow) => modes.find(check => rulesOfCheck(check.key).includes(row.key))?.mode;
  const toggleMust = (rule: MustHave) => set({ mustHave: must.includes(rule) ? must.filter(item => item !== rule) : [...must, rule] });
  const toggleStream = (stream: Stream) => picked.includes(stream) ? picked.length > 1 && set({ streams: picked.filter(row => row !== stream) }) : set({ streams: STREAMS.filter(row => row === stream || picked.includes(row)) });
  const addCheck = (row: CheckRow) => { set(row.key === 'maxMove1hPct' ? { maxMove1hPct: row.start, sweetMove1hLowPct: MOVE_RANGE.low, sweetMove1hHighPct: MOVE_RANGE.high } : { [row.key]: row.start }); setOpen(row.key); };
  // A removed must-have stops being one: burned liquidity as a must-have would otherwise bring its 50% floor straight back.
  const removeCheck = (row: CheckRow) => { setOpen(null); set({ ...(row.key === 'maxMove1hPct' ? { maxMove1hPct: 0, sweetMove1hLowPct: 0, sweetMove1hHighPct: 0 } : { [row.key]: 0 }), ...(row.must && must.includes(row.must) && !CHECKS.some(other => other !== row && other.must === row.must && value(other) > 0) ? { mustHave: must.filter(rule => rule !== row.must) } : {}) }); };
  const mustIcon = (row: CheckRow) => row.must ? <Shield on={must.includes(row.must)} label={row.name} onToggle={() => toggleMust(row.must!)}/> : modeOf(row) === 'hard' ? <Shield on fixed label={row.name}/> : <span className={s.shieldGap}/>;
  const checkRow = (row: CheckRow) => {
    const o = open === row.key, ev = evidence(row), sub = ev ? `Turned down ${ev.n.toLocaleString('en-US')}${ev.doubled ? ` · ${ev.doubled} went 2×` : ''}` : labLoaded && !row.noReplay ? 'Turned down none' : checkText(row, value(row)).trim();
    const remove = row.start !== undefined ? () => removeCheck(row) : undefined;
    if (row.key === 'maxMove1hPct' && rules.sweetMove1hLowPct !== undefined) {
      const low = rules.sweetMove1hLowPct, high = rules.sweetMove1hHighPct ?? low, limit = value(row);
      return <SettingRow key={row.key} id={row.key} {...toggle(row.key)} label="1h move" sub={sub} shield={mustIcon(row)} suggest={suggestOf?.(row)} onRemove={remove} changed={changed('maxMove1hPct', 'sweetMove1hLowPct', 'sweetMove1hHighPct')}
        value={<>best <Val editing={o} autoFocus value={low} kind="pct" label="Sweet spot from" post="%" onChange={n => set({ sweetMove1hLowPct: n, ...(n > high ? { sweetMove1hHighPct: n } : {}) })}/>–<Val editing={o} value={high} kind="pct" label="Sweet spot to" post="%" onChange={n => set({ sweetMove1hHighPct: Math.max(n, low), ...(n > limit ? { maxMove1hPct: n } : {}) })}/> · at most <Val editing={o} value={limit} kind="pct" label="Move it barely accepts" post="%" onChange={n => set({ maxMove1hPct: Math.max(n, high) })}/></>}/>;
    }
    return <SettingRow key={row.key} id={row.key} {...toggle(row.key)} label={row.name} sub={sub} shield={mustIcon(row)} suggest={suggestOf?.(row)} onRemove={remove} changed={changed(row.key)}
      value={<Val editing={o} autoFocus value={value(row)} kind={row.kind} min={row.min} max={row.max} steps={row.steps} integer={row.integer} label={row.name} pre={pre(row)} post={post(row)} onChange={n => set({ [row.key]: n })}/>}>
      <QuickPicks options={row.steps.map(step => ({ value: step, text: `${pre(row)}${numText(row.kind, step)}${post(row)}` }))} value={value(row)} onPick={n => set({ [row.key]: n })}/>
    </SettingRow>;
  };
  const search = <>
    <div className={s.setGroup}>
      <SettingRow id="streams" {...toggle('streams')} label="Streams" sub="Coins still on a launchpad curve, graduated coins, or both" changed={changed('streams')} value={<span className={s.valText}>{picked.length === STREAMS.length ? 'Both' : STREAM_NAMES[picked[0]]}</span>}>
        <span className={s.seg} role="group" aria-label="Streams it finds coins in">{STREAMS.map(stream => <button type="button" key={stream} aria-pressed={picked.includes(stream)} disabled={picked.includes(stream) && picked.length === 1} onClick={() => toggleStream(stream)}>{STREAM_NAMES[stream]}</button>)}</span>
      </SettingRow>
    </div>
    <div className={s.setGroup}>
      {on.map(checkRow)}
      {off.length > 0 && <SettingRow id="addRule" {...toggle('add')} add label="Add a rule">
        <div className={s.planList} role="listbox" aria-label="Rules to add">
          {CHECK_GROUPS.map(group => { const rows = off.filter(row => row.group === group.id); return rows.length ? <div key={group.id} role="group" aria-label={group.title}><small>{group.title}</small>
            {rows.map(row => <button type="button" key={row.key} role="option" aria-selected={false} onClick={() => addCheck(row)}><b>{row.name}</b><span>{row.key === 'maxMove1hPct' ? `Best up ${MOVE_RANGE.low}–${MOVE_RANGE.high}% in the hour, at most ${row.start}%` : checkText(row, row.start!).trim()}</span></button>)}
          </div> : null; })}
        </div>
      </SettingRow>}
    </div>
    <div className={s.setGroup}>
      <SettingRow id="recheckMovePct" {...toggle('recheck')} label="Re-check turned-down coins" sub="Looks again once the price moves this far from the verdict and the coin fits again" changed={changed('recheckMovePct')}
        value={<Val editing={open === 'recheck'} autoFocus value={recheckMove(rules)} kind="pct" zero="Off" min={0} max={500} integer steps={[0, 25, 50, 100, 200]} label="Move that re-checks a turned-down coin" post="% move" onChange={n => set({ recheckMovePct: n })}/>}>
        <QuickPicks options={[0, 25, 50, 100].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={recheckMove(rules)} onPick={n => set({ recheckMovePct: n })}/>
      </SettingRow>
      <SettingRow id="passMark" {...toggle('pass')} label="Soft rules pass at" sub="Rules without a shield add up to a score; 100 meets them all" changed={changed('passMark')}
        value={<Val editing={open === 'pass'} autoFocus value={passOf(rules)} kind="count" min={50} max={125} integer steps={[80, 90, 100, 110, 125]} label="Points a coin needs" post=" points" onChange={n => set({ passMark: n })}/>}>
        <QuickPicks options={[80, 90, 100, 110].map(n => ({ value: n, text: String(n) }))} value={passOf(rules)} onPick={n => set({ passMark: n })}/>
      </SettingRow>
    </div>
  </>;

  // ---- Shield ----
  // ShieldBot's rules (types/shield.ts): every one starts on; the strategy stores only what it changed. The scam signs with no threshold stay on.
  const sh = shieldOf(rules), before = shieldOf(initial), setShield = (change: Partial<ShieldRules>) => set({ shield: { ...sh, ...change } });
  const shieldChanged = (key: keyof ShieldRules) => 'shield' in patch && stable(sh[key]) !== stable(before[key]);
  const switchRow = (key: ShieldSwitch) => { const row = SHIELD_ROWS[key];
    return <SettingRow key={key} id={'shield.' + key} label={row.name} sub={sh[key] ? row.on : row.off} changed={shieldChanged(key)} control={<Switch checked={sh[key]} aria-label={row.name} onCheckedChange={checked => setShield({ [key]: checked })}/>}/>; };
  const numberRow = (key: ShieldNumber) => {
    const row = SHIELD_ROWS[key], n = sh[key], post = row.unit === 'pct' ? '%' : row.unit === 'x' ? '×' : '', id = 'shield:' + key, steps = [0, ...row.steps];
    return <SettingRow key={key} id={id.replace(':', '.')} {...toggle(id)} label={row.name} sub={n ? `${row.before}${numText(row.unit, n)}${row.after}` : undefined} changed={shieldChanged(key)}
      value={<Val editing={open === id} autoFocus value={n} kind={row.unit} zero="Off" min={0} max={row.max} integer={row.integer} steps={steps} label={row.name} post={post} onChange={v => setShield({ [key]: v })}/>}>
      <QuickPicks options={steps.map(v => ({ value: v, text: v ? `${numText(row.unit, v)}${post}` : 'Off' }))} value={n} onPick={v => setShield({ [key]: v })}/>
    </SettingRow>;
  };
  const holdingRow = (key: ShieldHolding) => {
    const row = SHIELD_ROWS[key], h = sh[key], id = 'shield:' + key, setHolding = (change: Partial<Holding>) => setShield({ [key]: { ...h, ...change } });
    const sub = holdingOn(h) ? [h.weighAbove ? `Counts against a coin over ${h.weighAbove}%` : '', h.refuseAt ? `skips it at ${h.refuseAt}%` : ''].filter(Boolean).join(', ') + ` of supply held by ${row.who}` : `Off: what ${row.who} hold isn't checked`;
    return <SettingRow key={key} id={id.replace(':', '.')} {...toggle(id)} label={row.name} sub={sub} changed={shieldChanged(key)}
      value={<>over <Val editing={open === id} autoFocus value={h.weighAbove} kind="pct" zero="off" min={0} max={100} label={`${row.name}: counts against over`} post="%" onChange={n => setHolding({ weighAbove: n })}/> · skip <Val editing={open === id} value={h.refuseAt} kind="pct" zero="off" min={0} max={100} label={`${row.name}: skips at`} post="%" onChange={n => setHolding({ refuseAt: n })}/></>}>
      <QuickPicks label="Counts against it over" options={[0, 10, 25, 40].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={h.weighAbove} onPick={n => setHolding({ weighAbove: n })}/>
      <QuickPicks label="Skips it at" options={[0, 30, 50, 60].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={h.refuseAt} onPick={n => setHolding({ refuseAt: n })}/>
    </SettingRow>;
  };
  // ShieldBot's checks that were research checks keep their own fields, on with a value or off at 0.
  const offRow = (key: CheckRow['key']) => { const row = CHECKS.find(check => check.key === key)!, steps = [0, ...row.steps];
    return <SettingRow key={key} id={key} {...toggle(key)} label={row.name} sub={value(row) ? checkText(row, value(row)).trim() : row.off} shield={row.must ? mustIcon(row) : undefined} changed={changed(key)} suggest={suggestOf?.(row)}
      value={<Val editing={open === key} autoFocus value={value(row)} kind={row.kind} zero="Off" min={0} max={row.max} integer={row.integer} steps={steps} label={row.name} pre={pre(row)} post={post(row)} onChange={n => set({ [key]: n })}/>}>
      <QuickPicks options={steps.map(n => ({ value: n, text: n ? `${pre(row)}${numText(row.kind, n)}${post(row)}` : 'Off' }))} value={value(row)} onPick={n => set({ [key]: n })}/>
    </SettingRow>; };
  const locked = (id: string, label: string, sub: string) => <SettingRow key={label} id={id} label={label} sub={sub} shield={<Shield on fixed label={label}/>}/>;
  const shield = <>
    <div className={s.setGroup}>
      {numberRow('proHolders')}
      {switchRow('washTrading')}
    </div>
    <div className={s.setGroup}>
      {numberRow('launchJump')}
      {switchRow('layered')}
      {switchRow('mayhem')}
      {switchRow('transferFee')}
      {switchRow('smoothClimb')}
      {offRow('hourCrashLimit')}
      {numberRow('selfMadeDays')}
    </div>
    <div className={s.setGroup}>
      {numberRow('top10')}
      {numberRow('bundlersBought')}
      {holdingRow('dev')}
      {holdingRow('bundlers')}
      {holdingRow('snipers')}
      {offRow('minLpBurnPct')}
    </div>
    <div className={s.setGroup}>
      {numberRow('crew')}
    </div>
    <div className={s.setGroup}>
      {locked('creatorControls', 'Creator controls', 'Mint and freeze revoked before research')}
      {locked('knownRugger', 'Known rugger', 'Skips coins from a deployer who pulled a pool before')}
      {locked('meteoraLaunch', 'Meteora launch', 'Skips coins launched on Meteora’s curve')}
      {locked('drainedPool', 'Drained pool', 'Sells a held coin whose pool is drained, and lists its deployer')}
    </div>
  </>;

  // ---- Sniper ----
  const rebuy = rules.rebuy, setRebuy = (change: Partial<RebuyRules>) => set({ rebuy: { ...rebuy!, ...change } });
  const sniper = <>
    <div className={s.setGroup}>
      <SettingRow id="dipPct" {...toggle('dip')} label="Buys" sub="SniperBot buys once research passes a coin, or waits for a dip under the pick" changed={changed('dipPct')}
        value={<Val editing={open === 'dip'} autoFocus value={dip} kind="pct" zero="Right away" min={0} max={50} steps={[0, 2, 5, 10, 15]} label="Dip under the pick" pre="−" post="% dip" onChange={n => set({ dipPct: n })}/>}>
        <QuickPicks options={[0, 2, 5, 10].map(n => ({ value: n, text: n ? `${n}% dip` : 'Right away' }))} value={dip} onPick={n => set({ dipPct: n })}/>
      </SettingRow>
      <SettingRow id="entryActivity" label="Active trading" sub={ENTRY_ACTIVITY_DESCRIPTION} changed={changed('entryActivity')} control={<Switch checked={rules.entryActivity === true} aria-label="Active trading" onCheckedChange={checked => set({ entryActivity: checked })}/>}/>
      <SettingRow id="entryDelayMinutes" {...toggle('delay')} label="Watch before buying" sub="Buys at market after this long if the recheck still passes" changed={changed('entryDelayMinutes')}
        value={<Val editing={open === 'delay'} autoFocus value={rules.entryDelayMinutes ?? 0} kind="min" zero="Off" min={0} max={60} integer steps={[0, 2, 5, 10, 15, 30]} label="Minutes to watch before buying" onChange={n => set({ entryDelayMinutes: n })}/>}>
        <QuickPicks options={[0, 2, 5, 10, 15].map(n => ({ value: n, text: n ? `${n} min` : 'Off' }))} value={rules.entryDelayMinutes ?? 0} onPick={n => set({ entryDelayMinutes: n })}/>
      </SettingRow>
      <SettingRow id="entryMaxUpPct" {...toggle('ranUp')} label="Skip if it ran up" sub="Lets a coin go if it ran this far past the research price" changed={changed('entryMaxUpPct')}
        value={<Val editing={open === 'ranUp'} autoFocus value={rules.entryMaxUpPct ?? 0} kind="pct" zero="Off" min={0} max={10_000} steps={[0, 20, 35, 50, 100]} label="Run-up since the pick" post="%" onChange={n => set({ entryMaxUpPct: n })}/>}>
        <QuickPicks options={[0, 20, 35, 50, 100].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={rules.entryMaxUpPct ?? 0} onPick={n => set({ entryMaxUpPct: n })}/>
      </SettingRow>
      <SettingRow id="askFirst" label="Ask me before each buy" changed={changed('askFirst')} control={<Switch variant="accent" checked={rules.mode === 'ask'} aria-label="Ask me before each buy" onCheckedChange={checked => set({ askFirst: checked })}/>}/>
    </div>
    <div className={s.setGroup}>
      <SettingRow id="rebuy" label="Re-buys" sub={rebuy ? rebuyWords(rebuy) : 'Off: a coin this strategy traded never comes back to it'} changed={changed('rebuy')} control={<Switch checked={Boolean(rebuy)} aria-label="Re-buys" onCheckedChange={checked => set({ rebuy: checked ? REBUY_START : null })}/>}/>
      {rebuy && <>
        <SettingRow id="rebuy.steadyCloses" {...toggle('steady')} label="Steady closes" sub="Each 1-minute close at least 99% of the one before" value={<span className={s.valText}>{rebuy.steadyCloses === 'weighted' ? '2 if confirmed, else 3' : rebuy.steadyCloses}</span>}>
          <QuickPicks<RebuyRules['steadyCloses']> options={[{ value: 2, text: '2' }, { value: 3, text: '3' }, { value: 'weighted', text: '2 if confirmed, else 3' }]} value={rebuy.steadyCloses} onPick={v => setRebuy({ steadyCloses: v })}/>
        </SettingRow>
        <SettingRow id="rebuy.confirmation" {...toggle('confirm')} label="Confirmation" sub="What must hold on top of the steady closes" value={<span className={s.valText}>{CONFIRM_NAMES[rebuy.confirmation]}</span>}>
          <QuickPicks<RebuyConfirmation> options={REBUY_CONFIRMATIONS.map(v => ({ value: v, text: CONFIRM_NAMES[v] }))} value={rebuy.confirmation} onPick={v => setRebuy({ confirmation: v })}/>
        </SettingRow>
        <SettingRow id="rebuy.chasePct" {...toggle('chase')} label="Don’t chase" sub="Re-buys only within this much of the low since the sale"
          value={<Val editing={open === 'chase'} autoFocus value={rebuy.chasePct} kind="pct" zero="Off" min={0} max={100} steps={[...REBUY_CHOICES.chasePct]} label="Within this much of the low" post="%" onChange={n => setRebuy({ chasePct: n })}/>}>
          <QuickPicks options={REBUY_CHOICES.chasePct.map(n => ({ value: n as number, text: n ? `${n}%` : 'Off' }))} value={rebuy.chasePct} onPick={n => setRebuy({ chasePct: n })}/>
        </SettingRow>
        <SettingRow id="rebuy.watchMinutes" {...toggle('watch')} label="Watch after each sale"
          value={<Val editing={open === 'watch'} autoFocus value={rebuy.watchMinutes} kind="min" min={1} max={240} integer steps={[...REBUY_CHOICES.watchMinutes]} label="Minutes to watch after a sale" onChange={n => setRebuy({ watchMinutes: n })}/>}>
          <QuickPicks options={REBUY_CHOICES.watchMinutes.map(n => ({ value: n as number, text: `${n} min` }))} value={rebuy.watchMinutes} onPick={n => setRebuy({ watchMinutes: n })}/>
        </SettingRow>
        <SettingRow id="rebuy.afterLoss" {...toggle('afterLoss')} label="After a losing re-buy" value={<span className={s.valText}>{rebuy.afterLoss === 'stop' ? 'Stop' : 'Keep watching'}</span>}>
          <QuickPicks<RebuyRules['afterLoss']> options={[{ value: 'stop', text: 'Stop' }, { value: 'keep', text: 'Keep watching' }]} value={rebuy.afterLoss} onPick={v => setRebuy({ afterLoss: v })}/>
        </SettingRow>
        <SettingRow id="rebuy.maxPerCoin" {...toggle('perCoin')} label="Max re-buys per coin"
          value={<Val editing={open === 'perCoin'} autoFocus value={rebuy.maxPerCoin} kind="count" zero="No limit" min={0} max={20} integer steps={[0, 1, 2, 3, 5]} label="Re-buys of one coin at most" onChange={n => setRebuy({ maxPerCoin: n })}/>}>
          <QuickPicks options={REBUY_CHOICES.maxPerCoin.map(n => ({ value: n as number, text: n ? String(n) : 'No limit' }))} value={rebuy.maxPerCoin} onPick={n => setRebuy({ maxPerCoin: n })}/>
        </SettingRow>
      </>}
    </div>
  </>;

  // ---- Trader ----
  const inactivity = inactivityOf(rules.inactivity), setInactivity = (change: Partial<InactivityRules>) => set({ inactivity: { ...inactivity!, ...change } });
  const trader = <>
    {!phone && <div className={`${s.surface} ${s.editorGraph}`}><ExitGraph plan={rules.exits}/></div>}
    <div className={s.setGroup}><ExitPlanRows plan={rules.exits} initial={initial.exits} onChange={exits => set({ exits })} onTrail={pct => set({ stopLossPct: pct })} open={open} onOpen={setOpen} planDelta={planDelta}
      saved={savedPlans} onSave={async exits => await command({ type: 'saveExitPlan', exits }) !== false} onForget={name => void command({ type: 'forgetExitPlan', name })}/></div>
    <div className={s.setGroup}>
      <SettingRow id="inactivity" label="Inactivity exit" sub={inactivity ? 'Sells the rest only when price, trades and volume all stay quiet. Missing data never counts as quiet.' : 'Off: a quiet coin stays held until another exit fires.'} changed={changed('inactivity')}
        control={<Switch checked={Boolean(inactivity)} aria-label="Inactivity exit" onCheckedChange={checked => set({ inactivity: checked ? { ...INACTIVITY_DEFAULT } : null })}/>}/>
      {inactivity && <>
        <SettingRow id="inactivity.minutes" {...toggle('idleTime')} label="Quiet for" sub="Needs this full observed period; starts again after a restart or a gap in data"
          value={<Val editing={open === 'idleTime'} autoFocus value={inactivity.minutes} kind="min" min={5} max={60} integer steps={[5, 10, 15, 30, 60]} label="Minutes of inactivity" onChange={minutes => setInactivity({ minutes })}/>}>
          <QuickPicks options={[5, 10, 15, 30, 60].map(value => ({ value, text: `${value} min` }))} value={inactivity.minutes} onPick={minutes => setInactivity({ minutes })}/>
        </SettingRow>
        <SettingRow id="inactivity.priceRangePct" {...toggle('idlePrice')} label="Price range at most" sub="Highest versus lowest price across the entire quiet period"
          value={<Val editing={open === 'idlePrice'} autoFocus value={inactivity.priceRangePct} kind="pct" min={0.1} max={10} steps={[0.5, 1, 2, 3]} label="Maximum inactive price range" post="%" onChange={priceRangePct => setInactivity({ priceRangePct })}/>}>
          <QuickPicks options={[0.5, 1, 2, 3].map(value => ({ value, text: `${value}%` }))} value={inactivity.priceRangePct} onPick={priceRangePct => setInactivity({ priceRangePct })}/>
        </SettingRow>
        <SettingRow id="inactivity.maxTrades5m" {...toggle('idleTrades')} label="Trades at most" sub="Each five-minute reading must stay at or below this count"
          value={<Val editing={open === 'idleTrades'} autoFocus value={inactivity.maxTrades5m} kind="count" min={0} max={100} integer steps={[0, 2, 5, 10]} label="Maximum trades per five minutes" onChange={maxTrades5m => setInactivity({ maxTrades5m })}/>}>
          <QuickPicks options={[0, 2, 5, 10].map(value => ({ value, text: `${value} / 5 min` }))} value={inactivity.maxTrades5m} onPick={maxTrades5m => setInactivity({ maxTrades5m })}/>
        </SettingRow>
        <SettingRow id="inactivity.maxVolumeCapPct5m" {...toggle('idleVolume')} label="Volume at most" sub="Five-minute volume as a share of market cap; 0.1% means $100 at a $100K cap"
          value={<Val editing={open === 'idleVolume'} autoFocus value={inactivity.maxVolumeCapPct5m} kind="pct" min={0} max={10} steps={[0, 0.05, 0.1, 0.5, 1]} label="Maximum five-minute volume as percent of market cap" post="% of cap" onChange={maxVolumeCapPct5m => setInactivity({ maxVolumeCapPct5m })}/>}>
          <QuickPicks options={[0, 0.05, 0.1, 0.5].map(value => ({ value, text: `${value}%` }))} value={inactivity.maxVolumeCapPct5m} onPick={maxVolumeCapPct5m => setInactivity({ maxVolumeCapPct5m })}/>
        </SettingRow>
      </>}
    </div>
    <div className={s.setGroup}>
      <SettingRow id="sellModelPct" label="Sell-or-keep model" sub={rules.sellModelPct ? 'Sells the rest on a price where the model says selling beats keeping it under the plan. No candles, no sell.' : 'Off: the exit plan and TraderBot decide when to sell.'} changed={changed('sellModelPct')}
        control={<Switch checked={Boolean(rules.sellModelPct)} aria-label="Sell-or-keep model" onCheckedChange={checked => set({ sellModelPct: checked ? SELL_MODEL.start : 0 })}/>}/>
      {rules.sellModelPct ? <SettingRow id="sellModelPct" {...toggle('sellModel')} label="Sells when it is" sub="The model's chance that selling now beats keeping for the next hour"
        value={<Val editing={open === 'sellModel'} autoFocus value={rules.sellModelPct} kind="pct" min={SELL_MODEL.min} max={SELL_MODEL.max} integer steps={[...SELL_MODEL.picks]} label="Sell-or-keep model threshold" post="% sure" onChange={sellModelPct => set({ sellModelPct })}/>}>
        <QuickPicks options={SELL_MODEL.picks.map(value => ({ value, text: `${value}%` }))} value={rules.sellModelPct} onPick={sellModelPct => set({ sellModelPct })}/>
      </SettingRow> : null}
    </div>
    <div className={s.setGroup}>
      <SettingRow id="codeOnly" label="Code only" sub={rules.codeOnly ? 'No AI reviews: the exit plan and trailing stop sell, plain limits settle asks' : 'TraderBot’s AI reviews can sell before the exit plan and settle asks'} changed={changed('codeOnly')}
        control={<Switch checked={Boolean(rules.codeOnly)} aria-label="Code only" onCheckedChange={checked => set({ codeOnly: checked })}/>}/>
    </div>
  </>;

  // ---- Budget ----
  // The budget stops buying once it can't hold another coin at full size, so more coins at once than it fits never fill.
  const fits = Math.max(1, Math.floor(rules.allocationSol / rules.amountSol + 1e-9)), short = rules.maxOpenPositions > fits;
  // Running strategies share the portfolio's SOL: budgets adding up to more than it holds leave picks waiting for SOL.
  const others = home ? home.strategies.filter(row => row.id !== strategy.id && row.status === 'running') : [];
  const saved = data.strategies.find(row => row.id === strategy.id);
  const budgets = others.reduce((sum, row) => sum + row.rules.allocationSol, rules.allocationSol), held = home?.money.equity ?? Infinity, over = budgets > held + 0.005;
  const budget = <>
    <div className={s.setGroup}>
      <SettingRow id="budgetSol" {...toggle('budget')} label="Budget" warn={over} sub={over ? (others.length ? `Running budgets: ${+budgets.toFixed(2)} of your ${+held.toFixed(2)} SOL` : `More than your ${+held.toFixed(2)} SOL`) : 'All this strategy can have in coins at once'} changed={changed('budgetSol')}
        value={<Val editing={open === 'budget'} autoFocus value={rules.allocationSol} kind="sol" min={0.01} steps={BUDGETS} label="Budget in SOL" post=" SOL" onChange={n => set({ budgetSol: n, ...(rules.amountSol > n ? { tradeSol: n } : {}) })}/>}>
        <QuickPicks options={BUDGETS.map(n => ({ value: n, text: `${n} SOL` }))} value={rules.allocationSol} onPick={n => set({ budgetSol: n, ...(rules.amountSol > n ? { tradeSol: n } : {}) })}/>
      </SettingRow>
      <SettingRow id="tradeSol" {...toggle('trade')} label="Per coin, up to" sub="Each buy scales with how well the coin fits, up to this" changed={changed('tradeSol')}
        value={<Val editing={open === 'trade'} autoFocus value={rules.amountSol} kind="sol" min={0.01} max={rules.allocationSol} steps={[0.05, 0.1, 0.2, 0.5, 1, 2]} label="Most SOL per coin" post=" SOL" onChange={n => set({ tradeSol: n })}/>}>
        <QuickPicks options={[0.05, 0.1, 0.2, 0.5, 1].map(n => ({ value: n, text: `${n} SOL` }))} value={rules.amountSol} onPick={n => set({ tradeSol: Math.min(n, rules.allocationSol) })}/>
      </SettingRow>
      <SettingRow id="maxPoolSharePct" {...toggle('pool')} label="Pool share, up to" sub="Each buy takes at most this much of the coin's pool" changed={changed('maxPoolSharePct')}
        value={<Val editing={open === 'pool'} autoFocus value={poolShare(rules)} kind="pct" min={POOL_SHARE.min} max={POOL_SHARE.max} steps={[0.5, 1, 2, 5]} label="Most of the pool per buy" post="%" onChange={n => set({ maxPoolSharePct: n })}/>}>
        <QuickPicks options={[0.5, 1, 2, 5].map(n => ({ value: n, text: `${n}%` }))} value={poolShare(rules)} onPick={n => set({ maxPoolSharePct: n })}/>
      </SettingRow>
      <SettingRow id="maxOpen" {...toggle('open')} label="Coins at once" warn={short} sub={short ? `The budget fits ${fits}` : 'Held at the same time'} changed={changed('maxOpen')}
        control={short ? <Button size="xs" variant="outline" onClick={() => set({ maxOpen: fits })}>Set {fits}</Button> : undefined}
        value={<Val editing={open === 'open'} autoFocus value={rules.maxOpenPositions} kind="count" min={1} max={20} integer steps={[1, 3, 5, 10, 15, 20]} label="Coins at once" onChange={n => set({ maxOpen: n })}/>}>
        <QuickPicks options={[3, 5, 10, 15, 20].map(n => ({ value: n, text: String(n) }))} value={rules.maxOpenPositions} onPick={n => set({ maxOpen: n })}/>
      </SettingRow>
    </div>
    {phone && saved && <div className={s.settingsArchive}><ArchiveStrategyButton data={data} strategy={saved} block/></div>}
  </>;

  return { search, shield, sniper, trader, budget };
}

export function SettingsEditor({ data, draft, onClose, start }: { data: HomeData; draft: SettingsDraft; onClose: () => void; start?: { label: string; busy: boolean; onStart: () => void } }) {
  const command = useCommand(), openCheck = useSetAtom(checkCoinAtom), phone = usePhone();
  const { strategy, patch, rules, error, dirty, dip, set } = draft, initial = strategy.rules;
  const [view, setView] = useAtom(settingsViewAtom), setEditing = useSetAtom(settingsEditingAtom);
  // A phone's unsaved changes take the tab bar's place with their Reset/Save bar (MobileNav slides it away).
  const editing = phone && (dirty || Boolean(start));
  useEffect(() => { setEditing(editing); return () => setEditing(false); }, [editing, setEditing]);
  const [tab, setTab] = useState<Tab>('search'), [open, setOpen] = useState<string | null>(null), [saving, setSaving] = useState(false), [skipped, setSkipped] = useState<string[]>([]);
  const tabs: { id: Tab; name: string }[] = [{ id: 'search', name: 'Search' }, { id: 'shield', name: 'Shield' }, { id: 'sniper', name: 'Sniper' }, { id: 'trader', name: 'Trader' }, { id: 'budget', name: 'Budget' }];
  const tabChanged = (id: Tab) => Object.keys(patch).some(TAB_KEYS[id]);

  const lab = useLabData(), on = checksOn(rules), proposal = useAtomValue(draftProposalAtom);
  const singles = (Object.keys(patch) as (keyof StrategyPatch)[]).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct' && !UNREPLAYED.has(key))
    .map(key => ({ key, patch: { [key]: patch[key], ...(key === 'maxMove1hPct' ? { sweetMove1hLowPct: patch.sweetMove1hLowPct, sweetMove1hHighPct: patch.sweetMove1hHighPct } : {}) } as StrategyPatch }));
  const run = useLab(lab.data, { strategyId: strategy.id, since: 0, saved: { rules: initial, dip: strategy.dipPct }, draft: { rules, dip }, plans: true, singles,
    tips: on.filter(row => !row.noReplay).map(row => ({ key: row.key, steps: row.steps, removable: row.start !== undefined, looserIsLower: looserIsLower(row.key) })),
    ...(proposal ? { proposal } : {}) });
  const now = run.main?.now, next = run.main?.next, tips = run.tips;
  const evidence = (row: CheckRow) => { const groups = (run.main?.down ?? []).filter(group => rulesOfCheck(group.check).includes(row.key)); return groups.length ? { n: groups.reduce((sum, g) => sum + g.count, 0), doubled: groups.reduce((sum, g) => sum + g.doubled, 0) } : null; };

  const planDelta = next && run.main?.plans ? (id: string) => { const row = run.main!.plans!.find(plan => plan.id === id); return row ? row.result.totalSol - next.totalSol : undefined; } : undefined;
  const { search, shield, sniper, trader, budget } = useSettingsSections({ data, draft, open, setOpen, evidence, labLoaded: Boolean(lab.data), planDelta });

  const save = async () => { setSaving(true); const ok = await command({ type: 'update', strategyId: strategy.id, patch }); setSaving(false); if (ok !== false) onClose(); };
  const count = Object.keys(patch).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct').length;
  const saveLabel = dirty ? `Save ${count} ${count === 1 ? 'change' : 'changes'}` : 'Saved';

  const days = lab.data ? Math.max(1, Math.round((lab.data.builtAt - lab.data.from) / 86_400_000)) : 5;
  const ideas: Suggestion[] = [];
  const step = next && bestTip(tips, next, skipped), stepRow = step && CHECKS.find(check => check.key === step.tip.key);
  if (step && stepRow) ideas.push({ key: `${step.tip.key}:${step.variant.value}`, title: step.variant.value === 0 ? `Remove ${stepRow.name.toLowerCase()}` : `${stepRow.name} ${numText(stepRow.kind, step.variant.value)}`, gainSol: step.gain,
    note: step.variant.picks !== next!.picks ? `${Math.abs(step.variant.picks - next!.picks)} ${step.variant.picks > next!.picks ? 'more' : 'fewer'} coins` : undefined, patch: { [step.tip.key]: step.variant.value } });
  const current = planOf(rules.exits), plan = next && run.main?.plans ? EASY_PLANS.map(row => row.id).filter(id => id !== current && !skipped.includes(`plan:${id}`)).map(id => ({ id, gain: (run.main!.plans!.find(row => row.id === id)?.result.totalSol ?? -Infinity) - next.totalSol })).sort((a, b) => b.gain - a.gain)[0] : undefined;
  if (plan && plan.gain >= 0.05) ideas.push({ key: `plan:${plan.id}`, title: `Take profit: ${easyPlanName(plan.id)}`, gainSol: plan.gain, patch: { exits: exitsWith(rules.exits, { plan: EXIT_PLANS[plan.id].exits }) } });
  const apply = (idea: Suggestion) => { set(idea.patch); setSkipped(list => [...list, idea.key]); }, skip = (idea: Suggestion) => setSkipped(list => [...list, idea.key]);
  // The one button: Save, or Start for a strategy not made yet.
  const go = start ? { label: start.label, busy: start.busy, off: start.busy || Boolean(error), run: start.onStart }
    : { label: saveLabel, busy: saving, off: !dirty || saving || Boolean(error), run: () => void save() };
  const action = <div className={s.easyAction}>
    <EasyAsk draft={draft}/>
    {error && <span className={s.warnText}>{error}</span>}
    <Button size="lg" className={s.easyGo} disabled={go.off} onClick={go.run}>{go.busy ? <LoaderCircle className="animate-spin"/> : null}{go.label}</Button>
    {dirty && <Button size="sm" variant="ghost" onClick={draft.reset}>{start ? 'Reset' : 'Discard'}</Button>}
  </div>;
  const lines = dirty ? describeChanges(patch, initial, rules, strategy.dipPct) : [];

  // In the body: the editor sits in size containers, and Safari makes those the containing block of a fixed bar.
  const bar = editing && createPortal(<div className={s.mBar} data-edit role="status">
    <button type="button" className={s.mSide} aria-label="Reset changes" disabled={!dirty} onClick={draft.reset}><Undo2/></button>
    <div className={s.mPill} data-warn={error ? true : undefined}><div className={s.mLine}><small>{error ? 'Can’t save yet' : start ? 'New strategy' : `${count} ${count === 1 ? 'change' : 'changes'}`}</small><span>{error ?? (start ? strategy.name : lines.join(' · '))}</span></div></div>
    <button type="button" className={s.mSave} disabled={go.off} onClick={go.run}>{go.busy ? <Check/> : start ? 'Start' : 'Save'}</button>
  </div>, document.body);
  const result = <EasyResult figure={lab.error ? undefined : next?.totalSol} days={days}/>;
  // The views slide in from their side of the switch (Easy left, Advanced right), only once someone has switched, so a page load doesn't slide.
  const [switched, setSwitched] = useState(false), slide = switched ? view : undefined;
  const pick = (id: typeof view) => { setView(id); setOpen(null); setSwitched(true); };
  const easy = <EasyEditor draft={draft} open={open} setOpen={setOpen} askInRows={phone}/>;

  const root = useRef<HTMLElement>(null), spot = useSetAtom(settingSpotAtom), setDock = useSetAtom(dockOpenAtom), setBridge = useSetAtom(draftBridgeAtom);
  useSettingSpot(root);
  // A row on screen glows where it is; any other opens its view and tab first. Easy and Advanced rows that set the same thing share an id.
  const show = (ids: string[]) => {
    const rows = guideOf(ids);
    if (!rows.length) return;
    if (!rows.some(row => root.current?.querySelector(`[data-setting="${CSS.escape(row.id)}"]`))) {
      const target = rows.find(row => view === 'easy' && row.easy) ?? rows.find(row => row.tab) ?? rows[0];
      if (target.tab && !(view === 'easy' && target.easy)) { if (view !== 'advanced') pick('advanced'); setTab(target.tab); } else if (view !== 'easy') pick('easy');
    }
    setOpen(null);
    if (phone) setDock(false);
    spot({ ids: rows.map(row => row.id), at: Date.now() });
  };
  const context = () => root.current ? JSON.stringify(settingsContext({ root: root.current, draft, start: Boolean(start), view, tab, lines, days, now, next, singles: run.main?.singles, ideas, plans: run.main?.plans, lab })) : null;
  const replayed = run.main?.proposal && next ? { key: run.main.proposal.key, sol: run.main.proposal.result.totalSol, picks: run.main.proposal.result.picks, mean: run.main.proposal.result.mean,
    base: { sol: next.totalSol, picks: next.picks, mean: next.mean } } : null;
  // The bridge holds functions over this render's state, so it is published again on every render; the dock reads it only when it asks.
  useEffect(() => { setBridge({ page: 'settings', name: strategy.name, rules, dip, patch, context, replayed, show, apply: change => { if (change.exitPlan !== undefined) draft.drop(['exits']); set(change); }, drop: draft.drop }); });
  useEffect(() => () => setBridge(null), [setBridge]);

  return <section ref={root} className={s.editorShell} aria-label={`${strategy.name} settings`}>
    <header className={s.editorTop}>
      <h1 className={s.editorTitle}><b>{strategy.name}</b>{!start && <StrategyStatus status={strategy.status}/>}</h1>
      <Tabs value={view} onValueChange={id => pick(id as typeof view)} className={s.viewTabs}>
        <TabsList variant="line" aria-label="Settings view"><TabsTrigger value="easy">Easy</TabsTrigger><TabsTrigger value="advanced">Advanced</TabsTrigger></TabsList>
      </Tabs>
      <div className={s.editorActions}>
        {view === 'advanced' && !phone && <>
          {error && <span className={s.warnText}>{error}</span>}
          {dirty && <Button size="sm" variant="ghost" onClick={draft.reset}>{start ? 'Reset' : 'Discard'}</Button>}
          <Button size="sm" disabled={go.off} onClick={go.run}>{go.busy ? <LoaderCircle className="animate-spin"/> : null}{go.label}</Button>
        </>}
        <button type="button" className={s.headRound} aria-label={start ? 'Back' : 'Close settings'} onClick={onClose}><X/></button>
      </div>
    </header>
    {view === 'easy' ? phone
      ? <div className={s.editorBody} data-slide={slide}><div className={s.editorMain}>{result}{easy}</div><EasyDock ideas={ideas} onApply={apply} onSkip={skip}/></div>
      : <div className={s.editorBody} data-slide={slide}><div className={s.editorMain}>{easy}</div><EasyColumn result={result} ideas={ideas} onApply={apply} onSkip={skip} action={action}/></div>
    : <Tabs value={tab} onValueChange={value => { setTab(value as Tab); setOpen(null); }} data-slide={slide} className={`${s.editorTabs} grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0`}>
      <TabsList variant="line" aria-label="Settings sections">{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.name}{tabChanged(t.id) && <span className={s.unsavedDot} aria-label="changed"/>}</TabsTrigger>)}</TabsList>
      <div className={s.editorBody}>
        <div className={s.editorMain}>
          <TabsContent value="search">{search}</TabsContent>
          <TabsContent value="shield">{shield}</TabsContent>
          <TabsContent value="sniper">{sniper}</TabsContent>
          <TabsContent value="trader">{trader}</TabsContent>
          <TabsContent value="budget">{budget}</TabsContent>
        </div>
        <aside className={s.editorSide} aria-label="What these settings would have made">
          <Outcome lab={lab} now={now} next={next} singles={run.main?.singles} draft={draft} onUndo={keys => draft.drop(keys)}/>
          <Idea tips={tips} next={next} rules={rules} skipped={skipped} onSkip={key => setSkipped(list => [...list, key])} onAdd={(key, n) => { set({ [key]: n }); setTab('search'); setOpen(key); }}/>
          <FitNow rules={rules} onOpen={token => openCheck({ query: token, strategyId: strategy.id })}/>
        </aside>
      </div>
    </Tabs>}
    {bar}
  </section>;
}

type Lab = ReturnType<typeof useLabData>;
const r3 = (x: number | null | undefined) => x != null && Number.isFinite(x) ? +x.toFixed(3) : null;
/** A part's text as it reads on screen, with a value typed over in its box in place of the box. */
function shownText(el: Element | null | undefined) {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element, typed = el.querySelectorAll('input');
  copy.querySelectorAll('input').forEach((input, i) => input.replaceWith((typed[i] as HTMLInputElement).value));
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}
/** Every marked part on screen as HOTBOT reads it, from the page itself so it is what the person sees: a row's id, name, value, line and
 *  whether it is an unsaved change. The coin kinds say the one picked; the result and the ideas only that they show (their figures go apart). */
function shownRows(root: HTMLElement) {
  const at = (el: Element, name: string) => el.querySelector('.' + CSS.escape(name));
  return [...root.querySelectorAll<HTMLElement>('[data-setting]')].map(el => {
    const id = el.dataset.setting!, picked = el.querySelector('[role=radio][aria-checked=true] b');
    if (!el.classList.contains(s.setRow)) return { id, name: guideOf([id])[0]?.name ?? id, ...(picked ? { value: shownText(picked) } : {}) };
    const text = at(el, s.setText), toggle = el.querySelector(`.${CSS.escape(s.setHead)} [role=switch]`);
    const value = shownText(at(el, s.setValue)) || (toggle ? toggle.getAttribute('aria-checked') === 'true' ? 'On' : 'Off' : ''), line = shownText(text?.querySelector('small'));
    return { id, name: shownText(text?.querySelector('b')), ...(value ? { value } : {}), ...(line ? { line } : {}), ...(el.hasAttribute('data-changed') ? { changed: true } : {}) };
  });
}
function settingsContext({ root, draft, start, view, tab, lines, days, now, next, singles, ideas, plans, lab }: { root: HTMLElement; draft: SettingsDraft; start: boolean; view: 'easy' | 'advanced'; tab: Tab;
  lines: string[]; days: number; now?: Result; next?: Result; singles?: { key: string; totalSol: number | null }[]; ideas: Suggestion[]; plans?: { id: string; result: Result }[]; lab: Lab }) {
  // A draft that can't save has rules the server refuses, so the saved ones go instead; the rows still say the draft's values.
  const { strategy, dip, error } = draft, rules = error ? strategy.rules : draft.rules;
  return {
    name: strategy.name, ...(start ? { saved: false } : { strategyId: strategy.id, status: strategy.status }), rules, dip: error ? strategy.dipPct : dip,
    view, ...(view === 'advanced' ? { tab } : {}), open: root.querySelector<HTMLElement>('[data-setting][data-open]')?.dataset.setting ?? null,
    rows: shownRows(root), unsavedChanges: lines, ...(error ? { cannotSave: error } : {}),
    result: lab.error ? { unavailable: lab.error } : next ? { days, sol: r3(next.totalSol), bought: next.traded, wonPct: next.traded ? Math.round(100 * next.won / next.traded) : 0, ...(now && lines.length ? { savedSol: r3(now.totalSol) } : {}) } : { replaying: true },
    ...(singles?.length ? { singles: singles.map(single => ({ key: single.key, solAloneVsSaved: r3(single.totalSol) })) } : {}),
    ...(ideas.length ? { ideas: ideas.map(idea => ({ title: idea.title, solVsDraft: r3(idea.gainSol), ...(idea.note ? { note: idea.note } : {}) })) } : {}),
    ...(plans?.length ? { plans: plans.map(plan => ({ id: plan.id, name: EXIT_PLANS[plan.id as ExitPlanId].exits.name, sol: r3(plan.result.totalSol) })) } : {}),
    notReplayed: ['TraderBot’s own sales', 're-buys', 'the inactivity exit', 'the sell-or-keep model'],
  };
}
function Outcome({ lab, now, next, singles, draft, onUndo }: { lab: Lab; now?: Result; next?: Result; singles?: { key: string; totalSol: number | null }[]; draft: SettingsDraft; onUndo: (keys: (keyof StrategyPatch)[]) => void }) {
  const { strategy, patch, rules } = draft, initial = strategy.rules;
  const keys = (Object.keys(patch) as (keyof StrategyPatch)[]).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct');
  const effects = singles ? new Map(singles.map(single => [single.key, single.totalSol])) : null;
  const days = lab.data ? Math.max(1, Math.round((lab.data.builtAt - lab.data.from) / 86_400_000)) : 5;
  const figure = next?.totalSol, before = now?.totalSol;
  return <section className={s.editorOutcome} {...useSpotAttrs('result')}>
    <small>If these settings had run the last {days} days</small>
    {inactivityOf(rules.inactivity) && <p className={s.labNote}>This replay does not include the inactivity exit.</p>}
    {rules.sellModelPct ? <p className={s.labNote}>This replay does not include the sell-or-keep model.</p> : null}
    {lab.error ? <p className={s.labNote}>{lab.error}</p> : !next || figure === undefined ? <div className={s.editorFigureGhost} role="status" aria-label="Replaying the last days"/> : <>
      <b className={`${s.editorFigure} ${figure > 0.005 ? s.up : figure < -0.005 ? s.down : s.muted}`}>{signedSol(figure).replace(' SOL', '')}<small>SOL</small></b>
      <span className={s.editorFigureNote}>{keys.length && before !== undefined ? `was ${signedSol(before).replace(' SOL', '')} · ` : ''}{now && now.traded !== next.traded ? `${now.traded} → ${next.traded}` : next.traded} coins bought</span>
    </>}
    {keys.length > 0 && <ul className={s.editorChanges}>{keys.map(key => { const line = describeChanges({ [key]: patch[key] } as StrategyPatch, initial, rules, strategy.dipPct)[0], d = effects?.get(key);
      return <li key={key}><span>{line}</span><em className={d == null ? s.muted : d > 0.005 ? s.up : d < -0.005 ? s.down : s.muted}>{d == null ? effects && UNREPLAYED.has(key) ? 'not replayed' : '' : Math.abs(d) < 0.005 ? '0.00' : signedSol(d).replace(' SOL', '')}</em>
        <button type="button" className={s.ruleRemove} aria-label={`Undo: ${line}`} onClick={() => onUndo(key === 'maxMove1hPct' ? [key, 'sweetMove1hLowPct', 'sweetMove1hHighPct'] : [key])}><X/></button></li>; })}</ul>}
  </section>;
}

/** The one rule step worth suggesting (`tipWorth`) that makes the most on the last days' coins; none when no step is. `skipped`: steps already
 *  passed over or applied. */
function bestTip(tips: Map<string, Tip>, next: Result, skipped: string[]) {
  return [...tips.values()].flatMap(tip => tip.variants.map(variant => ({ tip, variant, gain: variant.totalSol - next.totalSol })))
    .filter(({ tip, variant }) => !skipped.includes(`${tip.key}:${variant.value}`) && tipWorth(variant, next.totalSol))
    .sort((a, b) => b.gain - a.gain)[0];
}

export function Idea({ tips, next, rules, skipped, onSkip, onAdd }: { tips: Map<string, Tip>; next?: Result; rules: TeamRules; skipped: string[]; onSkip: (key: string) => void; onAdd: (key: string, value: number) => void }) {
  const spotAttrs = useSpotAttrs('ideas');
  if (!next) return null;
  const best = bestTip(tips, next, skipped);
  const row = best && CHECKS.find(check => check.key === best.tip.key);
  return <section className={s.editorIdea} {...spotAttrs}>
    <div className={s.editorIdeaHead}><BotAvatar role="coordinator" size={22}/><b>HOTBOT</b></div>
    {best && row ? <div className={s.editorIdeaCard}>
      <b>{best.variant.value === 0 ? `Remove ${row.name.toLowerCase()}` : `${row.name}: ${numText(row.kind, (rules[row.key] as number | undefined) ?? 0)} → ${numText(row.kind, best.variant.value)}`}</b>
      <span><em className={s.up}>{signedSol(best.gain, 2)}</em>{best.variant.picks !== next.picks ? ` · ${Math.abs(best.variant.picks - next.picks)} ${best.variant.picks > next.picks ? 'more' : 'fewer'} coins` : ''} · {Math.round(best.variant.sure * 100)}% likely</span>
      <div><Button size="xs" className={s.emberButton} onClick={() => onAdd(best.tip.key, best.variant.value)}>Add to draft</Button><Button size="xs" variant="ghost" onClick={() => onSkip(`${best.tip.key}:${best.variant.value}`)}>Skip</Button></div>
    </div> : <p className={s.labNote}>{tips.size ? 'No rule step clearly beats these settings on the last days.' : 'Looking through the last days…'}</p>}
  </section>;
}

/** Coins that pass the draft's research rules right now, from one live Pulse view. */
function FitNow({ rules, onOpen }: { rules: TeamRules; onOpen: (token: string) => void }) {
  const fit = useFits(rules), shown = fit.fits?.tokens.slice(0, 5) ?? [], plus = fit.fits?.capped ? '+' : '';
  return <section className={s.editorFits} aria-live="polite" data-loading={fit.loading || undefined}>
    {fit.fits ? <>
      <b className={fit.fits.count ? undefined : s.warnText}>{fit.fits.count ? `${fit.fits.count}${plus} fit right now` : 'Nothing fits right now'}</b>
      <div>{shown.map(token => <CoinPill key={token.address || token.symbol} coins={[token]} note={token.marketCapUsd ? '$' + numText('usd', token.marketCapUsd) : undefined} onClick={() => onOpen(token.address || token.symbol)}/>)}
        {fit.fits.count > shown.length && <small>{fit.fits.count - shown.length}{plus} more</small>}</div>
    </> : fit.loading ? <small>Checking what fits right now…</small>
      : <><small>Couldn’t count what fits right now</small><button type="button" className={s.fitsRetry} onClick={fit.retry}>Try again</button></>}
  </section>;
}
