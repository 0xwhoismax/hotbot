"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import { ArrowLeft, ChevronRight, Ellipsis, Flag, LoaderCircle, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { change, type HomeData, type StrategyRow } from './data';
import { ArchivedNotice, ArchivedStrategies, ArchiveStrategyButton } from './ArchiveStrategy';
import { SellStrategyButton } from './SellStrategy';
import { StrategyMenu, StrategySheet } from './StrategyMenu';
import { RealSolCopies } from './TeamWallet';
import { ago, appHref, signedSol, sol, tone } from './format';
import { RearmStrategy, hasCopy, stopRoom } from './LossStop';
import { budgetLeft, heldCost } from '../../../../types/buyGate';
import { AddressChip, AddStrategyButton, Back, bagProfit, CheckCoinButton, CoinPill, CoinSlots, Coins, CoinSort, DecisionDialog, Loading, NeedsYou, ranked, RealSolMark, StrategyCard, useTwoColumns, type Order } from './Parts';
import { DayFunnel, NearMisses, NextUp, ResearchStatus, Runners } from './Picks';
import { PULSE } from '../../../../types/pulse';
import { SettingsButton, SettingsEditor, useSettingsDraft } from './Settings';
import { useReport } from './Report';
import { useCommand, viewAsAtom } from './state';
import { ActivityFilter, Paged, Stream, useDeskRows, type Show } from './Stream';
import { ProfitChart } from './ProfitChart';
import { ReplayControl, useReplay } from './Replay';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { useTabVisible } from '@/hooks/useTabVisible';
import { SOLD_REF } from '../../../../types/coinKey';
import { isAdminAtom } from '@/store/user/atoms';
import { DEFAULT_RESEARCH_POLICY } from '../../../../types/hotbot';
import { codeGate, researchCriteria } from '../../../../types/hotbotResearch';
import { describeExits } from '../../../../types/exits';
import { plainRules } from '../../../../types/team';
import { ExitBars, PlainChips, type ExitBar } from './Plain';
import { exitFamily } from '../../../../types/performance';
import s from './team.module.css';
import { Link, pushOnPage, useBack, usePlace } from '@/lib/appNavigation';

/** A strategy's full rules as the rules page shows them, from the rules it already carries: what it looks for, its research checks (dark: must-have),
 *  pass mark, money and exit plan. */
function StrategyFacts({ row, exits }: { row: StrategyRow; exits: ExitBar[] | undefined }) {
  const rules = row.rules, pass = (rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;
  const checks = researchCriteria(rules, { missing: [] }, 'probe', false);
  return <div className={`${s.surface} ${s.ruleCard}`}>
    <PlainChips chips={plainRules(rules, row.dipPct)}/>
    <ul className={s.ruleChecks} aria-label="Research checks">{checks.map(check => <li key={check.key} data-hard={check.mode === 'hard' || undefined} title={check.target}>{check.label}</li>)}</ul>
    <dl className={s.ruleNumbers}>
      <div><dt>Pass</dt><dd>{pass}</dd></div><div><dt>Gate</dt><dd>{codeGate([], pass).bar}</dd></div>
      <div><dt>Per coin</dt><dd>{rules.amountSol} SOL</dd></div><div><dt>At once</dt><dd>{rules.maxOpenPositions}</dd></div><div><dt>Budget</dt><dd>{rules.allocationSol} SOL</dd></div>
    </dl>
    <p className={s.ruleExit}>{describeExits(rules.exits)}</p>
    {exits?.length ? <ExitBars exits={exits} now={Date.now()}/> : <p className={s.labNote}>{exits ? 'Nothing sold yet.' : 'Reading what it sold…'}</p>}
  </div>;
}

/** Running strategies (and any selling out to be archived) first; paused ones fold away beneath them, archived ones below that.
 *  The header carries only how many are running. */
export function StrategiesPage({ data }: { data: HomeData }) {
  const active = data.strategies.filter(row => row.status !== 'paused'), paused = data.strategies.filter(row => row.status === 'paused');
  const running = active.filter(row => row.status === 'running').length;
  const [full, setFull] = useState(false), viewAs = useAtomValue(viewAsAtom);
  // What each strategy's closed coins exited on: one small row per strategy kept up to date by the server, read only while Full info is on.
  const exits = useQuery(api.team.exits, full ? { ...viewAs } : 'skip');
  const exitsOf = (id: StrategyRow['id']): ExitBar[] | undefined => exits && (exits.find(row => row.strategyId === id)?.exits ?? []).map(group => ({ ...group, key: exitFamily(group.example) }));
  const cards = (rows: StrategyRow[]) => full
    ? <div className={s.ruleCards}>{rows.map(row => <div key={row.id} className={s.fullStrategy}><StrategyCard row={row}/><StrategyFacts row={row} exits={exitsOf(row.id)}/></div>)}</div>
    : <div className={s.strategies}>{rows.map(row => <StrategyCard key={row.id} row={row}/>)}</div>;
  return <div className={s.page}>
    <header className={s.head}>
      <h1 className={s.title}>Strategies<span className={s.titleCount}>{running} running</span></h1>
      <div className={s.headActions}>
        <button type="button" className={s.toggleButton} onClick={() => setFull(!full)}>{full ? <Minimize2/> : <Maximize2/>}<span className={s.wideLabel}>{full ? 'Compact' : 'Full info'}</span></button>
        <CheckCoinButton/><RealSolCopies data={data}/><AddStrategyButton/>
      </div>
    </header>
    {active.length > 0 ? cards(active) : !paused.length && <p className={s.empty}>{data.archived.length ? 'Every strategy is archived. Restore one below or add a new one.' : 'No strategies yet. Add one to put the team to work.'}</p>}
    {paused.length > 0 && (active.length ? <Collapsible className={s.exact}>
      <CollapsibleTrigger><ChevronRight/>Paused<small>{paused.length}</small></CollapsibleTrigger>
      <CollapsibleContent><div className={s.strategyGroup}>{cards(paused)}</div></CollapsibleContent>
    </Collapsible> : cards(paused))}
    {data.archived.length > 0 && <ArchivedStrategies rows={data.archived}/>}
  </div>;
}

/** Sold coins a strategy page shows first, and adds each time the reader nears the end of the list. */
const SOLD_PAGE = 20;
type SoldRow = FunctionReturnType<typeof api.team.sold>['page'][number];
/** A practice strategy's sales the worker's desk holds (`useDeskRows`), which its hour packs hold only once the hour is sealed, in Convex's
 *  pages: each sale once, by its pack's id, in the list's order. */
function withDeskSold(rows: SoldRow[] | undefined, desk: SoldRow[] | null, order: 'newest' | 'best' | 'worst') {
  if (!rows || !desk?.length) return rows;
  const seen = new Set(rows.map(row => row.id)), fresh = desk.filter(row => !seen.has(row.id));
  if (!fresh.length) return rows;
  const rank = (row: SoldRow) => order === 'newest' ? -row.closedAt : order === 'best' ? -row.pnlSol : row.pnlSol;
  return [...rows, ...fresh].sort((a, b) => rank(a) - rank(b));
}

/** One strategy: is it making money, what it holds and why, what its bots line up and let go, what it sold and why. Its settings open in its place from the header's Settings button.
 *  Replay plays the page back from the strategy's first move: its figures, chart, coins held and sold and its activity show the replay's clock
 *  (`past`) until it ends or is stopped, and what needs you, runs or waits to buy steps aside meanwhile, the Picks tab with it.
 *  Wide: the header with Pause (Run while paused), Sell all, Settings and Archive, a full-width profit chart, then Holdings/Picks/Sold tabs beside a column of the
 *  bots' last day (practice on the worker's desk) over live Activity. Narrow (phones, a tablet between both sidebars): one centred Chat-width column with a round
 *  back, the name, Pause/Run and the Settings gear on one line, the profit panel, then Holdings/Sold/Activity tabs with a round sort (Activity: filter)
 *  button at the end of the tab bar; the picks follow the holdings and the last day heads Activity. Archive sits at the end of Settings there, and Sell all
 *  sits above the holdings. Sold coins load when the Sold tab first opens. Held coins past a runner tier show as a Running row under the header. */
export function StrategyPage({ data, id }: { data: HomeData; id: string }) {
  const { describe: price } = usePriceDisplay();
  const command = useCommand(), report = useReport(), as = useAtomValue(viewAsAtom), isAdmin = useAtomValue(isAdminAtom), strategy = data.strategies.find(row => row.id === id);
  const back = useBack({ href: appHref('strategies'), label: 'Strategies' });
  usePlace(strategy?.name, id);
  const [pageRef, wide] = useTwoColumns();
  const [coin, setCoin] = useState<string | null>(null), [tab, setTab] = useState('coins'), [soldOpened, setSoldOpened] = useState(false), [order, setOrder] = useState<Order>('newest'), [show, setShow] = useState<Show>(), [replaySold, setReplaySold] = useState(SOLD_PAGE);
  const tabsPane = useRef<HTMLDivElement>(null);
  // A page that never opens Sold reads none of it: its first page loads when the tab first opens, and its count comes from the strategy row.
  if (tab === 'sold' && !soldOpened) setSoldOpened(true);
  const replay = useReplay(data, strategy), past = replay.view;
  // Settings' unsaved draft and whether it is open live here, so the wide and narrow headers' buttons share them.
  const settings = useSettingsDraft(strategy), [settingsOpen, setSettingsOpen] = useState(false);
  // Settings are a history entry of their own, so the browser's Back and the back link both return to the strategy, not to the list.
  useEffect(() => { const sync = () => setSettingsOpen(Boolean(window.history.state?.settings)); sync(); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); }, []);
  const openSettings = () => { pushOnPage({ settings: true }); setSettingsOpen(true); };
  const closeSettings = () => { if (window.history.state?.settings) window.history.back(); else setSettingsOpen(false); };
  // Sold coins page in from the server in the chosen order; a new order keeps the list it replaces on screen until its first page arrives.
  const soldPages = usePaginatedQuery(api.team.sold, strategy && soldOpened ? { mode: data.workspace.mode, strategyId: id, order, ...as } : 'skip', { initialNumItems: SOLD_PAGE });
  const soldKey = `${id}:${data.workspace.mode}`, [soldKept, setSoldKept] = useState<{ key: string; rows: typeof soldPages.results }>();
  if (soldPages.status !== 'LoadingFirstPage' && (soldKept?.key !== soldKey || soldKept.rows !== soldPages.results)) setSoldKept({ key: soldKey, rows: soldPages.results });
  const paged = soldPages.status !== 'LoadingFirstPage' ? soldPages.results : soldKept?.key === soldKey ? soldKept.rows : undefined;
  const tabVisible = useTabVisible(), deskSold = useDeskRows<SoldRow>(SOLD_REF + id, Boolean(strategy && soldOpened && !past && strategy.mode === 'paper') && tabVisible);
  const sold = useMemo(() => withDeskSold(paged, deskSold, order), [paged, deskSold, order]);
  if (!strategy) {
    const archived = data.archived.find(row => row.id === id);
    return <div className={s.page}><Back {...back}/>{archived ? <ArchivedNotice row={archived}/> : <p className={s.empty}>This strategy no longer exists.</p>}</div>;
  }
  // Settings take the page's whole frame under the back link; the draft stays here while they are closed.
  if (settingsOpen) return <div key="settings" ref={pageRef} className={`${s.page} ${s.strategyPage} ${s.settingsPage}`} data-wide={wide || undefined}>
    {wide && <button type="button" className={s.back} onClick={closeSettings}><ArrowLeft size={14}/>{strategy.name}</button>}
    <SettingsEditor data={data} draft={settings!} onClose={wide ? undefined : closeSettings}/>
  </div>;
  const archiving = strategy.status === 'archiving', running = strategy.status === 'running';
  // Wide pages show Activity as its own column, so a remembered Activity tab falls back to the coins; the Picks tab is a wide page's, and a replay has none.
  const current = (wide && tab === 'activity') || ((past || !wide) && tab === 'picks') ? 'coins' : tab;
  const bags = ranked(data.bags.filter(bag => bag.strategyId === id), order, bag => bag.boughtAt ?? bag.at, bagProfit), needs = past ? [] : data.needs.filter(item => item.strategyId === id), watching = past ? [] : data.watching.filter(item => item.strategyId === id);
  const pulse = past ? null : strategy.pulse, next = pulse?.next ?? [], inPlay = watching.length + needs.length;
  const held = past && ranked(past.held, order, coin => coin.boughtAt, coin => coin.pnl ?? null), heldCount = past ? past.heldCount : bags.length, listed = held ? held.length : bags.length;
  const total = past ? past.total : strategy.realizedPnlSol + strategy.openPnlSol, realized = past ? past.realized : strategy.realizedPnlSol;
  const soldCount = past ? past.soldCount : strategy.sold, wins = past ? past.wins : strategy.wins, soldListed = past ? past.sold.length : soldCount;
  // Free is the Real SOL budget less what is in coins at the cost still held and what is lost below its best point (types/buyGate, as the gate
  // reads it). A replay has no loss history.
  const liveNow = !past && strategy.mode === 'live', lost = liveNow ? strategy.loss?.lostSol ?? 0 : 0, left = budgetLeft({ mode: strategy.mode, rules: strategy.rules, lostSol: lost });
  const inCoins = past ? past.inCoins : heldCost(bags.map(bag => bag.entry?.sol ?? bag.amountSol));
  const stop = past ? null : stopRoom(strategy, hasCopy(data, id));
  // A loss stop holds the strategy until its re-arm; one selling out to its archive keeps only its archive controls.
  const stopped = strategy.loss?.stoppedAt != null;
  const runControl = archiving ? <span className={s.toggleButton} data-busy><LoaderCircle size={15} className="animate-spin"/>{stopped ? 'Stopped · ' : ''}{bags.length ? `${stopped ? 'selling' : 'Selling'} ${bags.length} to archive` : 'Archiving'}</span>
    : stopped && strategy.status === 'paused' ? <RearmStrategy strategy={strategy}/>
    : <button type="button" className={s.toggleButton} data-go={!running || undefined} onClick={() => command({ type: running ? 'pause' : 'resume', strategyId: id })}>{running ? <><Pause/>Pause</> : <><Play/>Run</>}</button>;
  const top = <>
    {wide && <Back {...back}/>}
    <header className={s.strategyHeader} data-narrow={!wide || undefined}>
      {!wide && <Link href={back.href} onClick={back.onClick} className={s.headRound} aria-label={`Back to ${back.label}`}><ArrowLeft/></Link>}
      <h1 className={s.title}><span>{strategy.name}</span>{wide && <RealSolMark mode={strategy.mode}/>}</h1>
      {runControl}
      {wide ? <div className={s.headActions}>{!replay.active && <SellStrategyButton strategy={strategy} bags={bags}/>}<SettingsButton draft={settings!} onOpen={openSettings}/>{!past && <RealSolCopies data={data} only={strategy}/>}
        {strategy.status === 'archiving' && <ArchiveStrategyButton data={data} strategy={strategy}/>}
        <StrategyMenu data={data} strategy={strategy} archive><Button size="icon-sm" variant="secondary" aria-label={`More for ${strategy.name}`}><Ellipsis/></Button></StrategyMenu></div>
        : <><SettingsButton draft={settings!} onOpen={openSettings} round/>
          <StrategySheet data={data} strategy={strategy} more={<>{!replay.active && bags.some(bag => bag.stage === 'held' || bag.stage === 'selling') && <SellStrategyButton strategy={strategy} bags={bags}/>}{!past && <RealSolCopies data={data} only={strategy}/>}</>}>
            <button type="button" className={s.headRound} aria-label={`More for ${strategy.name}`}><Ellipsis/></button>
          </StrategySheet></>}
      {/* Phones hide the shared header here, so the report flag sits at this header's right end instead. */}
      {!wide && <button type="button" className={s.headRound} aria-label="Report a problem" onClick={() => report.pick()}><Flag className={s.reportFlag} fill="currentColor"/></button>}
    </header>
    {stopped && !archiving && !past && <div className={s.need} role="status"><span><b>Drawdown hit · buying stopped</b><small>Down {sol(strategy.loss?.lostSol ?? 0, 2)}{strategy.loss?.stoppedAt ? ` · ${ago(strategy.loss.stoppedAt)} ago` : ''} · coins keep their exits</small></span>{strategy.status === 'paused' && <RearmStrategy strategy={strategy}/>}</div>}
    {needs.length > 0 && <NeedsYou items={needs}/>}
    {!past && <Runners bags={bags}/>}
  </>;
  // Profit is named once: the total, its sold/open split and the budget in coins beside the chart that draws it.
  const profit = <section className={`${s.surface} ${s.moneyCard}`} aria-label="Profit and budget">
    <div className={s.moneyFigures}>
      {isAdmin && <AddressChip label="ID" address={id}/>}
      <div className={s.moneyTotal}>
        <b className={s[tone(total) ?? 'muted']}>{signedSol(total).replace(' SOL', '')}<small>SOL</small></b>
        <div className={s.moneySplit}>
          <span data-tone={tone(realized)}>Sold<b>{signedSol(realized)}</b></span>
          <span data-tone={tone(total - realized)}>Open<b>{signedSol(total - realized)}</b></span>
        </div>
      </div>
      <div className={s.moneyAllocation}>
        <CoinSlots held={heldCount} max={strategy.rules.maxOpenPositions} label={`In ${heldCount} of ${strategy.rules.maxOpenPositions} coins`}/>
        <dl>
          <div data-split><dt>In coins</dt><dd>{sol(inCoins, 2)}</dd><dt>Free</dt><dd>{Math.max(0, left - inCoins).toFixed(2)} of {sol(left, 2)}</dd></div>
          {stop && <div><dt>Drawdown</dt><dd>Down <span className={s[tone(-stop.lost, 2) ?? '']}>{stop.lost.toFixed(2)}</span> / {stop.at > 1e-9 ? stop.at.toFixed(2) : 'first loss'}</dd></div>}
        </dl>
      </div>
    </div>
    <ProfitChart data={data} strategyId={id} replay={past?.chart} actions={(strategy.sold > 0 || bags.length > 0 || replay.active) && <ReplayControl replay={replay}/>}/>
  </section>;
  // Profit lives in the panel above, so the tab row only counts winners; the count hides when the row has no room (`.tabCount`).
  const holdingNote = listed === heldCount && <span className={s.tabCount}>{held ? held.filter(coin => (coin.pnl ?? 0) > 0).length : bags.filter(bag => (change(bag) ?? 0) > 0).length} of {heldCount} up</span>;
  const soldNote = <span className={s.tabCount}>{wins} of {soldCount} in profit</span>;
  const activityNote = <ActivityFilter value={show} onChange={setShow}/>;
  const sorter = <CoinSort order={order} onChange={setOrder}/>;
  const holding = listed > 0 ? <section className={s.section}>
    {held ? <Coins held={held} now={past.at} empty=""/> : <Coins bags={bags} empty=""/>}
  </section> : <p className={s.empty}>{past ? past.hourly && heldCount ? `${heldCount} ${heldCount === 1 ? 'coin' : 'coins'} held at this point.` : 'No coins held at this point.' : 'No coins held.'}</p>;
  const waiting = watching.length > 0 && <section className={s.section}>
    <div className={s.sectionHead}><h2>Waiting to buy<small>{watching.length}</small></h2></div>
    <div className={s.watching}>{watching.map(item => <CoinPill key={item.id} onClick={() => setCoin(item.id)} coins={[item.token]} note={item.targetPriceUsd ? `under ${price(item.targetPriceUsd, item.supply)}` : 'at market'}/>)}</div>
  </section>;
  const nextUp = pulse && <section className={s.section}>
    <div className={s.sectionHead}><h2>Next up<small title="Coins that pass its rules now">{pulse.ranked || ''}</small></h2></div>
    {next.length ? <NextUp rows={next.map(coin => ({ coin, strategy }))}/> : <p className={s.empty}>{running ? 'No eligible picks in the ranking.' : 'Resume this strategy to rank coins.'}</p>}
  </section>;
  const nearMisses = pulse && <section className={s.section}>
    <div className={s.sectionHead}><h2>Near misses<small>{pulse.missed.length || ''}</small></h2></div>
    {pulse.missed.length ? <NearMisses missed={pulse.missed}/> : <p className={s.empty}>No near misses in {PULSE.hours} h.</p>}
  </section>;
  // Only a finished list is empty; a short or empty page that can load more keeps loading. A replay lists what had sold by its clock.
  const soldList = past ? past.sold.length ? <section className={s.section}><Paged status={past.sold.length > replaySold ? 'CanLoadMore' : 'Exhausted'} size={replaySold} onMore={() => setReplaySold(n => n + SOLD_PAGE)}><Coins sold={ranked(past.sold, order, trade => trade.closedAt, trade => trade.pnlSol).slice(0, replaySold)} now={past.at} empty=""/></Paged></section> : <p className={s.empty}>{past.hourly && soldCount ? `${soldCount} sold at this point.` : 'Nothing sold at this point.'}</p>
    : sold && (sold.length || soldPages.status === 'CanLoadMore' || soldPages.status === 'LoadingMore') ? <section className={s.section}><Paged status={soldPages.status} onMore={() => soldPages.loadMore(SOLD_PAGE)}>{sold.length > 0 && <Coins sold={sold} empty=""/>}</Paged></section>
    : soldPages.status === 'Exhausted' ? <p className={s.empty}>No sold coins yet.</p> : <Loading label="Loading sold coins"/>;
  const stream = <Stream key={past ? 'replay' : 'live'} data={data} strategyId={id} show={show} replay={past ? { events: past.feed, now: past.at } : undefined} empty={past ? 'Nothing had happened yet.' : 'Nothing yet. The first scan starts within a minute.'}/>;
  const activity = <section className={`${s.section} ${s.strategyActivity} ${s.surface}`}>
    <div className={s.listPane}><div className={`${s.sectionHead} ${s.listHead}`}><h2>Activity</h2><div className={s.strategyTabNote}>{activityNote}</div></div>{stream}</div>
  </section>;
  // Wide pages put a count line and the sorter beside the tabs; narrow pages have only round buttons at the bar's end: Holdings' sell all and
  // sort, Sold's sort, Activity's filter.
  const tabNote = wide && (current === 'coins' ? heldCount > 0 && <>{holdingNote}{listed > 1 && sorter}</> : current === 'sold' ? soldCount > 0 && <>{soldNote}{soldListed > 1 && sorter}</> : null);
  const barControl = !wide && (current === 'coins' ? <>{!replay.active && !archiving && !as.as && <SellStrategyButton strategy={strategy} bags={bags} round/>}{listed > 1 && <CoinSort order={order} onChange={setOrder} iconOnly/>}</> : current === 'sold' ? soldListed > 1 && <CoinSort order={order} onChange={setOrder} iconOnly/> : current === 'activity' && <ActivityFilter value={show} onChange={setShow} iconOnly/>);
  const tabs = <Tabs value={current} onValueChange={value => { setTab(value); tabsPane.current?.scrollTo({ top: 0 }); }} className={`${s.strategyTabs} ${s.surface}`}>
    <div ref={tabsPane} className={s.listPane}>
      <div className={`${s.strategyTabsBar} ${s.listHead}`}>
        <TabsList variant="line" aria-label="Strategy details">
          <TabsTrigger value="coins">Holdings<TabsCount>{heldCount || ''}</TabsCount></TabsTrigger>
          {wide && !past && <TabsTrigger value="picks">Picks<TabsCount>{next.length + watching.length || ''}</TabsCount></TabsTrigger>}
          <TabsTrigger value="sold">Sold<TabsCount>{soldCount || ''}</TabsCount></TabsTrigger>
          {!wide && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>
        {barControl}
        {tabNote && <div className={s.strategyTabNote}>{tabNote}</div>}
      </div>
      {/* A narrow page lists the picks under the holdings, each part only while it has coins. */}
      <TabsContent value="coins" className={s.strategyOverview}>{holding}{!wide && <>{pulse && <ResearchStatus research={pulse.research} running={running}/>}{next.length > 0 && nextUp}{waiting}{pulse && pulse.missed.length > 0 && nearMisses}</>}</TabsContent>
      {wide && !past && <TabsContent value="picks" className={s.strategyOverview}>{nextUp}{waiting}{nearMisses}</TabsContent>}
      <TabsContent value="sold">{soldList}</TabsContent>
      {!wide && <TabsContent value="activity" className={s.strategyActivityList}>{pulse && <DayFunnel day={pulse.day} waiting={inPlay} research={pulse.research} running={running} bare/>}{stream}</TabsContent>}
    </div>
  </Tabs>;
  return <div ref={pageRef} className={`${s.page} ${s.strategyPage}`} data-wide={wide || undefined}>
    <div className={s.strategyLead}>{top}{profit}</div>{tabs}
    {wide && <div className={s.strategySide}>{pulse && <DayFunnel day={pulse.day} waiting={inPlay} research={pulse.research} running={running}/>}{activity}</div>}
    {coin && <DecisionDialog id={coin} onClose={() => setCoin(null)}/>}
  </div>;
}
