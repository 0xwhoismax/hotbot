"use client";
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Flag, LoaderCircle, Maximize2, Minimize2, Pause, Pencil, Play } from 'lucide-react';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { change, type HomeData, type StrategyRow } from './data';
import { ArchivedNotice, ArchivedStrategies, ArchiveStrategyButton } from './ArchiveStrategy';
import { SellStrategyButton } from './SellStrategy';
import { DecisionActions, DecisionCards, plainReason, useItem } from './Decision';
import { CoinChart, type ChartMarker } from './CoinChart';
import { CoinIntel } from './CoinIntel';
import { RateButton, useCoinRating } from './Rating';
import { SocialLinks, TokenFacts, TokenFigures, tokenDetailsLaunchedAt, tokenDetailsSupply, useTokenDetails } from './TokenInfo';
import { appHref, pct, signedSol, sol, tone } from './format';
import { AddressChip, AddStrategyButton, bagProfit, CheckCoinButton, CoinPill, Coins, CoinSort, CopyName, DecisionDialog, Hint, Loading, NeedsYou, ranked, StrategyCard, useTwoColumns, type Order } from './Parts';
import { SettingsButton, SettingsEditor, useSettingsDraft } from './Settings';
import { useReport } from './Report';
import { useCommand, viewAsAtom } from './state';
import { ActivityFilter, Stream, Trail, type Show, type StreamEvent } from './Stream';
import { ProfitChart } from './ProfitChart';
import { ReplayControl, useReplay } from './Replay';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { isAdminAtom } from '@/store/user/atoms';
import { DEFAULT_RESEARCH_POLICY } from '../../../../types/hotbot';
import { codeGate, researchCriteria } from '../../../../types/hotbotResearch';
import { describeExits } from '../../../../types/exits';
import { plainRules } from '../../../../types/team';
import { ExitBars, PlainChips, type ExitBar } from './Plain';
import { exitFamily } from '../../../../types/performance';
import { ACTIVE_STAGES } from '../../../../types/team';
import s from './team.module.css';

const Back = ({ href, label }: { href: string; label: string }) => <Link href={href} className={s.back}><ArrowLeft size={14}/>{label}</Link>;

/** A strategy's full rules as the rules page shows them, from the rules it already carries: what it looks for, its research checks (dark: must-have),
 *  pass mark, money and exit plan. */
function StrategyFacts({ row, exits }: { row: StrategyRow; exits: ExitBar[] | undefined }) {
  const rules = row.rules, pass = (rules.researchPolicy ?? DEFAULT_RESEARCH_POLICY).minimumScore;
  const checks = researchCriteria(rules, { missing: [] }, 'probe');
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
        <button type="button" className={s.toggleButton} onClick={() => setFull(!full)}>{full ? <><Minimize2/>Compact</> : <><Maximize2/>Full info</>}</button>
        <CheckCoinButton/><AddStrategyButton/>
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

/** Sold coins a strategy page shows first, and adds with each Show more. */
const SOLD_PAGE = 20;

export function StrategyPage({ data, id }: { data: HomeData; id: string }) {
  const { describe: price } = usePriceDisplay();
  const command = useCommand(), report = useReport(), as = useAtomValue(viewAsAtom), isAdmin = useAtomValue(isAdminAtom), strategy = data.strategies.find(row => row.id === id);
  const [pageRef, wide] = useTwoColumns();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(''), [coin, setCoin] = useState<string | null>(null), [tab, setTab] = useState('coins'), [soldOpened, setSoldOpened] = useState(false), [order, setOrder] = useState<Order>('newest'), [show, setShow] = useState<Show>();
  // A page that never opens Sold reads none of it: its first page loads when the tab first opens, and its count comes from the strategy row.
  if (tab === 'sold' && !soldOpened) setSoldOpened(true);
  const replay = useReplay(data, strategy), past = replay.view;
  // Settings' unsaved draft and whether it is open live here, so the wide and narrow headers' buttons share them.
  const settings = useSettingsDraft(strategy), [settingsOpen, setSettingsOpen] = useState(false);
  // Sold coins page in from the server in the chosen order; a new order keeps the list it replaces on screen until its first page arrives.
  const soldPages = usePaginatedQuery(api.team.sold, strategy && soldOpened ? { mode: data.workspace.mode, strategyId: id, order, ...as } : 'skip', { initialNumItems: SOLD_PAGE });
  const soldKey = `${id}:${data.workspace.mode}`, [soldKept, setSoldKept] = useState<{ key: string; rows: typeof soldPages.results }>();
  if (soldPages.status !== 'LoadingFirstPage' && (soldKept?.key !== soldKey || soldKept.rows !== soldPages.results)) setSoldKept({ key: soldKey, rows: soldPages.results });
  const sold = soldPages.status !== 'LoadingFirstPage' ? soldPages.results : soldKept?.key === soldKey ? soldKept.rows : undefined;
  if (!strategy) {
    const archived = data.archived.find(row => row.id === id);
    return <div className={s.page}><Back href={appHref('strategies')} label="Strategies"/>{archived ? <ArchivedNotice row={archived}/> : <p className={s.empty}>This strategy no longer exists.</p>}</div>;
  }
  // Settings take the page's whole frame under the back link; the draft stays here while they are closed.
  if (settingsOpen) return <div ref={pageRef} className={`${s.page} ${s.strategyPage} ${s.settingsPage}`} data-wide={wide || undefined}>
    {wide && <Back href={appHref('strategies')} label="Strategies"/>}
    <SettingsEditor data={data} draft={settings!} onClose={() => setSettingsOpen(false)}/>
  </div>;
  const archiving = strategy.status === 'archiving', running = strategy.status === 'running';
  // Wide pages show Activity as its own column, so a remembered Activity tab falls back to the coins.
  const current = wide && tab === 'activity' ? 'coins' : tab;
  const bags = ranked(data.bags.filter(bag => bag.strategyId === id), order, bag => bag.boughtAt ?? bag.at, bagProfit), needs = past ? [] : data.needs.filter(item => item.strategyId === id), watching = past ? [] : data.watching.filter(item => item.strategyId === id), queued = past ? [] : data.queued.filter(item => item.strategyId === id);
  const held = past && ranked(past.held, order, coin => coin.boughtAt, coin => coin.pnl ?? null), heldCount = held ? held.length : bags.length;
  const total = past ? past.total : strategy.realizedPnlSol + strategy.openPnlSol, realized = past ? past.realized : strategy.realizedPnlSol, budget = strategy.rules.allocationSol;
  const soldCount = past ? past.soldCount : strategy.sold, wins = past ? past.wins : strategy.wins;
  const inCoins = held ? held.reduce((sum, coin) => sum + coin.inSol, 0) : bags.reduce((sum, bag) => sum + (bag.entry?.sol ?? bag.amountSol), 0), usedPct = budget > 0 ? Math.min(100, inCoins / budget * 100) : 0;
  const rename = async () => { const next = name.trim(); setRenaming(false); if (next && next !== strategy.name) await command({ type: 'update', strategyId: id, patch: { name: next } }); };
  const runControl = archiving ? <span className={s.toggleButton} data-busy><LoaderCircle size={15} className="animate-spin"/>{bags.length ? `Selling ${bags.length} to archive` : 'Archiving'}</span>
    : <button type="button" className={s.toggleButton} data-go={!running || undefined} onClick={() => command({ type: running ? 'pause' : 'resume', strategyId: id })}>{running ? <><Pause/>Pause</> : <><Play/>Run</>}</button>;
  const top = <>
    {wide && <Back href={appHref('strategies')} label="Strategies"/>}
    <header className={s.strategyHeader} data-narrow={!wide || undefined}>
      {!wide && <Link href={appHref('strategies')} className={s.headRound} aria-label="Back to Strategies"><ArrowLeft/></Link>}
      {renaming ? <form className={s.nameEdit} onSubmit={event => { event.preventDefault(); void rename(); }}><input autoFocus value={name} maxLength={60} onChange={event => setName(event.target.value)} onBlur={() => void rename()} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false); }} aria-label="Strategy name"/></form>
        : <h1 className={s.title}><span>{strategy.name}</span><button type="button" className={s.pencil} aria-label="Rename" onClick={() => { setName(strategy.name); setRenaming(true); }}><Pencil/></button></h1>}
      {runControl}
      {wide ? <div className={s.headActions}>{!replay.active && <SellStrategyButton strategy={strategy} bags={bags}/>}<SettingsButton draft={settings!} onOpen={() => setSettingsOpen(true)}/><ArchiveStrategyButton data={data} strategy={strategy}/></div>
        : <SettingsButton draft={settings!} onOpen={() => setSettingsOpen(true)} round/>}
      {/* Phones hide the shared header here, so the report flag sits at this header's right end instead. */}
      {!wide && <button type="button" className={s.headRound} aria-label="Report a problem" onClick={() => report.pick()}><Flag className={s.reportFlag} fill="currentColor"/></button>}
    </header>
    {needs.length > 0 && <NeedsYou items={needs}/>}
  </>;
  // Profit is named once: the total, its sold/open split and the budget in coins beside the chart that draws it.
  const profit = <section className={`${s.surface} ${s.strategyMoney}`} aria-label="Profit and budget">
    <div className={s.strategyFigures}>
      {isAdmin && <AddressChip label="ID" address={id}/>}
      <div className={s.strategyProfit}>
        <b className={s[tone(total) ?? 'muted']}>{signedSol(total).replace(' SOL', '')}<small>SOL</small></b>
        <div className={s.strategySplit}>
          <span data-tone={tone(realized)}>Sold<b>{signedSol(realized)}</b></span>
          <span data-tone={tone(total - realized)}>Open<b>{signedSol(total - realized)}</b></span>
        </div>
      </div>
      <div className={s.homeAllocation}>
        <div className={s.homeAllocationBar} role="meter" aria-label="Budget in coins" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.min(inCoins, budget)}><i style={{ width: `${usedPct}%` }}/></div>
        <dl><div><dt><i data-dot="coins" aria-hidden/>In {heldCount} of {strategy.rules.maxOpenPositions} coins</dt><dd>{sol(inCoins, 2)}</dd></div><div><dt><i data-dot="free" aria-hidden/>Free</dt><dd>{Math.max(0, budget - inCoins).toFixed(2)} of {sol(budget, 2)}</dd></div></dl>
      </div>
    </div>
    <ProfitChart data={data} strategyId={id} replay={past?.chart} actions={(strategy.sold > 0 || bags.length > 0 || replay.active) && <ReplayControl replay={replay}/>}/>
  </section>;
  // Profit lives in the panel above, so the tab row only counts winners; the count hides when the row has no room (`.tabCount`).
  const holdingNote = <span className={s.tabCount}>{held ? held.filter(coin => (coin.pnl ?? 0) > 0).length : bags.filter(bag => (change(bag) ?? 0) > 0).length} of {heldCount} up</span>;
  const soldNote = <span className={s.tabCount}>{wins} of {soldCount} in profit</span>;
  const activityNote = <ActivityFilter value={show} onChange={setShow}/>;
  const sorter = <CoinSort order={order} onChange={setOrder}/>;
  const holding = heldCount > 0 || queued.length > 0 ? <section className={s.section}>
    {held ?<Coins held={held} now={past.at} empty=""/> : <Coins bags={bags} queued={queued} empty=""/>}
  </section> : <p className={s.empty}>{past ? 'No coins held at this point.' : strategy.status === 'running' ? 'No coins held yet. ResearchBot is looking for the next one.' : 'No coins held. Resume this strategy to find new coins.'}</p>;
  const waiting = watching.length > 0 && <section className={s.section}>
    <div className={s.sectionHead}><h2>Waiting to buy<small>{watching.length}</small></h2></div>
    <div className={s.watching}>{watching.map(item => <CoinPill key={item.id} onClick={() => setCoin(item.id)} coins={[item.token]} note={item.targetPriceUsd ? `under ${price(item.targetPriceUsd, item.supply)}` : 'at market'}/>)}</div>
  </section>;
  const soldLeft = Math.max(0, strategy.sold - (sold?.length ?? 0));
  const soldMore = (soldPages.status === 'CanLoadMore' || soldPages.status === 'LoadingMore') && <button type="button" className={s.more} disabled={soldPages.status === 'LoadingMore'} onClick={() => soldPages.loadMore(SOLD_PAGE)}>
    {soldPages.status === 'LoadingMore' ? <><LoaderCircle size={13} className="animate-spin"/>Loading</> : soldLeft ? `Show ${Math.min(SOLD_PAGE, soldLeft)} more of ${soldLeft}` : 'Show more'}
  </button>;
  const soldList = past ? past.sold.length ? <section className={s.section}><Coins sold={ranked(past.sold, order, trade => trade.closedAt, trade => trade.pnlSol).slice(0, SOLD_PAGE * 2)} now={past.at} empty=""/></section> : <p className={s.empty}>Nothing sold at this point.</p>
    : sold?.length ? <section className={s.section}><Coins sold={sold} empty=""/>{soldMore}</section>
    : soldMore || (soldPages.status === 'Exhausted' ? <p className={s.empty}>No sold coins yet.</p> : <Loading label="Loading sold coins"/>);
  const activity = <section className={wide ? `${s.section} ${s.strategyActivity}` : s.section}>
    {wide && <div className={s.sectionHead}><h2>Activity</h2><div className={s.strategyTabNote}>{activityNote}</div></div>}
    <div className={s.scrollPane}><Stream key={past ? 'replay' : 'live'} data={data} strategyId={id} show={show} replay={past ? { events: past.feed, now: past.at } : undefined} empty={past ? 'Nothing had happened yet.' : 'Nothing yet. The first scan starts within a minute.'}/></div>
  </section>;
  // Wide pages put a count line and the sorter beside the tabs; narrow pages have only round buttons at the bar's end: Holdings' sell all and
  // sort, Sold's sort, Activity's filter.
  const tabNote = wide && (current === 'coins' ? heldCount > 0 && <>{holdingNote}{heldCount > 1 && sorter}</> : current === 'sold' ? soldCount > 0 && <>{soldNote}{soldCount > 1 && sorter}</> : null);
  const barControl = !wide && (current === 'coins' ? <>{!replay.active && !archiving && !as.as && <SellStrategyButton strategy={strategy} bags={bags} round/>}{heldCount > 1 && <CoinSort order={order} onChange={setOrder} iconOnly/>}</> : current === 'sold' ? soldCount > 1 && <CoinSort order={order} onChange={setOrder} iconOnly/> : current === 'activity' && <ActivityFilter value={show} onChange={setShow} iconOnly/>);
  const tabs = <Tabs value={current} onValueChange={setTab} className={s.strategyTabs}>
    <div className={s.strategyTabsBar}>
      <TabsList variant="line" aria-label="Strategy details">
        <TabsTrigger value="coins">Holdings<TabsCount>{heldCount || ''}</TabsCount></TabsTrigger>
        <TabsTrigger value="sold">Sold<TabsCount>{soldCount || ''}</TabsCount></TabsTrigger>
        {!wide && <TabsTrigger value="activity">Activity</TabsTrigger>}
      </TabsList>
      {barControl}
      {tabNote && <div className={s.strategyTabNote}>{tabNote}</div>}
    </div>
    <TabsContent value="coins" className={s.strategyOverview}>
      {(heldCount > 0 || queued.length > 0 || !watching.length) && holding}{waiting}
    </TabsContent>
    <TabsContent value="sold">{soldList}</TabsContent>
    {!wide && <TabsContent value="activity" className={s.strategyActivityList}>{activity}</TabsContent>}
  </Tabs>;
  return <div ref={pageRef} className={`${s.page} ${s.strategyPage}`} data-wide={wide || undefined}>
    <div className={s.strategyLead}>{top}{profit}</div>{tabs}{wide && activity}
    {coin && <DecisionDialog id={coin} onClose={() => setCoin(null)}/>}
  </div>;
}

/** Every pick, buy and sell with a price, as its bot's cloud on the chart; picks are numbered as trades once the strategy picked the coin more than once. */
function chartMarkers(trail: StreamEvent[] | undefined): ChartMarker[] {
  const events = (trail ?? []).filter(event => event.priceUsd && (event.kind === 'passed' || event.kind === 'bought' || event.kind === 'sold'));
  const picks = [...new Set([...(trail ?? [])].reverse().map(event => event.itemId))];
  return events.map(event => ({
    id: event.id, t: event.at, priceUsd: event.priceUsd!, itemId: event.itemId, role: event.kind === 'passed' ? 'research' : event.actor === 'sniper' ? 'sniper' : 'trader',
    trade: picks.length > 1 && event.itemId ? picks.indexOf(event.itemId) + 1 : undefined,
    ...(event.kind === 'passed' ? { kind: 'pick' as const, title: 'Picked', value: event.count ? `score ${event.count}` : undefined, sub: plainReason(event.detail).replace(/ · score \d+$/, '') || null }
      : event.kind === 'bought' ? { kind: 'buy' as const, title: 'Bought', value: sol(event.amountSol) }
      : { kind: 'sell' as const, title: 'Sold', value: signedSol(event.pnlSol), tone: tone(event.pnlSol), sub: event.detail }),
  }));
}

/** One coin: its name, links and market figures in one header with the position, chart beside its own activity, one decision overview and live token facts. Every figure explains itself on hover. */
export function TokenPage({ id }: { id: string; data: HomeData }) {
  const { format: price, label, unit } = usePriceDisplay();
  const item = useItem(id), trail = useQuery(api.team.trail, { itemId: id, ...useAtomValue(viewAsAtom) });
  // A sold coin's return is its profit on the SOL that went in; a held one's is the latest price against the entry price.
  const move = item ? item.stage === 'closed' ? item.entry && item.entry.sol > 0 && item.pnlSol != null ? item.pnlSol / item.entry.sol * 100 : null : change(item) : null;
  const details = useTokenDetails(item?.token.address);
  const supply = tokenDetailsSupply(details.data) ?? item?.supply ?? null;
  // The decision open in the dialog: this coin's, or an earlier pick's from the chart or its activity.
  const [decision, setDecision] = useState<string | null>(null);
  // The activity row under the pointer lights up its cloud on the chart.
  const [hovered, setHovered] = useState<string | null>(null);
  const markers = chartMarkers(trail), rating = useCoinRating(item ? { mint: item.token.address, symbol: item.token.symbol, itemId: item.id } : item);
  // Undefined during the first details attempt, so Auto candles wait for the coin's real age instead of fetching twice; a failing read falls back at once.
  const launchedAt = details.isPending && details.failureCount === 0 ? undefined : tokenDetailsLaunchedAt(details.data);
  const closed = item?.stage === 'closed', partSold = Boolean(item?.sold?.rungs);
  const figureHint = !item ? null : closed ? 'Profit on this trade in SOL: what the sale returned minus what went in.' : item.entry ? 'What is still held, valued in SOL at the latest price. It moves with every price tick.' : `The coin's latest ${unit === 'marketCap' ? 'market cap' : 'price'} from market data. Nothing is held yet.`;
  const inHint = closed ? 'The SOL that went into the buy.' : partSold ? 'The SOL still in the part held: the original buy minus what take-profits already sold.' : 'The SOL that went into the buy.';
  const moveHint = closed ? 'Return on the trade: its SOL profit against the SOL that went in.' : 'Latest price against the price paid at the buy. The sale’s fees and slippage count once it sells.';
  const modeHint = item?.mode === 'live' ? 'Traded with real SOL from your wallet.' : 'A practice trade: filled at the market price plus slippage, with no SOL spent.';
  // Practice or Real SOL and the strategy: beside the symbol on phones, in the Links card on desktops.
  const tags = item && <><Hint text={modeHint}><span className={s.pill} data-tone={item.mode === 'live' ? 'ember' : undefined}>{item.mode === 'paper' ? 'Practice' : 'Real SOL'}</span></Hint>{item.strategy && <Link href={appHref('strategies', item.strategy.id)} className={`${s.pill} ${s.tokenStrategy}`} aria-label={`Open strategy ${item.strategy.name}`}>{item.strategy.name}</Link>}</>;
  return <div className={`${s.page} ${s.tokenPage}`}>
    <Back href={item?.strategy ? appHref('strategies', item.strategy.id) : appHref()} label={item?.strategy?.name ?? 'Home'}/>
    {item === undefined ? <Loading variant="page" label="Loading the coin"/> : !item ? <p className={s.empty}>This coin is no longer in your pipeline.</p> : <>
      <header className={s.tokenHead}>
        <TokenAvatar className="size-11 rounded-[28%]" address={item.token.address} logoUrl={item.token.logoUri} symbol={item.token.symbol} network="solana" fallback="letter" disableDetailFallback/>
        <div className={s.tokenName}>
          <h1 className={s.title}>{item.token.symbol}<span className={`${s.tokenTags} ${s.phoneOnly}`}>{tags}</span></h1>
          <SocialLinks details={details} className={s.phoneOnly}/>
          <div className={s.tokenNameMeta}><CopyName name={item.token.name} address={item.token.address}/></div>
        </div>
        <TokenFigures details={details}/>
        <div className={s.tokenValue}>
          <div className={s.tokenPosition}>
            <Hint text={figureHint}><b className={`${s.big} ${s[tone(closed ? item.pnlSol : move) ?? 'muted']}`}>{closed ? signedSol(item.pnlSol) : item.entry ? sol(item.valueSol) : price(item.markPriceUsd ?? item.armedPriceUsd ?? item.researchPriceUsd, supply)}</b></Hint>
            {!item.entry && <small className={s.muted}>{label}</small>}
            {item.entry && <div className={s.tokenReturns}><Hint text={inHint}><span>in {sol(item.entry.sol, 2).replace(' SOL', '')}</span></Hint><i aria-hidden/><Hint text={moveHint}><b className={s[tone(move) ?? 'muted']}>{pct(move)}</b></Hint></div>}
          </div>
          <DecisionActions item={item} rate={<RateButton rating={rating} symbol={item.token.symbol} supply={supply}/>}/>
        </div>
      </header>
      <div className={s.tokenBody}>
        {/* The worker stops pricing a coin once it leaves the pipeline, so a sold or turned-down coin's last mark is stale: its candles alone set the live price. */}
        <CoinChart address={item.token.address} supply={supply} entryPriceUsd={item.entry?.priceUsd} markPriceUsd={ACTIVE_STAGES.includes(item.stage) ? item.markPriceUsd : null} launchedAt={launchedAt} markers={markers} focus={hovered} onOpenMarker={marker => setDecision(marker.itemId ?? item.id)} rating={rating.chart}/>
        <section className={`${s.surface} ${s.tokenActivity}`} aria-label={`${item.token.symbol} activity`}>
          <div className={s.sectionHead}><h2>Activity{trail?.length ? <small>{trail.length}</small> : null}</h2><span>Every move on this coin</span></div>
          <div className={s.tokenTrail}><div><Trail events={trail} onOpen={row => setDecision(row.itemId ?? item.id)} onHover={row => setHovered(row?.id ?? null)}/></div></div>
        </section>
      </div>
      <DecisionCards item={item} onOpen={() => setDecision(item.id)}/>
      <TokenFacts details={details} tags={tags}/>
      <CoinIntel address={item.token.address} supply={supply} trusted={item.stage !== 'rejected' && item.stage !== 'blocked'} active={ACTIVE_STAGES.includes(item.stage)}/>
      {decision && <DecisionDialog id={decision} onClose={() => setDecision(null)}/>}
    </>}
  </div>;
}
