"use client";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAtomValue, useSetAtom } from 'jotai';
import { ArrowDown, ArrowRight, Check, ChevronRight, CopyPlus, FilePlus2, FlaskConical, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis, useActiveTooltipLabel, useChartHeight, useChartWidth, useXAxisScale, useYAxisScale } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { EXIT_PLANS, TRAIL, describeExits, namedExitPlan, trailPct, type ExitPlanId } from '../../../../types/exits';
import { tipWorth, type CoinView, type Curves as CurveData, type Gap, type LabMeta, type OwnPlans, type Tip } from '../../../../types/lab';
import { BLANK, blankRules, tradesAs } from '../../../../types/team';
import type { CheckRow } from './checks';
import type { HomeData, StrategyRow } from './data';
import { appHref, signedSol, usd } from './format';
import { AddStrategyButton, CoinPill, Hint, numText, useSettingSpot } from './Parts';
import { byExit, checkLabel, rulesOfCheck, type OwnTrade, type Result } from './labModel';
import { useLab, useLabData, useOwnTrades } from './labData';
import { CoinReplayBlock, type ReplayCoin } from './LabReplay';
import { TAB_KEYS, checksOn, describeChanges, looserIsLower, useSettingsDraft, useSettingsSections, type SettingsDraft, type Tab } from './Settings';
import { draftBridgeAtom, draftProposalAtom, settingSpotAtom, useCommand } from './state';
import { guideOf } from '../../../../types/settingsGuide';
import s from './team.module.css';

const pc = (x: number | undefined) => x !== undefined && Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(x !== 0 && Math.abs(x) < 0.1 ? 1 : 0)}%` : '–';
const toneOf = (x: number | undefined) => x === undefined || !Number.isFinite(x) || Math.abs(x) < 1e-6 ? undefined : x > 0 ? 'up' : 'down';
const clock = (at: number) => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = (at: number) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const sol2 = (n: number) => signedSol(n, 2).replace(' SOL', '');
/** The strategy's sales the Lab reads coin by coin. */
const OWN_LIMIT = 300;
/** The named plan a draft's exit plan is, by its levels: a strategy can carry an older version of a plan under the same name. */
const planIdOf = (draft: SettingsDraft) => namedExitPlan(draft.rules.exits);

/** The Lab's own new strategy (`/app/lab/new`, `?from=<id>` for a copy): the draft is tried here and Create saves it paused. */
const NEW = 'new';
/** The row the Lab and its settings read for a strategy not made yet: a copy of `from` (its rules and entry, none of its money or history) or
 *  a blank one. */
function draftRow(from: StrategyRow | null, at: number, template: StrategyRow | undefined): StrategyRow {
  const base = from ?? template;
  return { ...base!, id: NEW as StrategyRow['id'], name: from ? `${from.name} copy` : BLANK.name, description: '', preset: from?.preset ?? BLANK.preset, status: 'paused', dipPct: from?.dipPct ?? 0, rules: from?.rules ?? blankRules(),
    funnel: { found: 0, passed: 0, armed: 0, bought: 0 }, realizedPnlSol: 0, openPnlSol: 0, held: 0, spark: [], traded: false, startedAt: at, sold: 0, wins: 0 };
}

// ---- The page ----
export function LabPage({ data: home, id }: { data: HomeData; id?: string }) {
  const router = useRouter(), strategies = home.strategies.filter(row => row.status !== 'archiving'), params = useSearchParams();
  const fresh = id === NEW, strategy = fresh ? undefined : strategies.find(row => row.id === id) ?? (id ? undefined : strategies[0]);
  const coin = params.get('coin'), from = fresh ? strategies.find(row => row.id === params.get('from')) ?? null : null;
  useEffect(() => { if (!id && strategy) router.replace(appHref('lab', strategy.id) + (coin ? `?coin=${coin}` : '')); }, [id, strategy, router, coin]);
  // The portfolio's latest sales, read once a visit up here so switching strategies doesn't read them again.
  const lab = useLabData(), portfolio = useOwnTrades();
  const [picking, setPicking] = useState(false), labFrom = lab.data?.from;
  const draftOf = useMemo(() => fresh && labFrom ? draftRow(from, labFrom, strategies[0]) : null, [fresh, from, labFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  const head = (current?: StrategyRow, end?: ReactNode) => <LabHead strategies={strategies} current={current} fresh={fresh} onNew={() => setPicking(true)}>{end}</LabHead>;
  const picker = <NewStrategyDialog open={picking} strategies={strategies} onClose={() => setPicking(false)}/>;
  if (!strategies.length && !fresh) return <div className={`${s.page} ${s.studio}`}>{head()}{picker}<div className={`${s.surface} ${s.studioEmpty}`}><FlaskConical/><b>No strategy to try things on yet</b><Link href={appHref('lab', NEW)} className={s.studioLink}>Start one here<ArrowRight size={14}/></Link></div></div>;
  if (!strategy && !fresh) return <div className={`${s.page} ${s.studio}`}>{head()}{picker}<p className={s.empty}>This strategy no longer exists.</p></div>;
  if (lab.error) return <div className={`${s.page} ${s.studio}`}>{head(strategy)}{picker}<div className={`${s.surface} ${s.studioEmpty}`}><FlaskConical/><b>{lab.error}</b><button type="button" className={s.studioLink} onClick={() => location.reload()}>Try again</button></div></div>;
  if (!lab.data) return <div className={`${s.page} ${s.studio}`}>{head(strategy)}<LabSkeleton/></div>;
  const row = draftOf ?? strategy!;
  return <>{picker}<Studio key={fresh ? `${NEW}:${from?.id ?? ''}` : row.id} data={lab.data} home={home} strategy={row} strategies={strategies} portfolio={portfolio} fresh={fresh ? { from } : undefined} head={head}/></>;
}

function LabHead({ strategies, current, fresh, onNew, children }: { strategies: StrategyRow[]; current?: StrategyRow; fresh?: boolean; onNew: () => void; children?: ReactNode }) {
  return <header className={s.studioHead}>
    <div className={s.studioHeadStart}>
      <h1 className={s.title}><FlaskConical className={s.studioMark}/>Lab</h1>
      <nav className={s.studioPick} aria-label="Strategy">
        {strategies.map(row => <Link key={row.id} href={appHref('lab', row.id)} aria-current={row.id === current?.id ? 'page' : undefined}>{row.name}</Link>)}
        {fresh && <span aria-current="page">{current?.name ?? BLANK.name}</span>}
      </nav>
      <AddStrategyButton onClick={onNew}/>
    </div>
    {children}
  </header>;
}

/** New strategy in the Lab: blank, or a copy of one of the team's. Either opens as a draft here; nothing is made until Create. */
function NewStrategyDialog({ open, strategies, onClose }: { open: boolean; strategies: StrategyRow[]; onClose: () => void }) {
  const router = useRouter(), go = (from?: string) => { onClose(); router.push(appHref('lab', NEW) + (from ? `?from=${from}` : '')); };
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
      <DialogTitle className={s.labNewTitle}>New strategy</DialogTitle>
      <div className={s.labNewList}>
        <button type="button" onClick={() => go()}><span className={s.labNewIcon}><FilePlus2/></span><span><b>Blank</b><small>Only the safety floors every strategy runs. You add every rule.</small></span><ArrowRight/></button>
        {strategies.length > 0 && <small>Or start from</small>}
        {strategies.map(row => <button type="button" key={row.id} onClick={() => go(row.id)}><span className={s.labNewIcon}><CopyPlus/></span><span><b>{row.name}</b><small>Its rules, entry and exit plan, none of its money or coins</small></span><ArrowRight/></button>)}
      </div>
    </DialogContent>
  </Dialog>;
}
function LabSkeleton() {
  return <div className={s.studioSkeleton} role="status" aria-label="Loading the Lab"><div className={s.surface}/><div className={s.surface}/><div className={s.surface}/></div>;
}

/** Real profit since `from`: the strategy's total now (sold plus held at the latest prices) less its profit line's value at `from`. */
function realSince(strategy: StrategyRow, from: number) {
  const before = [...strategy.spark].reverse().find(point => point.at <= from)?.pnl ?? 0;
  return strategy.realizedPnlSol + strategy.openPnlSol - before;
}

/** `fresh`: a strategy not made yet (blank, or a copy of `from`): no real side, the Lab's whole window, and Create instead of Apply. */
function Studio({ data, home, strategy, strategies, portfolio, fresh, head }: { data: LabMeta; home: HomeData; strategy: StrategyRow; strategies: StrategyRow[]; portfolio: OwnTrade[] | undefined; fresh?: { from: StrategyRow | null }; head: (current?: StrategyRow, end?: ReactNode) => ReactNode }) {
  const command = useCommand(), draft = useSettingsDraft(strategy)!, router = useRouter();
  const own = useOwnTrades(fresh ? fresh.from?.id ?? null : strategy.id, OWN_LIMIT);
  const trades = useMemo(() => portfolio && own ? [...new Map([...portfolio, ...own].map(trade => [trade.id, trade])).values()] : undefined, [portfolio, own]);
  const [tab, setTab] = useState<Tab>('search'), [open, setOpen] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const linked = useSearchParams().get('coin');
  const [coin, setCoin] = useState<ReplayCoin | null>(() => linked ? { mint: linked, symbol: `${linked.slice(0, 4)}…`, openedAt: Date.now() } : null);
  const [filter, setFilter] = useState<Filter>({ id: 'all' });
  // Real and Lab on the same dates: research's reads since the strategy started, or since the Lab's window opens if it started before.
  const since = fresh ? data.from : Math.max(strategy.startedAt, data.from);
  // A full page of sales means older ones weren't read: every coin bought after the oldest sale on hand closed is on hand, so the coin-by-coin
  // comparison starts there.
  const gapFrom = own && own.length >= OWN_LIMIT ? Math.max(since, Math.min(...own.map(trade => trade.closedAt))) : since;
  const rows = checksOn(draft.rules).filter(row => !row.noReplay);
  const proposal = useAtomValue(draftProposalAtom), setBridge = useSetAtom(draftBridgeAtom);
  const run = useLab(data, {
    ...(fresh ? fresh.from ? { strategyId: fresh.from.id } : {} : { strategyId: strategy.id }),
    since, saved: { rules: strategy.rules, dip: strategy.dipPct }, draft: { rules: draft.rules, dip: draft.dip }, coins: true, plans: true, curves: true,
    ...(own && !fresh ? { tradesFrom: gapFrom, trades: own.flatMap(trade => trade.boughtAt && trade.boughtAt >= gapFrom ? [{ mint: trade.token.address, boughtAt: trade.boughtAt, inSol: trade.inSol, pnlSol: trade.pnlSol }] : []) } : {}),
    ...(own?.length ? { own: own.flatMap(trade => trade.boughtAt && trade.entryPriceUsd ? [{ id: trade.id, mint: trade.token.address, boughtAt: trade.boughtAt, entryPriceUsd: trade.entryPriceUsd, inSol: trade.inSol, pnlSol: trade.pnlSol }] : []), ownTrail: trailPct(draft.rules.exits) } : {}),
    tips: rows.map(row => ({ key: row.key, steps: row.steps, removable: row.start !== undefined, looserIsLower: looserIsLower(row.key) })),
    ...(proposal ? { proposal } : {}),
  });
  const main = run.main, next = main?.next;
  const evidence = (row: CheckRow) => { const groups = (main?.down ?? []).filter(group => rulesOfCheck(group.check).includes(row.key)); return groups.length ? { n: groups.reduce((sum, g) => sum + g.count, 0), doubled: groups.reduce((sum, g) => sum + g.doubled, 0) } : null; };
  const planDelta = next && main?.plans ? (id: string) => { const row = main.plans!.find(plan => plan.id === id); return row ? row.result.totalSol - next.totalSol : undefined; } : undefined;
  const suggestOf = (row: CheckRow) => <SuggestIcon row={row} tip={run.tips.get(row.key)} next={next} current={(draft.rules[row.key] as number | undefined) ?? 0} onPick={value => draft.set({ [row.key]: value })}/>;
  const sections = useSettingsSections({ data: home, draft, open, setOpen, evidence, labLoaded: true, planDelta, suggestOf });
  const openCoin = useCallback((pick: Omit<ReplayCoin, 'openedAt'>) => { setCoin({ ...pick, openedAt: Date.now() }); document.getElementById('lab-centre')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, []);
  const apply = async () => { setSaving(true); const ok = await command({ type: 'update', strategyId: strategy.id, patch: draft.patch }); setSaving(false); if (ok !== false) draft.reset(); };
  const create = async (name: string) => {
    setSaving(true);
    const id = await command({ type: 'labStrategy', name, ...(fresh?.from ? { from: fresh.from.id } : {}), patch: draft.patch });
    setSaving(false);
    if (typeof id === 'string') router.push(appHref('lab', id));
  };
  // A copy that trades exactly like its source would be refused: only money differs.
  const twin = fresh?.from && tradesAs({ preset: fresh.from.preset, dipPct: draft.dip, rules: draft.rules }) === tradesAs(fresh.from) ? fresh.from.name : null;
  const changes = draft.dirty ? describeChanges(draft.patch, strategy.rules, draft.rules, strategy.dipPct) : [];
  const tabs: { id: Tab; name: string }[] = [{ id: 'search', name: 'Search' }, { id: 'shield', name: 'Shield' }, { id: 'sniper', name: 'Sniper' }, { id: 'trader', name: 'Trader' }, { id: 'budget', name: 'Budget' }];
  const unreplayed = [draft.rules.sellModelPct && 'the sell-or-keep model'].filter((x): x is string => Boolean(x));
  // HOTBOT plans this draft from the composer: every request on the Lab carries what is on screen, and its proposals come back here. A named
  // plan from chat replaces a plan edited by hand (`exits` would otherwise win over `exitPlan` in applyPatch).
  const context = useMemo(() => main && next ? JSON.stringify(labContext({ strategy, fresh, draft, since, data, main, tips: run.tips, rows, changes, unreplayed })) : null,
    [main, run.tips, draft.rules, draft.dip]); // eslint-disable-line react-hooks/exhaustive-deps
  const replayed = main?.proposal && next ? { key: main.proposal.key, sol: main.proposal.result.totalSol, picks: main.proposal.result.picks, mean: main.proposal.result.mean,
    base: { sol: next.totalSol, picks: next.picks, mean: next.mean } } : null;
  // HOTBOT points at rows in the settings column: a row on another tab opens that tab first.
  const checksRef = useRef<HTMLElement>(null), spot = useSetAtom(settingSpotAtom);
  useSettingSpot(checksRef);
  const show = (ids: string[]) => {
    const rows = guideOf(ids).filter(row => row.tab);
    if (!rows.length) return;
    if (!rows.some(row => checksRef.current?.querySelector(`[data-setting="${CSS.escape(row.id)}"]`))) setTab(rows[0].tab!);
    setOpen(null);
    spot({ ids: rows.map(row => row.id), at: Date.now() });
  };
  const bridgeKey = JSON.stringify([context, replayed, strategy.name, draft.patch]);
  useEffect(() => { setBridge({ page: 'lab', name: strategy.name, rules: draft.rules, dip: draft.dip, patch: draft.patch, context: () => context, replayed, show, drop: draft.drop,
    apply: patch => { if (patch.exitPlan !== undefined) draft.drop(['exits']); draft.set(patch); } }); }, [bridgeKey, setBridge]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setBridge(null), [setBridge]);

  return <div className={`${s.page} ${s.studio}`}>
    {head(strategy, <div className={s.studioHeadEnd}>
        {fresh ? <CreateBar draft={draft} twin={twin} saving={saving} onCreate={name => void create(name)}/> : draft.dirty && <ApplyBar draft={draft} changes={changes} saving={saving} onApply={() => void apply()}/>}
        <Hint text={`Rebuilt every hour from the worker’s flow record and the indexer: ${data.coins.toLocaleString()} coins research read since ${day(data.from)}, every read of each, and their 1-second prices.${data.unpriced ? ` ${data.unpriced.toLocaleString()} more had no 1-second prices and are left out.` : ''}`}>
          <span className={s.studioAsOf}><i aria-hidden data-busy={run.pending || undefined}/>{run.pending ? 'Replaying…' : `Data ${clock(data.builtAt)}`}</span>
        </Hint>
    </div>)}
    <div className={s.studioLayout}>
      <aside ref={checksRef} className={`${s.studioSide} ${s.studioChecks}`} aria-label="Settings">
        <Tabs value={tab} onValueChange={value => { setTab(value as Tab); setOpen(null); }} className={s.labTabs}>
          <TabsList variant="line" aria-label="Settings sections">{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.name}{Object.keys(draft.patch).some(TAB_KEYS[t.id]) && <span className={s.unsavedDot} aria-label="changed"/>}</TabsTrigger>)}</TabsList>
          <TabsContent value="search">{sections.search}</TabsContent>
          <TabsContent value="shield">{sections.shield}</TabsContent>
          <TabsContent value="sniper">{sections.sniper}</TabsContent>
          <TabsContent value="trader">{sections.trader}</TabsContent>
          <TabsContent value="budget">{sections.budget}</TabsContent>
        </Tabs>
      </aside>
      <div className={s.studioMain} id="lab-centre">
        <CoinReplayBlock coin={coin} onCoin={setCoin} data={data} strategy={strategy} strategies={strategies} rules={draft.rules} dip={draft.dip} trades={trades} bags={home.bags} onPlan={id => draft.set({ exitPlan: id })}/>
        <Overview views={main?.coins} next={next} now={main?.now} filter={filter} setFilter={setFilter}/>
        <Curves curves={main?.curves} strategy={strategy} since={since} changed={draft.dirty} own={fresh ? undefined : own} real={!fresh} onOpen={openCoin}/>
        <section className={`${s.surface} ${s.labTrio}`} aria-label="Plans and sold coins">
          <Plans plans={main?.plans} next={next} draft={draft} trail={!fresh || fresh.from ? undefined : <TrailPick draft={draft}/>}/>
          {(!fresh || fresh.from) && <OwnTrades own={own} plans={main?.own} draft={draft} whose={fresh?.from?.name}/>}
          {(!fresh || fresh.from) && <Losses own={own} openCoin={openCoin}/>}
        </section>
        <CoinList views={main?.coins} own={own} filter={filter} setFilter={setFilter} selected={coin?.mint} onOpen={v => openCoin({ mint: v.mint, symbol: v.symbol, ...(v.logo ? { logo: v.logo } : {}) })} pending={run.pending}/>
      </div>
      <aside className={`${s.studioSide} ${s.studioResults}`} aria-label="Results">
        <Verdict strategy={strategy} since={since} now={main?.now} next={next} changed={draft.dirty} size={draft.rules.amountSol} unreplayed={unreplayed} gap={main?.gap} base={fresh ? fresh.from?.name ?? 'Blank' : undefined}
          onShow={(label, mints) => setFilter({ id: 'gap', label, mints: new Set(mints) })}/>
      </aside>
    </div>
  </div>;
}

/** Create for a strategy made in the Lab: its name and one button that saves it paused. */
/** What HOTBOT reads about the Lab with each request there (types/teamAssistant LabContext): the draft's rules, what the saved rules and the
 *  draft made on the Lab's days, the checks that turned coins down, each check's best steps, every plan on the same picks and real against
 *  the Lab. Figures are SOL at the draft's size and returns per trade, rounded. */
const r3 = (x: number | undefined) => x !== undefined && Number.isFinite(x) ? +x.toFixed(3) : null;
const brief = (r: Result) => ({ picks: r.picks, bought: r.traded, wonPct: r.traded ? Math.round(100 * r.won / r.traded) : 0, sol: r3(r.totalSol), medianTrade: r3(r.median), meanTradeWithoutBest3: r3(r.meanTrim), likelyTradeRange: [r3(r.low), r3(r.high)], noRoom: r.full, noEntry: r.expired + r.chased, stillHeld: r.open });
function labContext({ strategy, fresh, draft, since, data, main, tips, rows, changes, unreplayed }: { strategy: StrategyRow; fresh?: { from: StrategyRow | null }; draft: SettingsDraft; since: number; data: LabMeta;
  main: NonNullable<ReturnType<typeof useLab>['main']>; tips: Map<string, Tip>; rows: CheckRow[]; changes: string[]; unreplayed: string[] }) {
  const next = main.next, rules = draft.rules, planId = planIdOf(draft);
  return {
    name: strategy.name, rules, dip: draft.dip,
    strategy: fresh ? { saved: false, startedFrom: fresh.from?.name ?? 'blank' } : { saved: true, status: strategy.status },
    window: { from: new Date(since).toISOString(), to: new Date(data.builtAt).toISOString(), coinsRead: main.coins?.length ?? null },
    draftChanges: changes,
    checks: rows.map(row => ({ key: row.key, name: row.name, value: (rules[row.key] as number | undefined) ?? 0 })),
    entry: { dipPct: draft.dip, watchMinutes: rules.entryDelayMinutes ?? 0, skipIfUpPct: rules.entryMaxUpPct ?? 0 },
    exit: { plan: rules.exits.name, planId: planId ?? null, trailPct: trailPct(rules.exits) ?? null, words: describeExits(rules.exits) },
    size: { perCoinSol: rules.amountSol, coinsAtOnce: rules.maxOpenPositions, budgetSol: rules.allocationSol },
    results: { saved: brief(main.now), draft: brief(next) },
    turnedDown: main.down.slice(0, 12).map(g => ({ check: checkLabel(g.check), keys: rulesOfCheck(g.check), coins: g.count, doubledIn4h: g.doubled })),
    steps: rows.flatMap(row => { const tip = tips.get(row.key); return tip?.variants.length ? [{ key: row.key, now: (rules[row.key] as number | undefined) ?? 0,
      options: tip.variants.map(v => ({ to: v.value, solVsDraft: r3(v.totalSol - next.totalSol), picksVsDraft: v.picks - next.picks, likelyPct: Math.round(v.sure * 100) })) }] : []; }),
    plans: (main.plans ?? []).map(p => ({ id: p.id, name: EXIT_PLANS[p.id as ExitPlanId].exits.name, sol: r3(p.result.totalSol), wonPct: p.result.traded ? Math.round(100 * p.result.won / p.result.traded) : 0 })),
    ...(fresh ? {} : { real: { sol: r3(realSince(strategy, since)), ...(main.gap ? { coinByCoin: { from: new Date(main.gap.from).toISOString(),
      labPicksItNeverBought: { coins: main.gap.labOnly.mints.length, labSol: r3(main.gap.labOnly.labSol) },
      boughtLabTurnsDown: { coins: main.gap.realOnly.mints.length, realSol: r3(main.gap.realOnly.realSol), mostlyFor: main.gap.realOnly.why.slice(0, 3).map(w => ({ why: w.key, coins: w.count, realSol: r3(w.realSol) })) },
      both: { coins: main.gap.both.mints.length, labSol: r3(main.gap.both.labSol), realSol: r3(main.gap.both.realSol) } } } : {}) } }),
    notReplayed: ['TraderBot’s own sales', 're-buys', ...unreplayed],
  };
}

function CreateBar({ draft, twin, saving, onCreate }: { draft: SettingsDraft; twin: string | null; saving: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return <form className={s.studioApply} role="status" onSubmit={event => { event.preventDefault(); onCreate(name); }}>
    <input className={s.labNewName} value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder={draft.strategy.name} aria-label="Name"/>
    {(draft.error || twin) && <span className={s.warnText}>{draft.error ?? `Trades like ${twin}: change a setting`}</span>}
    {draft.dirty && <Button type="button" size="sm" variant="ghost" onClick={draft.reset}><RotateCcw/>Reset</Button>}
    <Button type="submit" size="sm" disabled={saving || Boolean(draft.error) || Boolean(twin)}>{saving ? <LoaderCircle className="animate-spin"/> : <Check/>}Create, paused</Button>
  </form>;
}

function ApplyBar({ draft, changes, saving, onApply }: { draft: SettingsDraft; changes: string[]; saving: boolean; onApply: () => void }) {
  return <div className={s.studioApply} role="status">
    <Hint text={<ul className={s.studioChanges}>{changes.map(change => <li key={change}>{change}</li>)}</ul>}><span className={s.studioChangeCount}><b>{changes.length}</b> {changes.length === 1 ? 'change' : 'changes'}</span></Hint>
    {draft.error && <span className={s.warnText}>{draft.error}</span>}
    <Button size="sm" variant="ghost" onClick={draft.reset}><RotateCcw/>Reset</Button>
    <Button size="sm" disabled={saving || Boolean(draft.error)} onClick={onApply}>{saving ? <LoaderCircle className="animate-spin"/> : <Check/>}Apply to {draft.strategy.name}</Button>
  </div>;
}

/** A check's best step on the Lab's coins as a sparkle beside its shield: the step either way (or off) worth suggesting (`tipWorth`) that makes
 *  the most. Hover says what it would do and how likely it is to keep beating the draft; a click puts it in the draft. */
function SuggestIcon({ row, tip, next, current, onPick }: { row: CheckRow; tip: Tip | undefined; next: Result | undefined; current: number; onPick: (value: number) => void }) {
  if (!tip || !next) return null;
  const best = tip.variants.map(v => ({ v, gain: v.totalSol - next.totalSol })).filter(({ v }) => tipWorth(v, next.totalSol)).sort((a, b) => b.gain - a.gain)[0];
  if (!best) return null;
  const { v, gain } = best, to = v.value === 0 ? 'off' : numText(row.kind, v.value), more = v.picks - next.picks;
  return <Tooltip><TooltipTrigger asChild>
    <button type="button" className={s.setSuggest} aria-label={`${row.name}: try ${to}, ${sol2(gain)} SOL on the Lab's days`} onClick={event => { event.stopPropagation(); onPick(v.value); }}><Sparkles/></button>
  </TooltipTrigger><TooltipContent side="right" sideOffset={8} className={s.suggestTip}>
    <b>{v.value === 0 ? `Remove ${row.name.toLowerCase()}` : `${row.name}: ${numText(row.kind, current)} → ${to}`}</b>
    <span><em data-tone="up">{sol2(gain)} SOL</em> on the Lab’s days</span>
    <span>{more ? `${Math.abs(more)} ${more > 0 ? 'more' : 'fewer'} picks` : 'As many picks'}{v.gained && v.lost ? ` · ${v.gained} new, ${v.lost} dropped` : ''}</span>
    <span><em data-tone="up">{Math.round(v.sure * 100)}%</em> likely to keep beating these settings</span>
    <small>Click to put it in the draft</small>
  </TooltipContent></Tooltip>;
}

// ---- Every coin ----
type FilterId = 'all' | 'picks' | 'bought' | 'down' | 'changed' | 'recheck' | 'gap';
type Filter = { id: FilterId; label?: string; mints?: Set<string> };
const FILTERS: { id: Exclude<FilterId, 'gap'>; name: string; test: (v: CoinView) => boolean }[] = [
  { id: 'all', name: 'All', test: () => true },
  { id: 'picks', name: 'Picks', test: v => v.verdict === 'pick' },
  { id: 'bought', name: 'Bought', test: v => v.out?.status === 'traded' && !v.out.full },
  { id: 'down', name: 'Turned down', test: v => v.verdict !== 'pick' },
  { id: 'changed', name: 'Changed', test: v => v.before !== null && (v.before === 'pick') !== (v.verdict === 'pick') },
  { id: 'recheck', name: 'Re-checked', test: v => v.recheck },
];
const passes = (filter: Filter, v: CoinView) => filter.id === 'gap' ? filter.mints!.has(v.mint) : FILTERS.find(f => f.id === filter.id)!.test(v);
/** The return a coin's row reads: the pick's own trade, else what it did bought at its read. */
const resultOf = (v: CoinView) => v.out?.status === 'traded' && !v.out.full ? v.out.ret : v.market.status === 'traded' ? v.market.ret : undefined;

/** Every coin read in the period in a few figures, live as the draft changes: how many research read, picked (and how many more or fewer than
 *  the saved rules), bought and turned down, and how the picks and the turned-down coins did had each been bought at its read. */
function Overview({ views, next, now, filter, setFilter }: { views?: CoinView[]; next?: Result; now?: Result; filter: Filter; setFilter: (filter: Filter) => void }) {
  if (!views || !next || !now) return <section className={`${s.surface} ${s.labOverview}`} data-loading aria-label="Every coin"><div className={s.labRowsLoading}/></section>;
  const picks = views.filter(v => v.verdict === 'pick'), down = views.filter(v => v.verdict !== 'pick'), changed = views.filter(FILTERS.find(f => f.id === 'changed')!.test);
  const skipped = next.full + next.expired + next.chased;
  const tile = (id: FilterId, label: string, value: ReactNode, sub: ReactNode) => <button type="button" className={s.labStage} aria-pressed={filter.id === id} onClick={() => setFilter({ id: filter.id === id && id !== 'all' ? 'all' : id })}><small>{label}</small><b>{value}</b><span>{sub}</span></button>;
  return <section className={`${s.surface} ${s.labOverview}`} aria-label="Every coin">
    <div className={s.labStages}>
      {tile('all', 'Researched', views.length.toLocaleString(), `${views.filter(v => v.recheck).length} on a re-check`)}
      {tile('picks', 'Picked', picks.length.toLocaleString(), now.picks !== next.picks ? <em data-tone={next.picks > now.picks ? 'up' : 'down'}>{next.picks > now.picks ? '+' : '−'}{Math.abs(next.picks - now.picks)} vs saved</em> : `${changed.length} changed`)}
      {tile('bought', 'Bought', next.traded.toLocaleString(), skipped ? `${next.full} no room · ${next.expired + next.chased} no entry` : 'every pick')}
      {tile('down', 'Turned down', down.length.toLocaleString(), `${down.filter(v => (v.high ?? 0) >= 1).length} doubled in 4h`)}
    </div>
    <div className={s.labCohorts}>
      <Cohort label="Picks, bought at the read" views={picks}/>
      <Cohort label="Turned down, had they been bought" views={down}/>
    </div>
  </section>;
}
const BUCKETS = [{ name: '−50%', to: -0.5 }, { name: '−20%', to: -0.2 }, { name: '0', to: 0 }, { name: '+20%', to: 0.2 }, { name: '+100%', to: 1 }, { name: '2×+', to: Infinity }];
/** How a group of coins did bought at market at its read under the draft's plan, as one bar of loss and gain bands. */
function Cohort({ label, views }: { label: string; views: CoinView[] }) {
  const rets = views.flatMap(v => v.market.status === 'traded' ? [v.market.ret] : []), counts = BUCKETS.map(() => 0);
  for (const r of rets) counts[BUCKETS.findIndex(b => r < b.to)]++;
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : NaN, median = [...rets].sort((a, b) => a - b)[Math.floor(rets.length / 2)];
  return <div className={s.labCohort}>
    <span className={s.labCohortHead}><b>{label}</b><small>{rets.length.toLocaleString()} coins · median <em data-tone={toneOf(median)}>{pc(median)}</em> · mean <em data-tone={toneOf(mean)}>{pc(mean)}</em></small></span>
    <span className={s.labBands} role="img" aria-label={BUCKETS.map((b, i) => `${counts[i]} to ${b.name}`).join(', ')}>
      {BUCKETS.map((b, i) => counts[i] ? <i key={b.name} data-band={i} style={{ flexGrow: counts[i] }} title={`${counts[i]} coins ${i === 0 ? 'lost over 50%' : i === BUCKETS.length - 1 ? 'at least doubled' : `from ${BUCKETS[i - 1].name} to ${b.name}`}`}/> : null)}
    </span>
  </div>;
}

type CurveView = 'time' | 'buy' | 'cap' | 'age';
const minutesText = (m: number) => m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${m}m`;
type LineKey = 'real' | 'saved' | 'draft';
type TimeRow = { at: number } & Partial<Record<LineKey, number>>;
/** A sale on the chart: the coin, what it made, the line it moved and that line's value once it sold. */
type Sale = { id: string; line: LineKey; mint: string; symbol: string; logo?: string; ret: number; sol: number; at: number; value: number };
/** Pins in px, matching the coin chart's clouds (`--stem` 16): a head's top sits `rise` from its dot. Sales within `nearX` and `nearY` of a
 *  pin's first sale on the same line share it, so one line's heads never touch; two lines' heads closer than `width` and `nearY` don't both rise. */
const PIN = { stem: 16, rise: 42, nearX: 40, nearY: 40, width: 40 };
/** A pin: its head and dot sit at (`x`, `y`) on the first sale's dot; `sales` are its sales, the biggest first; `dots` are the other sales'
 *  dots, relative to the pin, shown only while it is lit. `from` and `to` are its sales' x range. */
type PinGroup = { id: string; line: LineKey; first: Sale; sales: Sale[]; x: number; y: number; from: number; to: number; up: boolean; tipY: 'above' | 'below'; room: number; dots: { sale: Sale; dx: number; dy: number }[] };
/** A head's ring is its biggest sale's result; the dot under it keeps its own sale's (`data-tone`). */
const RING = { up: 'var(--positive)', down: 'var(--destructive)', flat: 'var(--foreground)' };
/** Where each pin goes: sales too close to tell apart share one pin on the first one's dot, showing the biggest one's logo and their count. A
 *  pin rises above its line, and hangs below it when there's no room above or another line's pin is in the way. Inside the chart, for its
 *  scales; one pass for the tooltip and the pins (`PinScope`). */
function usePins(sales: Sale[]): PinGroup[] {
  const x = useXAxisScale(), y = useYAxisScale(), height = useChartHeight() ?? 0;
  return useMemo(() => {
    const groups: PinGroup[] = [];
    if (!x || !y || !height) return groups;
    type At = { sale: Sale; x: number; y: number };
    const points = sales.map(sale => ({ sale, x: x(sale.at), y: y(sale.value) })).filter((p): p is At => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.sale.at - b.sale.at);
    const clusters: { line: LineKey; first: At; members: At[] }[] = [];
    for (const p of points) {
      let near: typeof clusters[number] | undefined;
      for (let i = clusters.length - 1; i >= 0 && p.x - clusters[i].first.x < PIN.nearX; i--) if (clusters[i].line === p.sale.line && Math.abs(clusters[i].first.y - p.y) < PIN.nearY) { near = clusters[i]; break; }
      if (near) near.members.push(p); else clusters.push({ line: p.sale.line, first: p, members: [p] });
    }
    const heads: { line: LineKey; x: number; y: number; up: boolean }[] = [];
    for (const { line, first, members } of clusters) {
      const clash = (up: boolean) => heads.some(h => h.line !== line && h.up === up && Math.abs(h.x - first.x) < PIN.width && Math.abs(h.y - first.y) < PIN.nearY);
      const roomUp = first.y >= PIN.rise, roomDown = first.y + PIN.rise <= height;
      const up = roomUp && !clash(true) ? true : roomDown && !clash(false) ? false : roomUp;
      heads.push({ line, x: first.x, y: first.y, up });
      // The card opens toward the larger space and scrolls inside what is left of the chart there.
      const above = up ? first.y - PIN.rise : first.y - 22, below = up ? height - first.y - 22 : height - first.y - PIN.rise;
      groups.push({ id: first.sale.id, line, first: first.sale, sales: members.map(m => m.sale).sort((a, b) => Math.abs(b.sol) - Math.abs(a.sol)), x: first.x, y: first.y, from: first.x, to: members[members.length - 1].x, up,
        tipY: above > below ? 'above' : 'below', room: Math.max(96, Math.max(above, below) - 12), dots: members.slice(1).map(m => ({ sale: m.sale, dx: m.x - first.x, dy: m.y - first.y })) });
    }
    return groups;
  }, [sales, x, y, height]);
}
const PinsContext = createContext<PinGroup[]>([]);
/** Lays the pins out once for everything inside the chart that reads them. */
function PinScope({ sales, children }: { sales: Sale[]; children: ReactNode }) {
  return <PinsContext.Provider value={usePins(sales)}>{children}</PinsContext.Provider>;
}
/** The pins at a px on the time axis: the pointer's time lights them and lists their sales in the tooltip. */
const pinsAt = (groups: PinGroup[], px: number | undefined) => px === undefined || !Number.isFinite(px) ? [] : groups.filter(g => px >= g.from - 6 && px <= g.to + 6);
const avatar = (sale: Sale, size: string) => <TokenAvatar className={`${size} rounded-full`} address={sale.mint} logoUrl={sale.logo} symbol={sale.symbol} network="solana" fallback="letter" disableDetailFallback/>;
type PinProps = { group: PinGroup; near: boolean; open: boolean; tipX: 'start' | 'center' | 'end'; names: Record<LineKey, string>; onShow: (id: string) => void; onHide: (id: string) => void; onOpen: (sale: Sale) => void };
/** One pin: its head with the stem to its dot; lit, it shows its sales' dots, and open, its card of sales. Memoised, so the pointer moving
 *  across the chart renders only the pins it lights or leaves. */
const Pin = memo(function Pin({ group, near, open, tipX, names, onShow, onHide, onOpen }: PinProps) {
  const { id, first, sales, x, y, up, tipY, room, dots } = group, count = sales.length, openAtTap = useRef(false);
  return <div className={s.cloudMark} data-line={first.line === 'real' ? 'real' : 'lab'} data-tone={toneOf(first.sol)} data-lead="" data-side={up ? 'up' : 'down'} data-tip-y={tipY} data-tip-x={tipX} data-near={near || undefined} data-open={open || undefined}
    style={{ '--stem': `${PIN.stem}px`, '--room': `${room}px`, '--ring': RING[toneOf(sales[0].sol) ?? 'flat'], transform: `translate(${x}px, ${y}px)` } as CSSProperties}
    onPointerEnter={event => { if (event.pointerType === 'mouse') onShow(id); }} onPointerLeave={event => { if (event.pointerType === 'mouse') onHide(id); }}
    onFocus={() => onShow(id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHide(id); }}>
    {near && dots.map(({ sale, dx, dy }) => <i key={sale.id} className={s.labDot} data-tone={toneOf(sale.sol)} style={{ left: dx, top: dy }}/>)}
    <i className={s.cloudDot}/><i className={s.cloudStem}/>
    <button type="button" className={s.cloudBot} onPointerDown={() => { openAtTap.current = open; }}
      onClick={event => { if ((event.nativeEvent as PointerEvent).pointerType === 'touch' && !openAtTap.current) onShow(id); else onOpen(sales[0]); }} aria-label={count > 1 ? `${count} sales here; replay ${sales[0].symbol}, the biggest` : `Replay ${first.symbol} ${pc(first.ret)} · ${signedSol(first.sol, 3)}`}>
      <span>{avatar(sales[0], 'size-[22px]')}</span>{count > 1 && <b>{count > 99 ? '99+' : count}</b>}
    </button>
    {open && <div className={s.cloudTip} role="tooltip"><PinCard sales={sales} names={names} onOpen={onOpen}/></div>}
  </div>;
});
const CARD_ROWS = 20;
/** A pin's card: its sales a page at a time as it scrolls, since a pin can hold ninety and each row is a logo and two figures. */
function PinCard({ sales, names, onOpen }: { sales: Sale[]; names: Record<LineKey, string>; onOpen: (sale: Sale) => void }) {
  const [shown, setShown] = useState(CARD_ROWS);
  return <div className={s.cloudTipCard} onScroll={event => { const card = event.currentTarget; if (card.scrollHeight - card.scrollTop - card.clientHeight < 160) setShown(n => Math.min(n + CARD_ROWS, sales.length)); }}>
    {sales.slice(0, shown).map(m => <button key={m.id} type="button" className={s.cloudTipRow} onClick={() => onOpen(m)}>
      <span className={s.cloudTipHead}>{avatar(m, 'size-[18px]')}<b>{m.symbol}</b><b data-tone={toneOf(m.sol)}>{pc(m.ret)}</b><small>{names[m.line]}</small></span>
      <span className={s.cloudTipFigures}><span>Made<b>{signedSol(m.sol, 3)}</b></span><span>{day(m.at)}</span><ChevronRight size={13}/></span>
    </button>)}
  </div>;
}
function SalePins({ host, names, onOpen }: { host: HTMLElement | null; names: Record<LineKey, string>; onOpen: (coin: Omit<ReplayCoin, 'openedAt'>) => void }) {
  const groups = useContext(PinsContext), x = useXAxisScale(), width = useChartWidth() ?? 0, label = useActiveTooltipLabel();
  // The pin whose card is open: it replaces the pointer's time as the lit one.
  const [shown, setShown] = useState<string>();
  const onShow = useCallback((id: string) => setShown(id), []), onHide = useCallback((id: string) => setShown(now => now === id ? undefined : now), []);
  const open = useCallback((sale: Sale) => onOpen({ mint: sale.mint, symbol: sale.symbol, logo: sale.logo }), [onOpen]);
  if (!host || !groups.length) return null;
  const lit = shown ? [shown] : pinsAt(groups, label === undefined ? undefined : x?.(Number(label))).map(g => g.id);
  // A card is at most 17rem (about 240px) wide: centred on its pin where that fits the chart, else running away from the nearer edge.
  const tipX = (at: number) => at >= 120 && at <= width - 120 ? 'center' : at < width / 2 ? 'start' : 'end';
  return createPortal(<div className={s.labPins} data-pinned={shown ? '' : undefined}>
    {groups.map(group => <Pin key={group.id} group={group} near={lit.includes(group.id)} open={shown === group.id} tipX={tipX(group.x)} names={names} onShow={onShow} onHide={onHide} onOpen={open}/>)}
  </div>, host);
}
/** The tooltip over the period: each line's profit at the pointer's time, then the sales on the pins there, biggest first. */
function TimeTip({ label, rows, lines, names, tints }: { label?: unknown; rows: TimeRow[]; lines: LineKey[]; names: Record<LineKey, string>; tints: Record<LineKey, string> }) {
  const groups = useContext(PinsContext), x = useXAxisScale(), at = Number(label);
  if (!Number.isFinite(at)) return null;
  const valueAt = (key: LineKey) => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (rows[i].at <= at && v !== undefined) return v; } };
  const here = pinsAt(groups, x?.(at)).flatMap(g => g.sales).sort((a, b) => Math.abs(b.sol) - Math.abs(a.sol));
  return <div className={s.labTip}><b>{day(at)}</b>
    {lines.map(key => { const v = valueAt(key); return v === undefined ? null : <span key={key}><i data-key={tints[key]}/>{names[key]}<b data-tone={toneOf(v)}>{signedSol(v, 2)}</b></span>; })}
    {here.length > 0 && <small>Sold here</small>}
    {here.slice(0, 5).map(sale => <span key={sale.id} className={s.labTipCoin}><i data-key={tints[sale.line]}/><TokenAvatar className="size-4 rounded-full" address={sale.mint} logoUrl={sale.logo} symbol={sale.symbol} network="solana" fallback="letter" disableDetailFallback/>{sale.symbol}<b data-tone={toneOf(sale.sol)}>{pc(sale.ret)}</b></span>)}
    {here.length > 5 && <small>+{here.length - 5} more</small>}
  </div>;
}
/** The strategy row is rebuilt on every live update, equal or not: its profit line keeps its identity until a point moves, so the chart draws only what changed. */
function useSpark(spark: StrategyRow['spark']) {
  const key = spark.map(point => `${point.at}:${point.pnl}`).join();
  return useMemo(() => spark, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
type TimeChartProps = { time: { rows: TimeRow[]; sales: Sale[] }; lines: LineKey[]; names: Record<LineKey, string>; tints: Record<LineKey, string>; changed: boolean; real: boolean; onOpen: (coin: Omit<ReplayCoin, 'openedAt'>) => void };
/** Over the period: each line as profit, with the sales as pins. Memoised, so the page's live updates that change none of its props draw nothing. */
const TimeChart = memo(function TimeChart({ time, lines, names, tints, changed, real, onOpen }: TimeChartProps) {
  // The pins live in HTML over the chart, in `host`.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <div ref={setHost} className={s.labChart}><ChartContainer config={{}} className={s.labCanvas}>
    <ComposedChart data={time.rows} margin={{ top: 34, right: 12, bottom: 0, left: 0 }}>
      <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="var(--border)"/>
      <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={at => day(at)} tickLine={false} axisLine={false} tickMargin={8} minTickGap={56}/>
      <YAxis tickFormatter={v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`} tickLine={false} axisLine={false} width={48}/>
      <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="3 5"/>
      <Line dataKey="saved" stroke={changed ? 'var(--muted-foreground)' : 'var(--ember)'} strokeWidth={2} dot={false} activeDot={false} connectNulls type="stepAfter" isAnimationActive={false}/>
      {changed && <Line dataKey="draft" stroke="var(--ember)" strokeWidth={2} dot={false} activeDot={false} connectNulls type="stepAfter" isAnimationActive={false}/>}
      {real && <Line dataKey="real" stroke="var(--foreground)" strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={false}/>}
      <PinScope sales={time.sales}>
        <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.35, strokeDasharray: '3 4' }} content={<TimeTip rows={time.rows} lines={lines} names={names} tints={tints}/>}/>
        <SalePins host={host} names={names} onOpen={onOpen}/>
      </PinScope>
    </ComposedChart>
  </ChartContainer></div>;
});
function Curves({ curves, strategy, since, changed, own, real, onOpen }: { curves?: CurveData; strategy: StrategyRow; since: number; changed: boolean; own?: OwnTrade[]; real: boolean; onOpen: (coin: Omit<ReplayCoin, 'openedAt'>) => void }) {
  const [view, setView] = useState<CurveView>('time'), id = useState(() => `band-${Math.random().toString(36).slice(2)}`)[0];
  const lab = changed ? 'draft' : 'saved';
  const lines = useMemo<LineKey[]>(() => [...(real ? ['real' as const] : []), 'saved', ...(changed ? ['draft' as const] : [])], [real, changed]);
  const names = useMemo<Record<LineKey, string>>(() => ({ real: 'Real', saved: changed ? real ? 'Lab, saved' : 'Lab, before' : 'Lab', draft: 'Lab, draft' }), [changed, real]);
  // The swatch of each line's colour: the saved rules are ember while there is no draft beside them.
  const tints = useMemo<Record<LineKey, string>>(() => ({ real: 'real', saved: changed ? 'saved' : 'draft', draft: 'draft' }), [changed]);
  // The period ends at the row's latest profit: a live update that changes neither it nor the line draws nothing.
  const spark = useSpark(strategy.spark), total = realSince(strategy, since);
  const time = useMemo(() => {
    if (!curves) return { rows: [] as TimeRow[], sales: [] as Sale[] };
    const now = Date.now();
    // Real: the strategy's profit line from `since`, ending on its total now; each sale sits on it where it closed.
    const base = [...spark].reverse().find(point => point.at <= since)?.pnl ?? 0;
    const line = [{ at: since, real: 0 }, ...spark.filter(point => point.at > since).map(point => ({ at: point.at, real: point.pnl - base })), { at: now, real: total }];
    const realAt = (at: number) => { const i = line.findIndex(p => p.at >= at); if (i <= 0) return line[Math.max(0, i)].real; const a = line[i - 1], b = line[i]; return a.real + (b.real - a.real) * (at - a.at) / Math.max(1, b.at - a.at); };
    const sold = (own ?? []).filter(trade => trade.closedAt > since).sort((a, b) => a.closedAt - b.closedAt);
    const sales: Sale[] = [], ids = new Set<string>();
    const add = (sale: Omit<Sale, 'id'>) => { let key = `${sale.line}:${sale.mint}:${sale.at}`; while (ids.has(key)) key += '+'; ids.add(key); sales.push({ ...sale, id: key }); };
    for (const trade of sold) add({ line: 'real', mint: trade.token.address, symbol: trade.token.symbol, logo: trade.token.logoUri, ret: trade.changePct / 100, sol: trade.pnlSol, at: trade.closedAt, value: realAt(trade.closedAt) });
    for (const p of curves[lab]) add({ line: lab, mint: p.mint, symbol: p.symbol || p.mint.slice(0, 4), logo: p.logo, ret: p.ret, sol: p.sol, at: p.at, value: p.total });
    const rows: TimeRow[] = [{ at: since, ...(real ? { real: 0 } : {}), saved: 0, draft: 0 }, ...(real ? line.slice(1) : []), ...sold.map(trade => ({ at: trade.closedAt, real: realAt(trade.closedAt) })),
      ...curves.saved.map(p => ({ at: p.at, saved: p.total })), ...(changed ? curves.draft.map(p => ({ at: p.at, draft: p.total })) : [])];
    return { rows: rows.sort((a, b) => a.at - b.at), sales };
  }, [curves, spark, total, since, changed, own, real, lab]);
  const buy = useMemo(() => curves?.since.map(p => ({ ...p, band: [p.p25, p.p75] as [number, number] })) ?? [], [curves]);
  const views: { id: CurveView; name: string }[] = [{ id: 'time', name: 'Over the period' }, { id: 'buy', name: 'Since the buy' }, { id: 'cap', name: 'By market cap' }, { id: 'age', name: 'By age' }];
  return <section className={`${s.surface} ${s.labCurves}`} aria-label="Curves">
    <div className={s.labListHead}>
      <div className={s.seg} role="group" aria-label="Curve">{views.map(v => <button type="button" key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.name}</button>)}</div>
      {view === 'time' && <ul className={s.labLegend}>{lines.map(key => <li key={key} data-key={tints[key]}>{names[key]}</li>)}</ul>}
      {view === 'buy' && <ul className={s.labLegend}><li data-key="draft">Mean</li><li data-key="median">Median</li><li data-key="band">Middle half</li></ul>}
    </div>
    {!curves ? <div className={s.labRowsLoading}/> : view === 'time' ? <TimeChart time={time} lines={lines} names={names} tints={tints} changed={changed} real={real} onOpen={onOpen}/> : view === 'buy' ? <ChartContainer config={{}} className={s.labCanvas}>
      <ComposedChart data={buy} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ember)" stopOpacity={0.16}/><stop offset="100%" stopColor="var(--ember)" stopOpacity={0.06}/></linearGradient></defs>
        <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="var(--border)"/>
        <XAxis dataKey="minute" type="number" domain={[0, 240]} ticks={[0, 15, 30, 60, 120, 180, 240]} tickFormatter={minutesText} tickLine={false} axisLine={false} tickMargin={8}/>
        <YAxis tickFormatter={v => pc(v)} tickLine={false} axisLine={false} width={48}/>
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="3 5"/>
        <Area dataKey="band" stroke="none" fill={`url(#${id})`} isAnimationActive={false} activeDot={false}/>
        <Line dataKey="median" stroke="var(--foreground)" strokeOpacity={0.75} strokeWidth={2} dot={false} isAnimationActive={false}/>
        <Line dataKey="mean" stroke="var(--ember)" strokeWidth={2} dot={false} isAnimationActive={false}/>
        <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.35, strokeDasharray: '3 4' }} content={({ payload }) => {
          const p = payload?.[0]?.payload as typeof buy[number] | undefined;
          return p ? <div className={s.labTip}><b>{minutesText(p.minute)} after the buy</b><span><i data-key="draft"/>Mean<b data-tone={toneOf(p.mean)}>{pc(p.mean)}</b></span><span><i data-key="median"/>Median<b data-tone={toneOf(p.median)}>{pc(p.median)}</b></span><span><i data-key="band"/>Middle half<b>{pc(p.p25)} to {pc(p.p75)}</b></span><small>{p.held} still held</small></div> : null;
        }}/>
      </ComposedChart>
    </ChartContainer> : <Segments rows={view === 'cap' ? curves.cap : curves.age} by={view}/>}
  </section>;
}
function Segments({ rows, by }: { rows: CurveData['cap']; by: 'cap' | 'age' }) {
  return <div className={s.labSegments} role="table" aria-label={by === 'cap' ? 'By market cap at the read' : 'By age at the read'}>
    <div role="row"><span role="columnheader">{by === 'cap' ? 'Cap at the read' : 'Age at the read'}</span><span role="columnheader">Coins</span><span role="columnheader">Picked</span><span role="columnheader">1h high</span><span role="columnheader">2× in 4h</span><span role="columnheader">Halved in 1h</span><span role="columnheader">Bought at read</span></div>
    {rows.map(row => <div role="row" key={row.label}>
      <span role="cell">{row.label}</span><span role="cell">{row.coins.toLocaleString()}</span><span role="cell">{row.picks.toLocaleString()}</span>
      <span role="cell" data-tone={toneOf(row.high1h)}>{pc(row.high1h)}</span><span role="cell">{Math.round(row.doubled * 100)}%</span><span role="cell">{Math.round(row.halved * 100)}%</span>
      <span role="cell" data-tone={toneOf(row.market)}>{pc(row.market)}</span>
    </div>)}
  </div>;
}

const SORTS = [{ id: 'new', name: 'Newest' }, { id: 'win', name: 'Winners' }, { id: 'loss', name: 'Losers' }, { id: 'run', name: 'Biggest run' }] as const;
type Sort = typeof SORTS[number]['id'];
const PAGE = 50;
/** Every coin with its decision and outcome: when research read it and at what cap, the draft's verdict (and whether it changed from the
 *  saved rules), the trade or why there was none, the result, the run in 4 hours and what the strategy really made on it. */
function CoinList({ views, own, filter, setFilter, selected, onOpen, pending }: { views?: CoinView[]; own?: OwnTrade[]; filter: Filter; setFilter: (filter: Filter) => void; selected?: string; onOpen: (view: CoinView) => void; pending: boolean }) {
  const [sort, setSort] = useState<Sort>('new'), [shown, setShown] = useState(PAGE);
  const real = useMemo(() => { const book = new Map<string, { pnl: number; in: number }>(); for (const t of own ?? []) { const row = book.get(t.token.address) ?? { pnl: 0, in: 0 }; row.pnl += t.pnlSol; row.in += t.inSol; book.set(t.token.address, row); } return book; }, [own]);
  const rows = useMemo(() => {
    const list = (views ?? []).filter(v => passes(filter, v));
    return list.sort(sort === 'new' ? (a, b) => b.readAt - a.readAt : sort === 'win' ? (a, b) => (resultOf(b) ?? -Infinity) - (resultOf(a) ?? -Infinity) : sort === 'loss' ? (a, b) => (resultOf(a) ?? Infinity) - (resultOf(b) ?? Infinity) : (a, b) => (b.high ?? -1) - (a.high ?? -1));
  }, [views, filter, sort]);
  const counts = useMemo(() => new Map(FILTERS.map(f => [f.id, (views ?? []).filter(f.test).length])), [views]);
  return <section className={`${s.surface} ${s.labList}`} aria-label="Coins" data-pending={pending || undefined}>
    <div className={s.labListHead}>
      <div className={s.seg} role="group" aria-label="Show">
        {FILTERS.map(f => <button type="button" key={f.id} aria-pressed={filter.id === f.id} onClick={() => { setFilter({ id: f.id }); setShown(PAGE); }}>{f.name}<small>{counts.get(f.id)?.toLocaleString() ?? ''}</small></button>)}
        {filter.id === 'gap' && <button type="button" aria-pressed onClick={() => setFilter({ id: 'all' })}>{filter.label}<small>{filter.mints!.size}</small></button>}
      </div>
      <div className={s.seg} role="group" aria-label="Sort">{SORTS.map(o => <button type="button" key={o.id} aria-pressed={sort === o.id} onClick={() => setSort(o.id)}>{o.name}</button>)}</div>
    </div>
    {!views ? <div className={s.labRowsLoading} role="status" aria-label="Replaying every coin"/> : !rows.length ? <p className={s.empty}>No coin here on these settings.</p> : <>
      <div className={s.coinRows} role="table" aria-label="Coins">
        <div role="row" className={s.coinRowsHead}><span role="columnheader">Coin</span><span role="columnheader">Read</span><span role="columnheader">Cap</span><span role="columnheader">Draft</span><span role="columnheader">Trade</span><span role="columnheader">Result</span><span role="columnheader">4h run</span><span role="columnheader">Real</span></div>
        {rows.slice(0, shown).map(v => <CoinLine key={v.mint} v={v} real={real.get(v.mint)} selected={selected === v.mint} onOpen={onOpen}/>)}
      </div>
      {rows.length > shown && <button type="button" className={s.labMore} onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length.toLocaleString()}</button>}
    </>}
  </section>;
}
function CoinLine({ v, real, selected, onOpen }: { v: CoinView; real?: { pnl: number; in: number }; selected: boolean; onOpen: (view: CoinView) => void }) {
  const cap = v.cap, out = v.out, bought = out?.status === 'traded' && !out.full, r = resultOf(v);
  const flip = v.before !== null && (v.before === 'pick') !== (v.verdict === 'pick') ? v.verdict === 'pick' ? 'in' : 'out' : undefined;
  const trade = !out ? null : out.full ? 'No room' : out.status === 'expired' ? 'No dip' : out.status === 'chased' ? 'Ran up' : out.status === 'nodata' ? 'No prices' : out.open ? 'Held' : out.reason ?? 'Sold';
  return <button type="button" role="row" className={s.labLine} data-selected={selected || undefined} data-flip={flip} onClick={() => onOpen(v)}>
    <span role="cell" className={s.labCoin}><TokenAvatar className="size-7 rounded-[28%]" address={v.mint} logoUrl={v.logo} symbol={v.symbol} network="solana" fallback="letter" disableDetailFallback/><b>{v.symbol || v.mint.slice(0, 4)}</b></span>
    <span role="cell" className={s.labMuted}>{day(v.readAt)}</span>
    <span role="cell">{cap ? usd(cap) : '–'}</span>
    <span role="cell" className={s.labVerdictCell}><span className={s.labVerdict} data-verdict={v.verdict}>{v.verdict === 'pick' ? <><Check/>Pick</> : checkLabel(v.check ?? 'fit')}</span>{flip ? <small className={s.labTag} data-flip={flip}>{flip === 'in' ? 'new' : 'dropped'}</small> : v.recheck ? <small className={s.labTag}>re-check</small> : null}</span>
    <span role="cell" className={s.labMuted} title={trade ?? undefined}>{trade ?? '–'}</span>
    <span role="cell"><b data-tone={toneOf(r)} data-muted={!bought || undefined} title={bought ? 'The draft’s trade' : 'Had it been bought at its read'}>{pc(r)}</b></span>
    <span role="cell" data-tone={toneOf(v.high)}>{v.high !== undefined ? (v.high >= 1 ? `${+(1 + v.high).toFixed(1)}×` : pc(v.high)) : '–'}</span>
    <span role="cell">{real ? <b data-tone={toneOf(real.pnl)}>{pc(real.pnl / Math.max(real.in, 1e-9))}</b> : <span className={s.labMuted}>–</span>}</span>
  </button>;
}

// ---- Results ----
/** Real against the Lab on the same dates, then why they differ coin by coin: picks the strategy never bought, coins it bought the Lab turns
 *  down, and the coins both have. Each part opens its coins in the list. */
/** `base`: a strategy not made yet, named by what it started from; it has no real side and compares the draft with that start. */
function Verdict({ strategy, since, now, next, changed, size, unreplayed, gap, base, onShow }: { strategy: StrategyRow; since: number; now?: Result; next?: Result; changed: boolean; size: number; unreplayed: string[]; gap?: Gap; base?: string; onShow: (label: string, mints: string[]) => void }) {
  const real = realSince(strategy, since), r = changed ? next : now;
  return <section className={`${s.surface} ${s.studioVerdict}`} aria-label={base ? 'The Lab' : 'Real against the Lab'}>
    <BlockHead title={base ? 'If it had run' : 'Real against the Lab'} note={`since ${day(since)}`}/>
    <div className={s.studioScore}>
      {!base && <Hint text={`What ${strategy.name} made since ${day(since)}: sold coins plus what it holds at the latest prices.`}>
        <div className={s.studioFigure} data-real><small>Real</small><b className={s[toneOf(real) ?? 'muted']}>{sol2(real)}<em>SOL</em></b></div>
      </Hint>}
      {now && <Hint text={`Every coin ${base ? 'research' : 'its research'} read since ${day(since)} that ${base ? 'these rules' : 'the saved rules'} pick, entered by SniperBot's entry and sold by the exit plan alone with the worker's fills on 1-second prices, at its own size (up to ${size} SOL a coin, by research's confidence and the pool) and its coins-at-once limit. TraderBot's own sales and re-buys aren't replayed.`}>
        <div><Figure label={base ? changed ? base : 'Lab' : changed ? 'Lab, saved' : 'Lab'} result={now} muted={changed}/></div>
      </Hint>}
      {changed && next && now && <><span className={s.studioArrow} data-tone={toneOf(next.totalSol - now.totalSol)}><ArrowRight/><b>{signedSol(next.totalSol - now.totalSol, 2)}</b></span><Figure label="Lab, draft" result={next} accent/></>}
    </div>
    {unreplayed.length > 0 && <p className={s.labNote}>Lab replays do not include {unreplayed.join(' or ')}.</p>}
    {gap && <GapParts gap={gap} onShow={onShow}/>}
    {r && <dl className={s.studioFacts}>
      <Fact label="Median trade" value={pc(r.median)} tone={toneOf(r.median)} hint="The middle trade's return: what a typical coin did."/>
      <Fact label="Best 3 carry" value={signedSol(r.best3 * size, 1)} tone={toneOf(r.best3)} hint="The three best trades' profit together. When it is most of the total, a few runners make the result."/>
      <Fact label="Without best 3" value={pc(r.meanTrim)} tone={toneOf(r.meanTrim)} hint="A trade's mean once the three best are taken out."/>
      <Fact label="Likely a trade" value={<><span data-tone={toneOf(r.low)}>{pc(r.low)}</span><span data-tone={toneOf(r.high)}>{pc(r.high)}</span></>} hint="Where a trade's mean lands in 9 of 10 random redraws of these trades. A narrow range means the result is steady."/>
    </dl>}
  </section>;
}
const WHY: Record<string, string> = { unread: 'not read in the Lab’s window', 'not-bought': 'Lab picks it, no room or entry' };
function GapParts({ gap, onShow }: { gap: Gap; onShow: (label: string, mints: string[]) => void }) {
  const part = (label: string, mints: string[], value: ReactNode, sub: ReactNode) => <button type="button" className={s.labGap} onClick={() => onShow(label, mints)} disabled={!mints.length}>
    <span><b>{label}</b><small>{sub}</small></span><span>{value}</span><ArrowDown className={s.labGapGo}/>
  </button>;
  const top = gap.realOnly.why[0];
  return <div className={s.labGaps} aria-label="Why they differ">
    <small>Coin by coin since {day(gap.from)}</small>
    {part('Lab picks it never bought', gap.labOnly.mints, <b data-tone={toneOf(gap.labOnly.labSol)}>{sol2(gap.labOnly.labSol)}</b>, `${gap.labOnly.mints.length} coins: never seen, or no room`)}
    {part('Bought, Lab turns down', gap.realOnly.mints, <b data-tone={toneOf(gap.realOnly.realSol)}>{sol2(gap.realOnly.realSol)}</b>, `${gap.realOnly.mints.length} coins${top ? ` · most ${WHY[top.key] ?? checkLabel(top.key).toLowerCase()}` : ''}`)}
    {part('Both have', gap.both.mints, <span className={s.labGapPair}><b data-tone={toneOf(gap.both.labSol)}>{sol2(gap.both.labSol)}</b><ArrowRight/><b data-tone={toneOf(gap.both.realSol)}>{sol2(gap.both.realSol)}</b></span>, `${gap.both.mints.length} coins: Lab, then real`)}
  </div>;
}
function Figure({ label, result: r, accent, muted }: { label: string; result: Result; accent?: boolean; muted?: boolean }) {
  return <div className={s.studioFigure} data-accent={accent || undefined} data-muted={muted || undefined}>
    <small>{label}</small>
    <b className={s[toneOf(r.totalSol) ?? 'muted']}>{sol2(r.totalSol)}<em>SOL</em></b>
    <span>{r.traded.toLocaleString()} bought · {r.traded ? Math.round(100 * r.won / r.traded) : 0}% won</span>
  </div>;
}
function Fact({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  const body = <><dt>{label}</dt><dd data-tone={tone}>{value}</dd></>;
  return hint ? <Hint text={hint}><div className={s.studioFact}>{body}</div></Hint> : <div className={s.studioFact}>{body}</div>;
}
function TrailPick({ draft }: { draft: SettingsDraft }) {
  const trail = trailPct(draft.rules.exits) ?? 0, choices = [...new Set<number>([0, ...TRAIL.choices, trail])].sort((a, b) => a - b);
  return <Select value={String(trail)} onValueChange={value => draft.set({ stopLossPct: Number(value) })}>
    <SelectTrigger size="sm" className={s.feedFilter} aria-label="Trailing stop"><SelectValue>{trail ? `${trail}% trail` : 'No trail'}</SelectValue></SelectTrigger>
    <SelectContent position="popper" align="end">{choices.map(pct => <SelectItem key={pct} value={String(pct)}>{pct ? `${pct}% trailing stop` : 'No trailing stop'}</SelectItem>)}</SelectContent>
  </Select>;
}

/** Every named plan on the draft's picks at its trailing stop, best first; picking one puts it in the draft. A draft whose plan is no named
 *  one (edited, or an older version under a plan's name) shows its own on top. `trail` sets the stop when no sold-coins column does. */
function Plans({ plans, next, draft, trail }: { plans?: { id: string; result: Result }[]; next?: Result; draft: SettingsDraft; trail?: ReactNode }) {
  const head = <BlockHead title="Exit plans" hint={`Every named plan on the draft’s picks ${trailPct(draft.rules.exits) ? `at its ${trailPct(draft.rules.exits)}% trailing stop` : 'with no trailing stop'}. Pick one to put it in the draft.`}>{trail}</BlockHead>;
  if (!plans || !next) return <div className={s.labCol}>{head}<div className={s.labRowsLoading}/></div>;
  const current = planIdOf(draft);
  return <div className={s.labCol}>
    {head}
    <ol className={`${s.studioLedger} ${s.labColBody}`}>
      {!current && <li data-current><span className={s.studioOwnPlan}><span><Hint text="The plan this draft sells by: no named plan matches its levels."><span>{draft.rules.exits.name}, its own</span></Hint><i>draft</i></span><b className={s[toneOf(next.totalSol) ?? 'muted']}>{signedSol(next.totalSol, 2)}</b></span></li>}
      {plans.map(({ id, result: r }) => <li key={id} data-current={id === current || undefined}>
        <button type="button" onClick={() => draft.set({ exitPlan: id as ExitPlanId })} aria-pressed={id === current}>
          <span><Hint text={`${EXIT_PLANS[id as ExitPlanId].summary} ${r.traded ? Math.round(100 * r.won / r.traded) : 0}% won, ${pc(r.meanTrim)} a trade without the best 3.`}><span>{EXIT_PLANS[id as ExitPlanId].exits.name}</span></Hint>{id === current && <i>draft</i>}</span>
          <b className={s[toneOf(r.totalSol) ?? 'muted']}>{signedSol(r.totalSol, 2)}</b>
        </button>
      </li>)}
    </ol>
  </div>;
}

/** The strategy's own sold coins under every plan at the draft's trail, against what they made: the server Lab holds each from its real buy and fill. */
function OwnTrades({ own, plans, draft, whose }: { own?: OwnTrade[]; plans?: OwnPlans; draft: SettingsDraft; whose?: string }) {
  const current = planIdOf(draft);
  const head = <BlockHead title={whose ? `${whose}’s sold coins` : 'Its sold coins'} hint={own?.length && plans ? `${plans.covered} of ${own.length >= OWN_LIMIT ? `the latest ${OWN_LIMIT}` : own.length} sold coins have prices. Every plan replays from their real buys and fills at this trailing stop.` : undefined}><TrailPick draft={draft}/></BlockHead>;
  if (!own || (own.length && !plans)) return <div className={s.labCol}>{head}<div className={s.labRowsLoading}/></div>;
  if (!own.length || !plans) return <div className={s.labCol}>{head}<p className={s.empty}>Nothing sold yet.</p></div>;
  return <div className={s.labCol}>
    {head}
    <ol className={`${s.studioLedger} ${s.labColBody}`}>
      <li data-actual><span>What it made</span><b className={s[toneOf(plans.actual) ?? 'muted']}>{signedSol(plans.actual, 2)}</b></li>
      {plans.rows.map(row => row.id === null
        ? <li key="own" data-current><span className={s.studioOwnPlan}><span><span>{row.name}, its own</span><i>draft</i></span><b className={s[toneOf(row.sol) ?? 'muted']}>{signedSol(row.sol, 2)}</b></span></li>
        : <li key={row.id} data-current={row.id === current || undefined}>
          <button type="button" onClick={() => draft.set({ exitPlan: row.id! })} aria-pressed={row.id === current}>
            <span><Hint text={EXIT_PLANS[row.id].summary}><span>{row.name}</span></Hint>{row.id === current && <i>draft</i>}</span>
            <b className={s[toneOf(row.sol) ?? 'muted']}>{signedSol(row.sol, 2)}</b>
          </button>
        </li>)}
    </ol>
  </div>;
}

function Losses({ own, openCoin }: { own?: OwnTrade[]; openCoin: (coin: Omit<ReplayCoin, 'openedAt'>) => void }) {
  const groups = useMemo(() => own ? byExit(own) : [], [own]);
  const head = <BlockHead title="Where the money went" hint={own?.length ? `${own.length} sold coins by why they sold, losses first. Each row: coins lost of coins sold.` : undefined}/>;
  if (!own?.length) return <div className={s.labCol}>{head}{own ? <p className={s.empty}>Nothing sold yet.</p> : <div className={s.labRowsLoading}/>}</div>;
  const worst = [...own].sort((a, b) => a.pnlSol - b.pnlSol).slice(0, 6).filter(trade => trade.pnlSol < 0);
  return <div className={s.labCol}>
    {head}
    <div className={s.labColBody}>
      <ol className={s.studioReasons}>{groups.map(group => <li key={group.key}>
        <span title={group.key}>{group.key}</span>
        <small title={`${group.lost} of ${group.trades.length} lost`}>{group.lost ? <em>{group.lost}</em> : 0}/{group.trades.length}</small>
        <b className={s[toneOf(group.sol) ?? 'muted']}>{signedSol(group.sol, 2)}</b>
      </li>)}</ol>
      {worst.length > 0 && <div className={s.studioWorst}><small>Worst</small>{worst.map(trade => <CoinPill key={trade.id} onClick={() => openCoin({ mint: trade.token.address, symbol: trade.token.symbol, logo: trade.token.logoUri })} coins={[{ symbol: trade.token.symbol, logo: trade.token.logoUri, address: trade.token.address }]} note={signedSol(trade.pnlSol, 2)} tone="down"/>)}</div>}
    </div>
  </div>;
}

function BlockHead({ title, note, hint, children }: { title: string; note?: string; hint?: string; children?: ReactNode }) {
  return <div className={s.studioBlockHead}><h2>{hint ? <Hint text={hint}><span>{title}</span></Hint> : title}{note && <small>{note}</small>}</h2>{children}</div>;
}
