"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAction, useQuery } from 'convex/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ChartCandlestick, Check, LoaderCircle, Pencil, Settings as GearIcon, ShieldCheck, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { api } from '@/lib/convex';
import { isAdminAtom } from '@/store/user/atoms';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { EASY_PLANS, easyPlanName, exitsWith, perCoin, planOf } from '../../../../types/easy';
import { EXIT_PLANS, isTrail, namedExitPlan, trailPct, type ExitPlan, type ExitPlanId } from '../../../../types/exits';
import { ACTIVE_TRADING, type ActiveTrading } from '../../../../types/entryActivity';
import { guideOf } from '../../../../types/settingsGuide';
import { DRAIN, DRAIN_MINUTES, NO_TRADE, drainText, noTradeOf, secondsText, type DrainMinutes, type DrainRules } from '../../../../types/inactivity';
import { CODE_ONLY_FOR_ALL, CODE_ONLY_SPLIT, DEFAULT_RESEARCH_POLICY, LOSS_STOP_PCT, POOL_SHARE, REBUY_CHOICES, codeOnlyOf, REBUY_CONFIRMATIONS, REBUY_DIRECTIONS, STREAMS, STREAM_NAMES, streamsOf, validateRules, type RebuyConfirmation, type RebuyDirection, type RebuyRules, type Stream, type TeamRules } from '../../../../types/hotbot';
import { FINAL, researchCriteria } from '../../../../types/hotbotResearch';
import { INSIDER_GROUPS, INSIDER_NAMES, LAUNCHPAD_NAMES, SHIELD_DEFAULTS, SHIELD_ROWS, TRADED_LAUNCHPADS, holdingOn, shieldOf, shieldValueText, type Holding, type InsiderGroup, type Launchpad, type ShieldHolding, type ShieldNumber, type ShieldRow, type ShieldRules, type ShieldSwitch } from '../../../../types/shield';
import { rebuyWords } from '../../../../types/rebuy';
import { BREAKOUT, BREAKOUT_CHOICES, BREAKOUT_START, breakoutText, type BreakoutRules } from '../../../../types/breakout';
import { HOURS_START, WEEKDAYS, WEEKDAY_NAMES, daysText, hoursText, type TradingHours } from '../../../../types/schedule';
import { BUDGETS, FIT_NUMBERS, FIT_SWITCHES, REPICK, applyPatch, mustHaves, poolShare, recheckMove, type Fits, type MustHave, type StrategyPatch } from '../../../../types/team';
import { LossStopRow, PracticeStopRow, hasCopy, useStrategySave } from './LossStop';
import { ArchiveStrategyButton } from './ArchiveStrategy';
import { RealSolCopies } from './TeamWallet';
import type { HomeData, StrategyRow } from './data';
import { ExitPlanRows, stable } from './ExitPlan';
import { TradeExamples } from './TradeExamples';
import { CHECKS, CHECK_GROUPS, type CheckRow } from './checks';
import { signedSol } from './format';
import { useLab, useLabData } from './labData';
import { checkLabel, rulesOfCheck, type Result } from './labModel';
import { SUGGEST, changeWorth, labDays, tipWorth, type Tip } from '../../../../types/lab';
import { CoinPill, Hint, QuickPicks, SettingRow, Shield, StrategyStatus, TimeVal, Val, numText, usePhone, useSettingSpot, useSpotAttrs } from './Parts';
import { checkCoinAtom, dockOpenAtom, draftBridgeAtom, draftProposalAtom, settingSpotAtom, settingsEditingAtom, settingsViewAtom, useCommand, viewAsAtom } from './state';
import { EasyAsk, EasyEditor, Ideas, lastDays, lastDaysTitle, type NoIdea, type Suggestion } from './EasySettings';
import { useHome } from './useHome';
import s from './team.module.css';

const MUST_NAMES: Record<MustHave, string> = { liquidity: 'liquidity', volume: 'volume', marketCap: 'market cap', age: 'age', top10: 'top 10', maxAge: 'max age', lpBurn: 'burned liquidity' };
/** Where a new 1h move range starts: best 25–100%, barely acceptable at 500%. */
const MOVE_RANGE = { low: 25, high: 100 };
/** Re-buys switched on start here; every field is the person's to change (types/rebuy.ts). */
const REBUY_START: RebuyRules = { steadyCloses: 'weighted', confirmation: 'none', chasePct: 15, watchMinutes: 30, afterLoss: 'stop', maxPerCoin: 1 };
const DIRECTION_NAMES: Record<RebuyDirection, string> = { pullback: 'Pullback', continuation: 'New high', either: 'Either' };
const CONFIRM_NAMES: Record<RebuyConfirmation, string> = { none: 'None', volume: 'Volume uptick', positiveVolume: 'Positive volume uptick', buysOvertake: 'Buys overtake sells', volumeAndBuys: 'Volume + buys' };
/** Windows offered for the trading hours, UTC. */
const HOUR_WINDOWS: TradingHours[] = [{ from: 0, to: 8 }, { from: 8, to: 16 }, { from: 16, to: 0 }, { from: 13, to: 21 }];
const passOf = (r: TeamRules) => (r.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;
/** A patch key's value on a strategy, in the shape the patch carries it. */
export function valueOf(r: TeamRules, dip: number, key: keyof StrategyPatch): unknown {
  switch (key) {
    case 'budgetSol': return r.allocationSol;
    case 'tradeSol': return r.amountSol;
    case 'maxOpen': return r.maxOpenPositions;
    case 'maxPoolSharePct': return poolShare(r);
    case 'lossStopPct': return r.lossStopPct ?? LOSS_STOP_PCT;
    case 'practiceStopPct': return r.practiceStopPct ?? 0;
    case 'askFirst': return r.mode === 'ask';
    case 'activeTrading': return stable(r.activeTrading ?? null);
    case 'codeOnly': return Boolean(r.codeOnly);
    case 'skipTwinCoins': return r.skipTwinCoins === true;
    case 'dipPct': return dip;
    case 'exits': return stable(r.exits);
    case 'mustHave': return [...mustHaves(r)].sort().join();
    case 'streams': return streamsOf(r).join();
    case 'rebuy': return stable(r.rebuy ?? null);
    case 'breakout': return stable(r.breakout ?? null);
    case 'tradingHours': return stable(r.tradingHours ?? null);
    case 'tradingDays': return stable(r.tradingDays ?? null);
    case 'noTradeSeconds': return noTradeOf(r);
    case 'drain': return stable(r.drain ?? null);
    case 'recheckMovePct': return recheckMove(r);
    case 'passMark': return passOf(r);
    case 'shield': return stable(shieldOf(r));
    case 'stopLossPct': return trailPct(r.exits) ?? 0;
    default: return (r as Record<string, unknown>)[key] ?? 0;
  }
}
export const normal = (key: keyof StrategyPatch, value: unknown) => key === 'noTradeSeconds' ? value === undefined ? NO_TRADE.seconds : value : key === 'shield' ? stable({ ...SHIELD_DEFAULTS, ...(value as Partial<ShieldRules>) }) : key === 'exits' || key === 'rebuy' || key === 'breakout' || key === 'tradingHours' || key === 'tradingDays' || key === 'activeTrading' || key === 'drain' ? stable(value ?? null) : key === 'mustHave' ? [...value as MustHave[]].sort().join() : key === 'streams' ? (value as Stream[]).join()
  : key === 'recheckMovePct' ? value ?? REPICK.movePct : key === 'maxPoolSharePct' ? value ?? POOL_SHARE.pct : key === 'lossStopPct' ? value ?? LOSS_STOP_PCT : key === 'codeOnly' || key === 'skipTwinCoins' ? Boolean(value) : value ?? 0;
const sol = (n: number) => `${+n.toFixed(3)} SOL`;
const checkText = (row: CheckRow, n: number) => `${row.before}${numText(row.kind, n)}${row.after}`;

/** The settings a patch changes, as a person counts them: the 1h move's sweet spot goes with its limit, and a per-coin size that only follows the
 *  budget or the coins at once (Easy's equal share, or the budget when it fell below the size) is no change of its own. `rules`: the draft's. */
export function changedKeys(patch: StrategyPatch, rules: TeamRules): (keyof StrategyPatch)[] {
  const follows = ('budgetSol' in patch || 'maxOpen' in patch) && (patch.tradeSol === perCoin(rules.allocationSol, rules.maxOpenPositions) || patch.tradeSol === rules.allocationSol);
  return (Object.keys(patch) as (keyof StrategyPatch)[]).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct' && !(key === 'tradeSol' && follows));
}

/** What a patch changes, in words: one line per changed setting. */
export function describeChanges(patch: StrategyPatch, r: TeamRules, next: TeamRules, dip: number): string[] {
  return changedKeys(patch, next).map(key => {
    const before = valueOf(r, dip, key) as number, after = patch[key];
    const row = CHECKS.find(check => check.key === key);
    if (row) return !before ? `Adds: ${checkText(row, after as number).trim()}` : !after ? `Removes ${row.name.toLowerCase()}` : `${row.name}: ${numText(row.kind, before)} → ${numText(row.kind, after as number)}`;
    switch (key) {
      case 'budgetSol': return `Budget: ${sol(before)} → ${sol(after as number)}`;
      case 'tradeSol': return `Per coin: ${sol(before)} → ${sol(after as number)}`;
      case 'maxOpen': return `Coins at once: ${before} → ${after}`;
      case 'maxPoolSharePct': return `Pool share per buy: ${before}% → ${after}%`;
      case 'lossStopPct': return `Drawdown: ${before}% → ${after}% of the budget`;
      case 'practiceStopPct': return after ? `Drawdown: ${before ? `${before}%` : 'off'} → ${after}% of the budget` : 'Drawdown off';
      case 'askFirst': return after ? 'Asks you before each buy' : 'Buys on its own';
      case 'codeOnly': return after ? 'Code alone buys and sells, no AI reviews' : 'TraderBot’s AI reviews can sell again';
      case 'skipTwinCoins': return after ? 'Skips Practice’s coins' : 'Buys Practice’s coins too';
      case 'dipPct': return `Entry: ${before ? `${before}% dip` : 'right away'} → ${after ? `${after}% dip` : 'right away'}`;
      case 'activeTrading': return after ? `Active trading: swap within ${(after as ActiveTrading).lastSwapSeconds}s, ${(after as ActiveTrading).buckets} intervals, ${(after as ActiveTrading).buyers} buyers` : 'Active trading off';
      case 'entryDelayMinutes': return after ? `Watches it ${after} min before buying` : 'Buys right after the pick';
      case 'entryMaxUpPct': return after ? `Lets a coin go once up ${after}%` : 'Buys however far a coin ran';
      case 'breakout': return after ? breakoutText(after as BreakoutRules) : 'No breakout entry';
      case 'tradingHours': return after ? `Buys ${hoursText(after as TradingHours)}` : 'Buys at any hour';
      case 'tradingDays': return after ? `Buys on ${daysText(after as number[])}` : 'Buys every day';
      case 'mustHave': return `Must pass: ${(after as MustHave[]).map(rule => MUST_NAMES[rule]).join(', ') || 'none'}`;
      case 'streams': return (after as Stream[]).length === STREAMS.length ? 'Finds bonding and graduated coins' : `Finds ${(after as Stream[]).map(stream => STREAM_NAMES[stream].toLowerCase()).join(' and ')} coins only`;
      case 'rebuy': return !after ? 'No re-buys' : r.rebuy ? 'Re-buy settings' : 'Re-buys on';
      case 'noTradeSeconds': return after === null ? 'No-trade exit off' : `Sells after ${secondsText(after as number)} with no trade`;
      case 'drain': return after ? `Draining: ${drainText(after as DrainRules)}` : 'Draining exit off';
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

/** The checks a Shield row is a parameter of; none for a check. */
const parentsOf = (key: keyof ShieldRules): readonly (keyof ShieldRules)[] => { const row: ShieldRow = SHIELD_ROWS[key]; return 'parents' in row ? row.parents ?? [] : []; };
/** What changed in ShieldBot's rules, one phrase per rule; a parameter is named with its check. */
function shieldChanges(before: ShieldRules, after: ShieldRules): string[] {
  return (Object.keys(SHIELD_ROWS) as (keyof ShieldRules)[]).filter(key => stable(before[key]) !== stable(after[key])).map(key => {
    const row: ShieldRow = SHIELD_ROWS[key], parent = parentsOf(key)[0], name = parent ? `${SHIELD_ROWS[parent].name} · ${row.name}` : row.name, text = shieldValueText(key, after[key]);
    return row.kind === 'switch' ? `${name} ${text.toLowerCase()}` : text === 'Off' ? `${name} off` : `${name}: ${text}`;
  });
}

type FitState = { fits: Fits | null; loading: boolean; retry: () => void };
const fitCache = new Map<string, { at: number; fits: Fits }>();
/** The rules a fit count reads: the server asks the market gateway for the active coins that pass them (no Convex reads). */
const fitRules = (r: TeamRules) => ({ streams: r.streams, researchPolicy: r.researchPolicy, shield: r.shield, tradingHours: r.tradingHours, tradingDays: r.tradingDays, activeTrading: r.activeTrading,
  ...Object.fromEntries([...FIT_NUMBERS, ...FIT_SWITCHES].map(key => [key, r[key]])) });
/** ShieldBot's checks (research's keys) to the Shield rows that set them. */
const SHIELD_CHECKS: Record<string, keyof ShieldRules> = { pro_holdings: 'proHolders', real_trading: 'washTrading', launch_jump: 'launchJump', launch_unread: 'launchJump', layered_launch: 'layered',
  launchpad: 'launchpads', transfer_fee: 'transferFee', smooth_climb: 'smoothClimb', self_made_pool: 'selfMadeDays', top10_held: 'top10', bundlers_bought: 'bundlersBought', rug_crew: 'crew', dev: 'dev', bundlers: 'bundlers', snipers: 'snipers',
  serial_creator: 'serialCreator', dumper: 'dumper', linked: 'linked', early: 'early', sameSize: 'sameSize', insider_profit: 'insiderProfit', dump_depth: 'dumpDepth' };
/** The rows of the rules no strategy changes, and of the pass mark, active trading and trading hours, by the keys the live counts use. */
const OTHER_ROWS: Record<string, { id: string; name: string }> = { fit: { id: 'passMark', name: 'Soft rules' }, activity: { id: 'activeTrading', name: 'Active trading' }, hours: { id: 'tradingHours', name: 'Trading hours' },
  authorities: { id: 'creatorControls', name: 'Creator controls' }, rugger: { id: 'poolPuller', name: FINAL.rugger }, meteora_launch: { id: 'meteoraLaunch', name: 'Meteora launch' } };
/** The setting row (its `data-setting` id) and name for a rule key of the live counts, the one the rules set where two rows share the key
 *  (a min and a max); a rule with no row has no id. */
function liveRow(check: string, rules: TeamRules): { id?: string; name: string } {
  const rows = CHECKS.filter(row => rulesOfCheck(check).includes(row.key)), row = rows.find(row => Number(rules[row.key] ?? 0) > 0) ?? rows[0];
  // A launch refusal comes from Extreme launch jump alone while Launch jump is off.
  const shield = SHIELD_CHECKS[check] === 'launchJump' && !shieldOf(rules).launchJump ? 'extremeJump' : SHIELD_CHECKS[check];
  return row ? { id: row.key, name: row.name } : shield ? { id: 'shield.' + shield, name: SHIELD_ROWS[shield].name } : OTHER_ROWS[check] ?? { name: checkLabel(check) };
}
/** What the live coins in the draft's streams say row by row (`missed`: how many miss the row's rules), and when nothing fits, the `blocker`:
 *  the rule that alone keeps out the most coins, with how many would fit without it, or with no such rule the one the fewest coins pass. */
function liveRows(fits: Fits | null | undefined, rules: TeamRules) {
  const counts = fits?.rules, rows = new Map<string, number>();
  if (!counts?.coins) return { coins: 0, rows, blocker: undefined };
  for (const [check, missed] of Object.entries(counts.misses)) { const { id } = liveRow(check, rules); if (id) rows.set(id, Math.max(rows.get(id) ?? 0, missed)); }
  const most = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const only = fits!.count ? undefined : most(counts.only), strictest = fits!.count || only ? undefined : most(counts.misses);
  const blocker: { id?: string; name: string; fit?: number; pass?: number } | undefined = only ? { ...liveRow(only[0], rules), fit: only[1] } : strictest ? { ...liveRow(strictest[0], rules), pass: counts.coins - strictest[1] } : undefined;
  return { coins: counts.coins, rows, blocker };
}
type Live = ReturnType<typeof liveRows>;
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
/** What a draft edits: a strategy, or one not made yet (a new strategy's start, before Start, which trades Practice: no `mode` or `loss`). */
export type DraftBase = Pick<StrategyRow, 'id' | 'name' | 'status' | 'rules' | 'dipPct'> & Partial<Pick<StrategyRow, 'mode' | 'loss'>>;
export function useSettingsDraft(strategy: DraftBase | undefined) {
  const signature = strategy ? stable([strategy.rules, strategy.dipPct]) : '';
  const [edits, setEdits] = useState<StrategyPatch>({}), [seen, setSeen] = useState(signature);
  if (seen !== signature) { setSeen(signature); setEdits({}); }
  if (!strategy) return null;
  const initial = strategy.rules, dip0 = strategy.dipPct;
  const patch = Object.fromEntries(Object.entries(edits).filter(([key, value]) => normal(key as keyof StrategyPatch, value) !== valueOf(initial, dip0, key as keyof StrategyPatch))) as StrategyPatch;
  // The page shows the rules exactly as the server will store them, and refuses to save what the server would refuse.
  let rules = initial, error: string | null = null;
  try { rules = applyPatch(initial, patch); validateRules(rules, patch.dipPct ?? dip0, strategy.mode === 'live'); } catch (cause) { error = cause instanceof Error ? cause.message : 'These rules can’t be saved.'; }
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
    : <Button size="sm" variant="secondary" onClick={onOpen}><SlidersHorizontal/>Settings{draft.dirty && <span className={s.unsavedDot} aria-label="unsaved changes"/>}</Button>;
}

export type Tab = 'search' | 'shield' | 'sniper' | 'trader' | 'budget';
export const TAB_KEYS: Record<Tab, (key: string) => boolean> = {
  search: key => CHECKS.some(row => row.key === key && row.group !== 'shield') || ['streams', 'mustHave', 'recheckMovePct', 'passMark', 'sweetMove1hLowPct', 'sweetMove1hHighPct'].includes(key),
  shield: key => CHECKS.some(row => row.key === key && row.group === 'shield') || ['shield', 'maxDevPercent', 'maxBundlersPercent', 'maxSnipersPercent'].includes(key),
  sniper: key => ['dipPct', 'askFirst', 'activeTrading', 'entryDelayMinutes', 'entryMaxUpPct', 'breakout', 'tradingHours', 'tradingDays', 'rebuy', 'skipTwinCoins'].includes(key),
  trader: key => ['exits', 'noTradeSeconds', 'drain', 'codeOnly'].includes(key),
  budget: key => ['budgetSol', 'tradeSol', 'maxOpen', 'maxPoolSharePct', 'lossStopPct', 'practiceStopPct'].includes(key),
};
/** Settings the Lab can't replay. */
export const UNREPLAYED = new Set(['askFirst', 'streams', 'codeOnly', 'skipTwinCoins', 'name']);
const pre = (row: CheckRow) => row.kind === 'usd' ? '$' : '';
const post = (row: CheckRow) => row.kind === 'pct' ? '%' : row.kind === 'x' ? '×' : '';
export const looserIsLower = (key: string) => !key.startsWith('max') && key !== 'launchJumpLimit' && key !== 'hourCrashLimit';

/** The checks a rule set has on: every check without an off state, and the removable ones set above zero. */
export function checksOn(rules: TeamRules) {
  return CHECKS.filter(row => (row.start === undefined || ((rules[row.key] as number | undefined) ?? 0) > 0));
}
/** The Search, Shield, Sniper, Trader and Budget tabs as rows, shared by Settings and the Lab. `evidence` and `labLoaded` say what each check turned
 *  down on the Lab's coins; `suggestOf` (the Lab) puts a check's suggested value beside its shield; `live` (Settings) marks a row whose rules
 *  no live coin passes, or that alone keeps out what would fit. An open row closes on a click anywhere outside it (a menu it opened counts as inside). */
export function useSettingsSections({ data, draft, open, setOpen, evidence, labLoaded, planDelta, suggestOf, live }: { data: HomeData; draft: SettingsDraft; open: string | null; setOpen: (key: string | null) => void;
  evidence: (row: CheckRow) => { n: number; doubled: number } | null; labLoaded: boolean; planDelta?: (id: string) => number | undefined; suggestOf?: (row: CheckRow) => ReactNode; live?: Live }) {
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
  /** A row's own line, or what the live coins say about it in the warning colour. */
  const note = (id: string, sub?: ReactNode) => {
    const missed = live?.rows.get(id), blocker = live?.blocker?.id === id ? live.blocker : undefined, coins = live?.coins.toLocaleString('en-US');
    const said = blocker?.fit !== undefined ? `${blocker.fit.toLocaleString('en-US')} would fit without it` : blocker || (missed !== undefined && missed >= live!.coins)
      ? `${blocker?.pass ? `Only ${blocker.pass.toLocaleString('en-US')}` : '0'} of ${coins} live coins pass` : undefined;
    return said ? { sub: said, warn: true } : { sub };
  };
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
      return <SettingRow key={row.key} id={row.key} {...toggle(row.key)} label="1h move" {...note(row.key, sub)} shield={mustIcon(row)} suggest={suggestOf?.(row)} onRemove={remove} changed={changed('maxMove1hPct', 'sweetMove1hLowPct', 'sweetMove1hHighPct')}
        value={<>best <Val editing={o} autoFocus value={low} kind="pct" label="Sweet spot from" post="%" onChange={n => set({ sweetMove1hLowPct: n, ...(n > high ? { sweetMove1hHighPct: n } : {}) })}/>–<Val editing={o} value={high} kind="pct" label="Sweet spot to" post="%" onChange={n => set({ sweetMove1hHighPct: Math.max(n, low), ...(n > limit ? { maxMove1hPct: n } : {}) })}/> · at most <Val editing={o} value={limit} kind="pct" label="Move it barely accepts" post="%" onChange={n => set({ maxMove1hPct: Math.max(n, high) })}/></>}/>;
    }
    return <SettingRow key={row.key} id={row.key} {...toggle(row.key)} label={row.name} {...note(row.key, sub)} shield={mustIcon(row)} suggest={suggestOf?.(row)} onRemove={remove} changed={changed(row.key)}
      value={row.kind === 'sec' ? <TimeVal kind="sec" editing={o} value={value(row)} min={row.min} max={row.max} steps={row.steps} label={row.name} onChange={n => set({ [row.key]: n })}/>
        : <Val editing={o} autoFocus value={value(row)} kind={row.kind} min={row.min} max={row.max} steps={row.steps} integer={row.integer} label={row.name} pre={pre(row)} post={post(row)} onChange={n => set({ [row.key]: n })}/>}>
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
      <SettingRow id="passMark" {...toggle('pass')} label="Soft rules pass at" {...note('passMark', 'Rules without a shield add up to a score; 100 meets them all')} changed={changed('passMark')}
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
    return <SettingRow key={key} id={'shield.' + key} label={row.name} {...note('shield.' + key, sh[key] ? row.on : row.off)} changed={shieldChanged(key)} control={<Switch checked={sh[key]} aria-label={row.name} onCheckedChange={checked => setShield({ [key]: checked })}/>}/>; };
  /** A parameter (a row with `parents`) is 0 only where its row names `zero`: it offers its steps, and only them where its value must be one. */
  const numberRow = (key: ShieldNumber) => {
    const row = SHIELD_ROWS[key], n = sh[key], param = Boolean(row.parents), zero = param ? row.zero : 'Off', post = row.unit === 'pct' ? '%' : row.unit === 'x' ? '×' : row.unit === 'sol' ? ' SOL' : '', id = 'shield:' + key, steps = zero ? [0, ...row.steps] : row.steps;
    return <SettingRow key={key} id={id.replace(':', '.')} {...toggle(id)} label={row.name} {...note(id.replace(':', '.'), n && !param ? `${row.before}${numText(row.unit, n)}${row.after}` : undefined)} leave={row.leave} changed={shieldChanged(key)}
      value={row.unit === 'min' ? <TimeVal kind={row.days ? 'days' : 'min'} editing={open === id} value={n} zero={zero} min={zero ? 0 : row.min} max={row.max} steps={steps} label={row.name} onChange={v => setShield({ [key]: v })}/>
        : <Val editing={open === id && !row.only} autoFocus value={n} kind={row.unit} zero={zero} min={zero ? 0 : row.min} max={row.max} integer={row.integer} steps={steps} label={row.name} post={post} onChange={v => setShield({ [key]: v })}/>}>
      <QuickPicks options={steps.map(v => ({ value: v, text: v ? `${numText(row.unit, v)}${post}` : zero ?? 'Off' }))} value={n} onPick={v => setShield({ [key]: v })}/>
    </SettingRow>;
  };
  const holdingRow = (key: ShieldHolding) => {
    const row = SHIELD_ROWS[key], h = sh[key], id = 'shield:' + key, setHolding = (change: Partial<Holding>) => setShield({ [key]: { ...h, ...change } });
    const sub = holdingOn(h) ? [h.weighAbove ? `Counts against a coin over ${h.weighAbove}%` : '', h.refuseAt ? `skips it at ${h.refuseAt}%` : ''].filter(Boolean).join(', ') + ` of supply held by ${row.who}` : `Off: what ${row.who} hold isn't checked`;
    return <SettingRow key={key} id={id.replace(':', '.')} {...toggle(id)} label={row.name} {...note(id.replace(':', '.'), sub)} changed={shieldChanged(key)}
      value={<>over <Val editing={open === id} autoFocus value={h.weighAbove} kind="pct" zero="off" min={0} max={100} label={`${row.name}: counts against over`} post="%" onChange={n => setHolding({ weighAbove: n })}/> · skip <Val editing={open === id} value={h.refuseAt} kind="pct" zero="off" min={0} max={100} label={`${row.name}: skips at`} post="%" onChange={n => setHolding({ refuseAt: n })}/></>}>
      <QuickPicks label="Counts against it over" options={[0, 10, 25, 40].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={h.weighAbove} onPick={n => setHolding({ weighAbove: n })}/>
      <QuickPicks label="Skips it at" options={[0, 30, 50, 60].map(n => ({ value: n, text: n ? `${n}%` : 'Off' }))} value={h.refuseAt} onPick={n => setHolding({ refuseAt: n })}/>
    </SettingRow>;
  };
  // The launchpads it trades, picked like the streams: a picked launchpad is traded, the rest are skipped, and one stays picked.
  const pads = sh.launchpads, skipped = TRADED_LAUNCHPADS.filter(id => !pads.includes(id)).map(id => LAUNCHPAD_NAMES[id]);
  const togglePad = (id: Launchpad) => pads.includes(id) ? pads.length > 1 && setShield({ launchpads: pads.filter(row => row !== id) }) : setShield({ launchpads: TRADED_LAUNCHPADS.filter(row => row === id || pads.includes(row)) });
  const launchpadsRow = <SettingRow id="shield.launchpads" {...toggle('shield:launchpads')} label={SHIELD_ROWS.launchpads.name} {...note('shield.launchpads', skipped.length ? `Skips ${skipped.join(' and ')} launches` : 'Trades every launchpad')} changed={shieldChanged('launchpads')}
    value={<span className={s.valText}>{pads.map(id => LAUNCHPAD_NAMES[id]).join(', ')}</span>}>
    <span className={s.seg} role="group" aria-label="Launchpads it trades">{TRADED_LAUNCHPADS.map(id => <button type="button" key={id} aria-pressed={pads.includes(id)} disabled={pads.includes(id) && pads.length === 1} onClick={() => togglePad(id)}>{LAUNCHPAD_NAMES[id]}</button>)}</span>
  </SettingRow>;
  // The insider groups the insider sale counts, picked like the launchpads: one stays picked.
  const sale = sh.saleGroups;
  const toggleSale = (id: InsiderGroup) => sale.includes(id) ? sale.length > 1 && setShield({ saleGroups: sale.filter(group => group !== id) }) : setShield({ saleGroups: INSIDER_GROUPS.filter(group => group === id || sale.includes(group)) });
  const insidersRow = <SettingRow key="saleGroups" id="shield.saleGroups" {...toggle('shield:saleGroups')} label={SHIELD_ROWS.saleGroups.name} {...note('shield.saleGroups')} changed={shieldChanged('saleGroups')}
    value={<span className={s.valText}>{sale.map(id => INSIDER_NAMES[id]).join(', ')}</span>}>
    <span className={s.seg} role="group" aria-label="Insiders it counts">{INSIDER_GROUPS.map(id => <button type="button" key={id} aria-pressed={sale.includes(id)} disabled={sale.includes(id) && sale.length === 1} onClick={() => toggleSale(id)}>{INSIDER_NAMES[id]}</button>)}</span>
  </SettingRow>;
  const shieldOn = (key: keyof ShieldRules) => { const row: ShieldRow = SHIELD_ROWS[key], v = sh[key]; return row.kind === 'holding' ? holdingOn(v as Holding) : row.kind === 'number' ? (v as number) > 0 : v === true; };
  /** The parameters of the checks that end with `after` (`SHIELD_ROWS` `parents`), nested under it while one of their checks is on. */
  const params = (after: keyof ShieldRules) => {
    const keys = (Object.keys(SHIELD_ROWS) as (keyof ShieldRules)[]).filter(key => parentsOf(key).at(-1) === after), parents = keys.length ? parentsOf(keys[0]!) : [];
    if (!parents.some(shieldOn)) return null;
    return <div className={s.setParams}>{keys.map(key => { const row: ShieldRow = SHIELD_ROWS[key]; return row.kind === 'switch' ? switchRow(key as ShieldSwitch) : row.kind === 'insiders' ? insidersRow : numberRow(key as ShieldNumber); })}</div>;
  };
  // ShieldBot's checks that were research checks keep their own fields, on with a value or off at 0.
  const offRow = (key: CheckRow['key']) => { const row = CHECKS.find(check => check.key === key)!, steps = [0, ...row.steps];
    return <SettingRow key={key} id={key} {...toggle(key)} label={row.name} {...note(key, value(row) ? checkText(row, value(row)).trim() : row.off)} shield={row.must ? mustIcon(row) : undefined} changed={changed(key)} suggest={suggestOf?.(row)}
      value={<Val editing={open === key} autoFocus value={value(row)} kind={row.kind} zero="Off" min={0} max={row.max} integer={row.integer} steps={steps} label={row.name} pre={pre(row)} post={post(row)} onChange={n => set({ [key]: n })}/>}>
      <QuickPicks options={steps.map(n => ({ value: n, text: n ? `${pre(row)}${numText(row.kind, n)}${post(row)}` : 'Off' }))} value={value(row)} onPick={n => set({ [key]: n })}/>
    </SettingRow>; };
  const locked = (id: string, label: string, sub: string) => <SettingRow key={label} id={id} label={label} {...note(id, sub)} shield={<Shield on fixed label={label}/>}/>;
  const shield = <>
    <div className={s.setGroup}>
      {numberRow('proHolders')}
      {switchRow('washTrading')}
    </div>
    <div className={s.setGroup}>
      {numberRow('launchJump')}
      {params('launchJump')}
      {switchRow('layered')}
      {launchpadsRow}
      {switchRow('smoothClimb')}
      {offRow('hourCrashLimit')}
      {numberRow('selfMadeDays')}
    </div>
    <div className={s.setGroup}>
      {numberRow('top10')}
      {numberRow('bundlersBought')}
      {params('bundlersBought')}
      {holdingRow('dev')}
      {holdingRow('bundlers')}
      {holdingRow('snipers')}
      {offRow('minLpBurnPct')}
    </div>
    <div className={s.setGroup}>
      {numberRow('serialCreator')}
      {params('serialCreator')}
      {numberRow('dumper')}
      {params('dumper')}
      {holdingRow('linked')}
      {holdingRow('early')}
      {params('early')}
      {holdingRow('sameSize')}
      {params('sameSize')}
      {numberRow('crew')}
      {numberRow('insiderProfit')}
      {numberRow('dumpDepth')}
      {params('dumpDepth')}
    </div>
    <div className={s.setGroup}>
      {locked('creatorControls', 'Creator controls', 'Mint and freeze revoked before research')}
      {locked('poolPuller', FINAL.rugger, 'Skips coins from a deployer who pulled a pool before')}
      {locked('meteoraLaunch', 'Meteora launch', 'Skips coins launched on Meteora’s curve')}
      {locked('drainedPool', 'Drained pool', 'Sells a held coin whose pool is drained, and lists its deployer')}
    </div>
    <div className={s.setGroup}>
      {numberRow('extremeJump')}
      {params('extremeJump')}
    </div>
  </>;

  // ---- Sniper ----
  const rebuy = rules.rebuy, rebuyDirection = rebuy?.direction ?? 'pullback', setRebuy = (change: Partial<RebuyRules>) => set({ rebuy: { ...rebuy!, ...change } });
  const breakout = rules.breakout, setBreakout = (change: Partial<BreakoutRules>) => set({ breakout: { ...breakout!, ...change } });
  // Active trading's three numbers are boxes in its row on a wide screen; a phone has no room for them and sets them with the picks.
  const active = rules.activeTrading, setActive = (change: Partial<ActiveTrading>) => set({ activeTrading: { ...active!, ...change } });
  const hours = rules.tradingHours, setHours = (change: Partial<TradingHours>) => set({ tradingHours: { ...hours!, ...change } });
  const days: number[] = rules.tradingDays ?? [...WEEKDAYS];
  const copy = Boolean(data.strategies.find(row => row.id === strategy.id)?.twinId);
  // A day stays picked when it is the last one; all seven is every day.
  const toggleDay = (day: number) => { const next = days.includes(day) ? days.filter(row => row !== day) : [...days, day]; if (next.length) set({ tradingDays: next.length === WEEKDAYS.length ? null : next.sort((a, b) => a - b) }); };
  const sniper = <>
    <div className={s.setGroup}>
      <SettingRow id="dipPct" {...toggle('dip')} label="Buys" sub="SniperBot buys once research passes a coin, or waits for a dip under the pick" changed={changed('dipPct')}
        value={<Val editing={open === 'dip'} autoFocus value={dip} kind="pct" zero="Right away" min={0} max={50} steps={[0, 2, 5, 10, 15]} label="Dip under the pick" pre="−" post="% dip" onChange={n => set({ dipPct: n })}/>}>
        <QuickPicks options={[0, 2, 5, 10].map(n => ({ value: n, text: n ? `${n}% dip` : 'Right away' }))} value={dip} onPick={n => set({ dipPct: n })}/>
      </SettingRow>
      <SettingRow id="activeTrading" {...(active ? toggle('active') : {})} label="Active trading" {...note('activeTrading')} changed={changed('activeTrading')}
        value={active ? <>
          <Val editing={open === 'active' && !phone} autoFocus value={active.lastSwapSeconds} kind="sec" min={ACTIVE_TRADING.lastSwapSeconds[0]} max={ACTIVE_TRADING.lastSwapSeconds[1]} integer steps={[...ACTIVE_TRADING.picks.lastSwapSeconds]} label="Last swap within, seconds" pre="≤ " onChange={n => setActive({ lastSwapSeconds: n })}/>{' · '}
          <Val editing={open === 'active' && !phone} value={active.buckets} kind="count" min={ACTIVE_TRADING.buckets[0]} max={ACTIVE_TRADING.buckets[1]} integer steps={[...ACTIVE_TRADING.picks.buckets]} label="Five-second intervals with a trade in the last minute" post={`/${ACTIVE_TRADING.buckets[1]}`} onChange={n => setActive({ buckets: n })}/>{' · '}
          <Val editing={open === 'active' && !phone} value={active.buyers} kind="count" min={ACTIVE_TRADING.buyers[0]} max={ACTIVE_TRADING.buyers[1]} integer steps={[...ACTIVE_TRADING.picks.buyers]} label="Buyers in the last minute" post=" buyers" zero="Any buyers" onChange={n => setActive({ buyers: n })}/>
        </> : undefined}
        control={<Switch checked={Boolean(active)} aria-label="Active trading" onCheckedChange={checked => set({ activeTrading: checked ? ACTIVE_TRADING.start : null })}/>}>
        {active && <>
          <QuickPicks label="Last swap" options={ACTIVE_TRADING.picks.lastSwapSeconds.map(n => ({ value: n as number, text: `≤ ${numText('sec', n)}` }))} value={active.lastSwapSeconds} onPick={n => setActive({ lastSwapSeconds: n })}/>
          <QuickPicks label="Active intervals" options={ACTIVE_TRADING.picks.buckets.map(n => ({ value: n as number, text: `${n}/${ACTIVE_TRADING.buckets[1]}` }))} value={active.buckets} onPick={n => setActive({ buckets: n })}/>
          <QuickPicks label="Buyers" options={ACTIVE_TRADING.picks.buyers.map(n => ({ value: n as number, text: n ? String(n) : 'Any' }))} value={active.buyers} onPick={n => setActive({ buyers: n })}/>
        </>}
      </SettingRow>
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
      <SettingRow id="breakout" label="Breakout" sub={breakout ? breakoutText(breakout) : undefined} changed={changed('breakout')}
        control={<Switch checked={Boolean(breakout)} aria-label="Breakout" onCheckedChange={checked => set(checked ? { breakout: BREAKOUT_START, dipPct: 0, entryDelayMinutes: 0 } : { breakout: null })}/>}/>
      {breakout && <>
        <SettingRow id="breakout.minutes" {...toggle('breakoutMinutes')} label="Range over"
          value={<Val editing={open === 'breakoutMinutes'} autoFocus value={breakout.minutes} kind="min" min={BREAKOUT.minutes[0]} max={BREAKOUT.minutes[1]} integer steps={[...BREAKOUT_CHOICES.minutes]} label="Minutes the range reads" onChange={n => setBreakout({ minutes: n })}/>}>
          <QuickPicks options={BREAKOUT_CHOICES.minutes.map(n => ({ value: n as number, text: `${n} min` }))} value={breakout.minutes} onPick={n => setBreakout({ minutes: n })}/>
        </SettingRow>
        <SettingRow id="breakout.rangePct" {...toggle('breakoutRange')} label="Quiet within"
          value={<Val editing={open === 'breakoutRange'} autoFocus value={breakout.rangePct} kind="pct" min={BREAKOUT.rangePct[0]} max={BREAKOUT.rangePct[1]} steps={[...BREAKOUT_CHOICES.rangePct]} label="Range high over its low" post="%" onChange={n => setBreakout({ rangePct: n })}/>}>
          <QuickPicks options={BREAKOUT_CHOICES.rangePct.map(n => ({ value: n as number, text: `${n}%` }))} value={breakout.rangePct} onPick={n => setBreakout({ rangePct: n })}/>
        </SettingRow>
        <SettingRow id="breakout.buyers" {...toggle('breakoutBuyers')} label="Buyers in the last minute"
          value={<Val editing={open === 'breakoutBuyers'} autoFocus value={breakout.buyers} kind="count" zero="Any" min={BREAKOUT.buyers[0]} max={BREAKOUT.buyers[1]} integer steps={[...BREAKOUT_CHOICES.buyers]} label="Wallets buying in the last minute" onChange={n => setBreakout({ buyers: n })}/>}>
          <QuickPicks options={BREAKOUT_CHOICES.buyers.map(n => ({ value: n as number, text: n ? String(n) : 'Any' }))} value={breakout.buyers} onPick={n => setBreakout({ buyers: n })}/>
        </SettingRow>
      </>}
    </div>
    <div className={s.setGroup}>
      <SettingRow id="tradingHours" {...(hours ? toggle('hours') : {})} label="Trading hours" {...note('tradingHours')} changed={changed('tradingHours')}
        value={hours ? <><Val editing={open === 'hours'} autoFocus value={hours.from} kind="count" min={0} max={23} integer label="From hour, UTC" onChange={n => setHours({ from: n })}/>–<Val editing={open === 'hours'} value={hours.to} kind="count" min={0} max={23} integer label="To hour, UTC" post=" UTC" onChange={n => setHours({ to: n })}/></> : undefined}
        control={<Switch checked={Boolean(hours)} aria-label="Trading hours" onCheckedChange={checked => set({ tradingHours: checked ? HOURS_START : null })}/>}>
        {hours && <QuickPicks options={HOUR_WINDOWS.map(window => ({ value: window, text: hoursText(window) }))} value={hours} onPick={window => set({ tradingHours: window })}/>}
      </SettingRow>
      <SettingRow id="tradingDays" {...toggle('days')} label="Trading days" changed={changed('tradingDays')} value={<span className={s.valText}>{rules.tradingDays ? daysText(rules.tradingDays) : 'Every day'}</span>}>
        <span className={s.seg} role="group" aria-label="Days it buys, UTC">{WEEKDAYS.map(day => <button type="button" key={day} aria-pressed={days.includes(day)} disabled={days.includes(day) && days.length === 1} onClick={() => toggleDay(day)}>{WEEKDAY_NAMES[day]}</button>)}</span>
      </SettingRow>
    </div>
    <div className={s.setGroup}>
      {copy && <SettingRow id="skipTwinCoins" label="Skip Practice’s coins" changed={changed('skipTwinCoins')} control={<Switch checked={rules.skipTwinCoins === true} aria-label="Skip Practice’s coins" onCheckedChange={checked => set({ skipTwinCoins: checked })}/>}/>}
      <SettingRow id="rebuy" label="Re-buys" sub={rebuy ? rebuyWords(rebuy) : 'Off: a coin this strategy traded never comes back to it'} changed={changed('rebuy')} control={<Switch checked={Boolean(rebuy)} aria-label="Re-buys" onCheckedChange={checked => set({ rebuy: checked ? REBUY_START : null })}/>}/>
      {rebuy && <>
        <SettingRow id="rebuy.direction" {...toggle('direction')} label="Re-buy on" value={<span className={s.valText}>{DIRECTION_NAMES[rebuyDirection]}</span>}>
          <QuickPicks<RebuyDirection> options={REBUY_DIRECTIONS.map(v => ({ value: v, text: DIRECTION_NAMES[v] }))} value={rebuyDirection} onPick={v => setRebuy({ direction: v })}/>
        </SettingRow>
        {rebuyDirection !== 'continuation' && <>
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
        </>}
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
  const noTrade = noTradeOf(rules), drain = rules.drain, setDrain = (change: Partial<DrainRules>) => set({ drain: { ...drain!, ...change } });
  const trader = <>
    <div className={s.setGroup}><ExitPlanRows plan={rules.exits} initial={initial.exits} onChange={exits => set({ exits })} onTrail={pct => set({ stopLossPct: pct })} open={open} onOpen={setOpen} planDelta={planDelta}
      saved={savedPlans} onSave={async exits => await command({ type: 'saveExitPlan', exits }) !== false} onForget={name => void command({ type: 'forgetExitPlan', name })}/></div>
    <div className={s.setGroup}>
      <SettingRow id="noTradeSeconds" {...toggle('noTrade')} label="No trades for" changed={changed('noTradeSeconds')}
        value={<Val editing={open === 'noTrade'} autoFocus value={noTrade ?? 0} kind="sec" zero="Off" min={0} max={NO_TRADE.max} integer steps={[0, ...NO_TRADE.picks, NO_TRADE.max]} label="Seconds with no trade, 0 off" onChange={n => set({ noTradeSeconds: n ? Math.max(NO_TRADE.min, n) : null })}/>}>
        <QuickPicks<number | null> options={[...NO_TRADE.picks.map(n => ({ value: n as number | null, text: numText('sec', n) })), { value: null, text: 'Off' }]} value={noTrade} onPick={n => set({ noTradeSeconds: n })}/>
      </SettingRow>
      <SettingRow id="drain" {...(drain ? toggle('drain') : {})} label="Draining" changed={changed('drain')}
        value={drain ? <><Val editing={open === 'drain'} autoFocus value={drain.dropPct} kind="pct" min={DRAIN.min} max={DRAIN.max} steps={[...DRAIN.picks]} label="Drop at the last trade" pre="−" post="%" onChange={dropPct => setDrain({ dropPct })}/>{` in ${numText('min', drain.minutes)}`}</> : undefined}
        control={<Switch checked={Boolean(drain)} aria-label="Draining" onCheckedChange={checked => set({ drain: checked ? DRAIN.start : null })}/>}>
        {drain && <>
          <QuickPicks label="Drop" options={DRAIN.picks.map(n => ({ value: n as number, text: `−${n}%` }))} value={drain.dropPct} onPick={dropPct => setDrain({ dropPct })}/>
          <QuickPicks label="Over" options={DRAIN_MINUTES.map(n => ({ value: n as DrainMinutes, text: numText('min', n) }))} value={drain.minutes} onPick={minutes => setDrain({ minutes })}/>
        </>}
      </SettingRow>
    </div>
    <div className={s.setGroup}>
      <SettingRow id="codeOnly" {...(codeOnlyOf(rules) ? toggle('codeOnly') : {})} label="Code only" sub={CODE_ONLY_FOR_ALL ? 'Locked on for every strategy for now' : codeOnlyOf(rules) ? 'No AI decides a trade' : 'TraderBot’s AI reviews can sell before the exit plan and settle asks'} changed={changed('codeOnly')}
        control={<Switch checked={codeOnlyOf(rules)} disabled={CODE_ONLY_FOR_ALL} aria-label="Code only" onCheckedChange={checked => set({ codeOnly: checked })}/>}>
        {codeOnlyOf(rules) && (['rules', 'ai'] as const).map(side => <div key={side} className={s.quick}>
          <small>{side === 'rules' ? 'Rules decide' : 'AI answers, never trades'}</small>
          <span className={s.evidence}>{CODE_ONLY_SPLIT[side].map(row => <span key={row.text} className={s.laneChip}>{row.bot === 'shield' ? <ShieldCheck size={16} aria-hidden/> : <BotAvatar role={row.bot} size={18}/>}{row.text}</span>)}</span>
        </div>)}
      </SettingRow>
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
      {strategy.mode === 'live' && <LossStopRow draft={draft} {...toggle('lossStop')}/>}
      {strategy.mode === 'paper' && <PracticeStopRow draft={draft} twin={hasCopy(data, strategy.id)} {...toggle('practiceStop')}/>}
    </div>
    {phone && saved && <div className={s.settingsArchive}><ArchiveStrategyButton data={data} strategy={saved} block/></div>}
  </>;

  return { search, shield, sniper, trader, budget };
}

export function SettingsEditor({ data, draft, onClose, start }: { data: HomeData; draft: SettingsDraft; onClose?: () => void; start?: { label: string; busy: boolean; onStart: () => void; name: string; onRename: (name: string) => void; real?: { on: boolean; onChange: (on: boolean) => void }; sameAs?: string } }) {
  const command = useCommand(), openCheck = useSetAtom(checkCoinAtom), phone = usePhone();
  const { strategy, patch, rules, dirty, dip, set } = draft, error = draft.error, same = start?.sameAs ? `Same rules as ${start.sameAs}` : null, initial = strategy.rules, name = start?.name ?? strategy.name, saved = start ? undefined : data.strategies.find(row => row.id === strategy.id);
  const [renaming, setRenaming] = useState(false), [typed, setTyped] = useState('');
  // A new strategy keeps its name until Start; a saved one renames at once, as on its page.
  const rename = () => {
    const next = typed.trim();
    setRenaming(false);
    if (!next || next === name) return;
    if (start) start.onRename(next); else void command({ type: 'update', strategyId: strategy.id, patch: { name: next } });
  };
  const [view, setView] = useAtom(settingsViewAtom), setEditing = useSetAtom(settingsEditingAtom);
  // On a phone the editor's Reset/Save bar takes the tab bar's place while the editor is open (MobileNav slides it away).
  const editing = phone;
  useEffect(() => { setEditing(editing); return () => setEditing(false); }, [editing, setEditing]);
  const [tab, setTab] = useState<Tab>('search'), [open, setOpen] = useState<string | null>(null), [skipped, setSkipped] = useState<string[]>([]);
  const tabs: { id: Tab; name: string }[] = [{ id: 'search', name: 'Search' }, { id: 'shield', name: 'Shield' }, { id: 'sniper', name: 'Sniper' }, { id: 'trader', name: 'Trader' }, { id: 'budget', name: 'Budget' }];
  const tabChanged = (id: Tab) => Object.keys(patch).some(TAB_KEYS[id]);

  // ---- The replay: the saved rules and the draft on the Lab's coins, each change alone, and the tips (the server Lab, labData.ts) ----
  const lab = useLabData(), on = checksOn(rules), tipRows = on.filter(row => !row.noReplay), proposal = useAtomValue(draftProposalAtom);
  const singles = (Object.keys(patch) as (keyof StrategyPatch)[]).filter(key => key !== 'sweetMove1hLowPct' && key !== 'sweetMove1hHighPct' && !UNREPLAYED.has(key))
    .map(key => ({ key, patch: { [key]: patch[key], ...(key === 'maxMove1hPct' ? { sweetMove1hLowPct: patch.sweetMove1hLowPct, sweetMove1hHighPct: patch.sweetMove1hHighPct } : {}) } as StrategyPatch }));
  // Example trades: an admin's chart button opens them, and only then does the replay make them.
  const admin = useAtomValue(isAdminAtom), [charts, setCharts] = useState(false), showExamples = admin && charts;
  const run = useLab(lab.data, { strategyId: strategy.id, since: 0, saved: { rules: initial, dip: strategy.dipPct }, draft: { rules, dip }, plans: true, ...(showExamples ? { examples: true } : {}), singles,
    tips: tipRows.map(row => ({ key: row.key, steps: row.steps, removable: row.start !== undefined, looserIsLower: looserIsLower(row.key) })),
    ...(proposal ? { proposal } : {}) });
  const now = run.main?.now, next = run.main?.next, tips = run.tips;
  const evidence = (row: CheckRow) => { const groups = (run.main?.down ?? []).filter(group => rulesOfCheck(group.check).includes(row.key)); return groups.length ? { n: groups.reduce((sum, g) => sum + g.count, 0), doubled: groups.reduce((sum, g) => sum + g.doubled, 0) } : null; };

  const planDelta = next && run.main?.plans ? (id: string) => { const row = run.main!.plans!.find(plan => plan.id === id); return row ? row.result.totalSol - next.totalSol : undefined; } : undefined;
  const fit = useFits(rules), live = liveRows(fit.fits, rules);
  const { search, shield, sniper, trader, budget } = useSettingsSections({ data, draft, open, setOpen, evidence, labLoaded: Boolean(lab.data), planDelta, live });

  // Settings stay open after a save: the saved rules come back as the draft's new base, so the button reads Saved and the next change starts there.
  const { save, saving, confirm } = useStrategySave(draft);
  const count = changedKeys(patch, rules).length;
  const saveLabel = dirty ? `Save ${count} ${count === 1 ? 'change' : 'changes'}` : 'Saved';

  // ---- HOTBOT's ideas from the same replay, in both views: the best rule step and an Easy plan that beat the draft (`SUGGEST`), or why
  // none does. Then Easy's result and one button ----
  const days = lab.data ? labDays(lab.data) : null;
  const ideas: Suggestion[] = [];
  const step = next && bestTip(tips, next, skipped), stepRow = step && CHECKS.find(check => check.key === step.tip.key);
  if (step && stepRow) {
    const to = numText(stepRow.kind, step.variant.value), remove = `Remove ${stepRow.name.toLowerCase()}`;
    ideas.push({ key: `${step.tip.key}:${step.variant.value}`, title: step.variant.value === 0 ? remove : `${stepRow.name} ${to}`, gainSol: step.gain, row: stepRow.key, patch: () => ({ [step.tip.key]: step.variant.value }),
      change: step.variant.value === 0 ? remove : `${stepRow.name}: ${numText(stepRow.kind, (rules[stepRow.key] as number | undefined) ?? 0)} → ${to}` });
  }
  const current = planOf(rules.exits), plans = next ? EASY_PLANS.filter(row => row.id !== current).flatMap(row => {
    const replayed = run.main?.plans?.find(plan => plan.id === row.id)?.result;
    return replayed ? [{ id: row.id, gain: replayed.totalSol - next.totalSol, picks: replayed.picks }] : [];
  }) : [];
  const plan = plans.filter(row => !skipped.includes(`plan:${row.id}`) && changeWorth(row.gain, row.picks)).sort((a, b) => b.gain - a.gain)[0];
  if (plan) ideas.push({ key: `plan:${plan.id}`, title: `Take profit: ${easyPlanName(plan.id)}`, change: `Exit plan: ${EXIT_PLANS[plan.id].exits.name}`, gainSol: plan.gain, row: 'plan', patch: base => ({ exits: exitsWith(base.exits, { plan: EXIT_PLANS[plan.id].exits }) }) });
  ideas.sort((a, b) => b.gainSol - a.gainSol);
  // A failed main answer (the newest request still has none) or meta read leaves the result nothing to show; a failed tips request leaves it standing.
  const resultError = lab.error ?? (run.error && run.pending ? run.error : null);
  // The tips come after the main answer, one for each tip row.
  const fresh: { ideas: Suggestion[]; why: NoIdea } = resultError ? { ideas: [], why: { kind: 'unavailable', days, error: resultError, inResult: true } } : { ideas, why: run.error ? { kind: 'unavailable', days, error: run.error, inResult: false }
    : !next || (tipRows.length > 0 && !tips.size) ? { kind: 'looking', days }
    : next.picks < SUGGEST.picks ? { kind: 'few', days, picks: next.picks }
    : { kind: 'none', days, picks: next.picks, steps: [...tips.values()].reduce((sum, tip) => sum + tip.variants.length, 0), plans: plans.length, skipped: skipped.length > 0 } };
  // While a change replays, the last settled ideas or reason stay, so nothing jumps under the person's finger; one they acted on drops out,
  // and Apply builds its patch on the draft as it is then.
  const settled = useRef<typeof fresh | null>(null);
  useEffect(() => { if (fresh.why.kind !== 'looking') settled.current = fresh; });
  const shown = fresh.why.kind === 'looking' && settled.current ? { ideas: settled.current.ideas.filter(idea => !skipped.includes(idea.key)), why: settled.current.why } : fresh;
  const apply = (idea: Suggestion) => { set(idea.patch(rules)); setSkipped(list => [...list, idea.key]); }, skip = (idea: Suggestion) => setSkipped(list => [...list, idea.key]);
  // The one button: Save, or Start for a strategy not made yet.
  const go = start ? { label: start.label, busy: start.busy, off: start.busy || Boolean(error) || Boolean(same), run: start.onStart }
    : { label: saveLabel, busy: saving, off: !dirty || saving || Boolean(error), run: () => void save() };
  const action = <div className={s.easyAction}>
    <EasyAsk draft={draft}/>
    {error ? <span className={s.warnText}>{error}</span> : same && <span className={`${s.muted} ${s.small}`}>{same}</span>}
    <Button size="lg" className={s.easyGo} disabled={go.off} onClick={go.run}>{go.busy ? <LoaderCircle className="animate-spin"/> : null}{go.label}</Button>
    {dirty && <Button size="sm" variant="ghost" onClick={draft.reset}>{start ? 'Reset' : 'Discard'}</Button>}
  </div>;
  const lines = dirty ? describeChanges(patch, initial, rules, strategy.dipPct) : [];

  // In the body: the editor sits in size containers, and Safari makes those the containing block of a fixed bar.
  const bar = editing && createPortal(<div className={s.mBar} data-edit role="status">
    <button type="button" className={s.mSide} aria-label="Reset changes" disabled={!dirty} onClick={draft.reset}><Undo2/></button>
    <div className={s.mPill} data-warn={error ? true : undefined}><div className={s.mLine}><small>{error ? 'Can’t save yet' : same ?? (start ? 'New strategy' : dirty ? `${count} ${count === 1 ? 'change' : 'changes'}` : 'Saved')}</small><span>{error ?? (dirty && !start ? lines.join(' · ') : name)}</span></div></div>
    <button type="button" className={s.mSave} disabled={go.off} onClick={go.run}>{go.busy ? <Check/> : start ? 'Start' : 'Save'}</button>
  </div>, document.body);
  // The views slide in from their side of the switch (Easy left, Advanced right), only once someone has switched, so a page load doesn't slide.
  const [switched, setSwitched] = useState(false), slide = switched ? view : undefined;
  const pick = (id: typeof view) => { setView(id); setOpen(null); setSwitched(true); };
  const examples = showExamples && !resultError && <TradeExamples examples={run.main?.examples} days={days} onOpen={mint => openCheck({ query: mint, strategyId: strategy.id })}/>;
  const easy = <EasyEditor draft={draft} open={open} setOpen={setOpen} askInRows={phone} twin={hasCopy(data, draft.strategy.id)} examples={examples}/>;

  // ---- HOTBOT: what is on screen goes with each request, its proposal replays on the draft, and it points at rows ----
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
  const context = () => root.current ? JSON.stringify(settingsContext({ root: root.current, draft, name, start: Boolean(start), view, tab, lines, days, now, next, singles: run.main?.singles, ideas: shown.ideas, plans: run.main?.plans, lab })) : null;
  const replayed = run.main?.proposal && next ? { key: run.main.proposal.key, sol: run.main.proposal.result.totalSol, picks: run.main.proposal.result.picks, mean: run.main.proposal.result.mean,
    base: { sol: next.totalSol, picks: next.picks, mean: next.mean } } : null;
  // The bridge holds functions over this render's state, so it is published again on every render; the dock reads it only when it asks.
  useEffect(() => { setBridge({ page: 'settings', name, rules, dip, patch, context, replayed, show, apply: change => { if (change.exitPlan !== undefined) draft.drop(['exits']); set(change); }, drop: draft.drop }); });
  useEffect(() => () => setBridge(null), [setBridge]);
  // Both views share the column beside the rows (under them on a narrow frame): the result, HOTBOT's ideas, what fits now and the button.
  // Advanced names an idea from → to and opens its row once it is in the draft.
  const advanced = view === 'advanced';
  const side = <aside className={s.editorSide} aria-label="What these settings would have made">
    <Outcome error={resultError} days={days} now={now} next={next} singles={run.main?.singles} draft={draft} onUndo={keys => draft.drop(keys)}/>
    <Ideas ideas={shown.ideas} why={shown.why} advanced={advanced} onSkip={skip} onApply={idea => {
      apply(idea);
      if (advanced) { setTab(tabs.find(t => TAB_KEYS[t.id](Object.keys(idea.patch(rules))[0]))?.id ?? 'search'); setOpen(idea.row); }
    }}/>
    <FitNow fit={fit} blocker={live.blocker} onOpen={token => openCheck({ query: token, strategyId: strategy.id })} onShow={id => show([id])}/>
    {!phone && action}
  </aside>;

  return <section ref={root} className={s.editorShell} aria-label={`${name} settings`}>
    <header className={s.editorTop}>
      {renaming
        ? <form className={`${s.editorTitle} ${s.nameEdit}`} onSubmit={event => { event.preventDefault(); rename(); }}><input autoFocus value={typed} maxLength={60} aria-label="Strategy name" onFocus={event => event.currentTarget.select()} onChange={event => setTyped(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }}/></form>
        : <h1 className={s.editorTitle}><b>{name}</b><button type="button" className={s.pencil} aria-label="Rename" onClick={() => { setTyped(name); setRenaming(true); }}><Pencil/></button>{!start && <StrategyStatus status={strategy.status} stopped={strategy.loss?.stoppedAt != null}/>}</h1>}
      <Tabs value={view} onValueChange={id => pick(id as typeof view)} className={s.viewTabs}>
        <TabsList variant="line" aria-label="Settings view"><TabsTrigger value="easy">Easy</TabsTrigger><TabsTrigger value="advanced">Advanced</TabsTrigger></TabsList>
      </Tabs>
      <div className={s.editorActions}>
        {admin && <button type="button" className={s.headRound} aria-label="Example trades" aria-pressed={charts} data-active={charts || undefined} onClick={() => setCharts(open => !open)}><ChartCandlestick/></button>}
        {saved && <RealSolCopies data={data} only={saved}/>}
        {start?.real && <label className={s.editorReal}><Switch variant="accent" checked={start.real.on} onCheckedChange={start.real.onChange}/>Real SOL</label>}
        {onClose && <button type="button" className={s.headRound} aria-label={start ? 'Back' : 'Close settings'} onClick={onClose}><X/></button>}
      </div>
    </header>
    {view === 'easy' ? <div className={s.editorBody} data-slide={slide}><div className={s.editorMain}>{easy}</div>{side}</div>
    : <Tabs value={tab} onValueChange={value => { setTab(value as Tab); setOpen(null); }} data-slide={slide} className={`${s.editorTabs} grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-0`}>
      <TabsList variant="line" aria-label="Settings sections">{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.name}{tabChanged(t.id) && <span className={s.unsavedDot} aria-label="changed"/>}</TabsTrigger>)}</TabsList>
      <div className={s.editorBody}>
        <div className={s.editorMain}>
          {examples}
          <TabsContent value="search">{search}</TabsContent>
          <TabsContent value="shield">{shield}</TabsContent>
          <TabsContent value="sniper">{sniper}</TabsContent>
          <TabsContent value="trader">{trader}</TabsContent>
          <TabsContent value="budget">{budget}</TabsContent>
        </div>
        {side}
      </div>
    </Tabs>}
    {bar}
    {confirm}
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
/** What HOTBOT reads with each request while Settings is open (types/teamAssistant `ScreenDraft`): the draft's rules for reading a change, then
 *  what is on screen and the replay's figures, rounded SOL at the draft's size. */
function settingsContext({ root, draft, name, start, view, tab, lines, days, now, next, singles, ideas, plans, lab }: { root: HTMLElement; draft: SettingsDraft; name: string; start: boolean; view: 'easy' | 'advanced'; tab: Tab;
  lines: string[]; days: number | null; now?: Result; next?: Result; singles?: { key: string; totalSol: number | null }[]; ideas: Suggestion[]; plans?: { id: string; result: Result }[]; lab: Lab }) {
  // A draft that can't save has rules the server refuses, so the saved ones go instead; the rows still say the draft's values.
  const { strategy, dip, error } = draft, rules = error ? strategy.rules : draft.rules;
  return {
    name, ...(start ? { saved: false } : { strategyId: strategy.id, status: strategy.status }), rules, dip: error ? strategy.dipPct : dip,
    view, ...(view === 'advanced' ? { tab } : {}), open: root.querySelector<HTMLElement>('[data-setting][data-open]')?.dataset.setting ?? null,
    rows: shownRows(root), unsavedChanges: lines, ...(error ? { cannotSave: error } : {}),
    result: lab.error ? { unavailable: lab.error } : next ? { days, sol: r3(next.totalSol), bought: next.traded, wonPct: next.traded ? Math.round(100 * next.won / next.traded) : 0, ...(now && lines.length ? { savedSol: r3(now.totalSol) } : {}) } : { replaying: true },
    ...(singles?.length ? { singles: singles.map(single => ({ key: single.key, solAloneVsSaved: r3(single.totalSol) })) } : {}),
    ...(ideas.length ? { ideas: ideas.map(idea => ({ title: idea.title, solVsDraft: r3(idea.gainSol) })) } : {}),
    ...(plans?.length ? { plans: plans.map(plan => ({ id: plan.id, name: EXIT_PLANS[plan.id as ExitPlanId].exits.name, sol: r3(plan.result.totalSol) })) } : {}),
    notReplayed: ['TraderBot’s own sales'],
  };
}
/** What the draft would have made on the last days' coins, against the saved rules, and each change with its own effect; the Lab's failure
 *  alone in its place. Settings the replay can't read say so on their line instead of showing a number. */
function Outcome({ error, days, now, next, singles, draft, onUndo }: { error: string | null; days: number | null; now?: Result; next?: Result; singles?: { key: string; totalSol: number | null }[]; draft: SettingsDraft; onUndo: (keys: (keyof StrategyPatch)[]) => void }) {
  const { strategy, patch, rules } = draft, initial = strategy.rules;
  const keys = changedKeys(patch, rules);
  const effects = singles ? new Map(singles.map(single => [single.key, single.totalSol])) : null;
  const figure = next?.totalSol, before = now?.totalSol;
  return <section className={s.editorOutcome} {...useSpotAttrs('result')}>
    {error ? <p className={s.labNote}>{error}</p> : <>
      <Hint text={`What these settings would have made on ${lastDays(days)}' coins.`}><small>{lastDaysTitle(days)}</small></Hint>
      {!next || figure === undefined ? <div className={s.editorFigureGhost} role="status" aria-label="Replaying the last days"/> : <>
        <b className={`${s.editorFigure} ${figure > 0.005 ? s.up : figure < -0.005 ? s.down : s.muted}`}>{signedSol(figure).replace(' SOL', '')}<small>SOL</small></b>
        <span className={s.editorFigureNote}>{keys.length && before !== undefined ? `was ${signedSol(before).replace(' SOL', '')} · ` : ''}{now && now.traded !== next.traded ? `${now.traded} → ${next.traded}` : next.traded} coins bought</span>
      </>}
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

/** Coins that pass the draft's rules right now, from the market gateway, and when none does, the rule that alone keeps out the most. */
function FitNow({ fit, blocker, onOpen, onShow }: { fit: FitState; blocker: Live['blocker']; onOpen: (token: string) => void; onShow: (id: string) => void }) {
  const shown = fit.fits?.tokens.slice(0, 5) ?? [], plus = fit.fits?.capped ? '+' : '';
  return <section className={s.editorFits} aria-live="polite" data-loading={fit.loading || undefined}>
    {fit.fits ? <>
      <b className={fit.fits.count ? undefined : s.warnText}>{fit.fits.count ? `${fit.fits.count}${plus} fit right now` : 'Nothing fits right now'}</b>
      <div>{shown.map(token => <CoinPill key={token.address || token.symbol} coins={[token]} note={token.marketCapUsd ? '$' + numText('usd', token.marketCapUsd) : undefined} onClick={() => onOpen(token.address || token.symbol)}/>)}
        {fit.fits.count > shown.length && <small>{fit.fits.count - shown.length}{plus} more</small>}
        {blocker && (() => { const text = blocker.fit !== undefined ? `Without ${blocker.name.toLowerCase()}: ${blocker.fit.toLocaleString('en-US')}` : `${blocker.name}: ${blocker.pass!.toLocaleString('en-US')} pass`;
          return blocker.id ? <Button size="sm" variant="secondary" onClick={() => onShow(blocker.id!)}>{text}</Button> : <small>{text}</small>; })()}</div>
    </> : fit.loading ? <small>Checking what fits right now…</small>
      : <><small>Couldn’t count what fits right now</small><Button size="sm" variant="secondary" onClick={fit.retry}>Try again</Button></>}
  </section>;
}
