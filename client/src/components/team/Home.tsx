"use client";
import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useAtomValue } from 'jotai';
import { api } from '@/lib/convex';
import { viewedAtom } from './state';
import type { HomeData } from './data';
import { appHref, pct, signedSol, sol, tone, usd } from './format';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddStrategyButton, bagProfit, CheckCoinButton, Coins, CoinSort, ranked, StrategyCard, usePhone, useTwoColumns, type Order } from './Parts';
import { ActivityFilter, Stream, type Show } from './Stream';
import { ProfitChart } from './ProfitChart';
import { useDayChange } from './useDayChange';
import { ProfitCalendar } from './ProfitCalendar';
import { HotbotWallet, RealSolCopies } from './TeamWallet';
import s from './team.module.css';
import { Link } from '@/lib/appNavigation';

/** Portfolio, then holdings beside recent activity in equal scroll panes filling the rest of the window (one column: Holdings and Activity tabs). Strategies live on their own page. The team's live status sits in the team panel.
 *  Phones open on the balance itself (no card or label), its 24-hour change in percent and the profit line, then a sideways row of strategy tiles, so the coins start in the first screen. The calendar is a third tab there. */
export function Home({ data }: { data: HomeData }) {
  // Seen marks the account's own team; an admin viewing someone leaves both teams' seen times alone.
  const seen = useMutation(api.team.seen), viewing = Boolean(useAtomValue(viewedAtom)), markSeen = viewing ? undefined : seen;
  const [pageRef, wide] = useTwoColumns(60), phone = usePhone(), [picked, setTab] = useState('holdings'), [order, setOrder] = useState<Order>('newest'), [show, setShow] = useState<Show>();
  // The calendar tab is a phone's; a wider screen shows the calendar in the profit card.
  const tab = picked === 'calendar' && !phone ? 'holdings' : picked;
  useEffect(() => {
    if (!markSeen) return;
    const hidden = () => { if (document.visibilityState === 'hidden') void markSeen(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); void markSeen(); };
  }, [markSeen]);
  const live = data.worker.online && !data.workspace.halted && data.strategies.some(row => row.status === 'running');
  const total = data.money.openPnl + data.money.realizedPnlSol, day = useDayChange(data, phone);
  const investedPct = data.money.equity > 0 ? Math.min(100, Math.max(0, data.money.invested / data.money.equity * 100)) : 0;
  // The money card is the portfolio shown; the holdings and the activity are every strategy's, in both portfolios.
  const bags = ranked(data.bags, order, bag => bag.boughtAt ?? bag.at, bagProfit), shownCoins = data.bags.filter(bag => bag.mode === data.workspace.mode).length;
  const openNote = <>{bags.length > 1 && <CoinSort order={order} onChange={setOrder}/>}</>, activityNote = <ActivityFilter value={show} onChange={setShow}/>;
  const holdings = <Coins bags={bags} strategies={data.strategies} empty={live ? 'No coins held yet. ResearchBot is looking for your next opportunity.' : 'No coins held right now.'}/>;
  const activity = <Stream data={data} show={show} everyPortfolio empty="Your team’s first moves show up here within a minute."/>;
  const tabsPane = useRef<HTMLDivElement>(null);
  return <div ref={pageRef} className={`${s.page} ${s.homePage}`} data-wide={wide || undefined}>
    <header className={s.head}>
      <h1 className={s.title}>Home</h1>
      <div className={s.headActions}><CheckCoinButton/><RealSolCopies data={data}/><AddStrategyButton/></div>
    </header>

    {phone ? <>
      <section className={s.homePhone} aria-label="Account overview">
        <div className={s.homePhoneMoney}>
          <b>{data.money.equity.toFixed(2)}<small>SOL</small></b>
          <span className={s[tone(day) ?? 'muted']} aria-label={day == null ? undefined : `${pct(day)} in 24 hours`}>{pct(day)}<small>24h</small></span>
        </div>
        <ProfitChart data={data} variant="spark"/>
      </section>
      {/* Every strategy as a small tile over its profit line, running ones first; the row scrolls sideways. */}
      {data.strategies.length ? <nav className={s.strategyTiles} aria-label="Strategies">{[...data.strategies.filter(row => row.status !== 'paused'), ...data.strategies.filter(row => row.status === 'paused')].map(row => <StrategyCard key={row.id} row={row} tile/>)}</nav>
        : <div className={`${s.surface} ${s.strategyTilesEmpty}`}><small>No strategies running</small><AddStrategyButton/></div>}
    </> : <section className={`${s.surface} ${s.moneyCard}`} aria-label="Account overview">
      <div className={s.moneyFigures}>
        <Link href={appHref('account')} className={s.pill} data-tone={data.workspace.mode === 'live' ? 'ember' : 'warn'}>{data.workspace.mode === 'paper' ? 'Practice money' : 'Real money'}</Link>
        <div className={s.moneyTotal}>
          <b>{data.money.equity.toFixed(2)}<small>SOL</small></b>
          <small>{usd(data.money.equity * data.money.solUsd)}<em className={s[tone(total) ?? 'muted']}>{signedSol(total)}{data.workspace.mode === 'paper' && data.workspace.paperStartSol > 0 && ` · ${pct(total / data.workspace.paperStartSol * 100)}`}<small>all time</small></em></small>
          <div className={s.moneySplit}>
            <span data-tone={tone(data.money.realizedPnlSol)}>Sold<b>{signedSol(data.money.realizedPnlSol)}</b></span>
            <span data-tone={tone(data.money.openPnl)}>Open<b>{signedSol(data.money.openPnl)}</b></span>
          </div>
        </div>
        <div className={s.moneyAllocation}>
          <div className={s.moneyAllocationBar} aria-hidden><i style={{ width: `${investedPct}%` }}/></div>
          <dl><div><dt><i data-dot="coins" aria-hidden/>In {shownCoins} {shownCoins === 1 ? 'coin' : 'coins'}</dt><dd>{sol(data.money.invested, 2)}</dd></div><div><dt><i data-dot="free" aria-hidden/>Free</dt><dd>{sol(data.money.cash, 2)}</dd></div></dl>
        </div>
      </div>
      <ProfitChart data={data}/>
    </section>}

    {data.workspace.mode === 'live' && !data.workspace.wallet?.active && <section className={s.homeFund} aria-label="Fund your HOTBOT wallet"><HotbotWallet wallet={data.workspace.wallet}/></section>}

    {wide ? <div className={s.homeLists}>
      <section className={`${s.section} ${s.surface}`}><div className={s.listPane}><div className={`${s.sectionHead} ${s.listHead}`}><h2>Holdings<small>{bags.length}</small></h2><div className={s.strategyTabNote}>{openNote}</div></div>{holdings}</div></section>
      <section className={`${s.section} ${s.surface}`}><div className={s.listPane}><div className={`${s.sectionHead} ${s.listHead}`}><h2>Recent activity</h2><div className={s.strategyTabNote}>{activityNote}</div></div>{activity}</div></section>
    </div> : <Tabs value={tab} onValueChange={value => { setTab(value); tabsPane.current?.scrollTo({ top: 0 }); }} className={`${s.strategyTabs} ${s.homeTabs} ${s.surface}`}>
      {/* One pane scrolls every tab, so the tab bar stays over the rows; a tab opens at its top. */}
      <div ref={tabsPane} className={s.listPane}>
        <div className={`${s.strategyTabsBar} ${s.listHead}`}>
          <TabsList variant="line" aria-label={phone ? 'Holdings, activity and calendar' : 'Holdings and activity'}>
            <TabsTrigger value="holdings">Holdings<TabsCount>{bags.length || ''}</TabsCount></TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            {phone && <TabsTrigger value="calendar">Calendar</TabsTrigger>}
          </TabsList>
          <div className={s.strategyTabNote}>{tab === 'holdings' ? openNote : tab === 'activity' ? activityNote : null}</div>
        </div>
        <TabsContent value="holdings">{holdings}</TabsContent>
        <TabsContent value="activity">{activity}</TabsContent>
        {phone && <TabsContent value="calendar"><div className={s.homeCalendar}><ProfitCalendar data={data}/></div></TabsContent>}
      </div>
    </Tabs>}
  </div>;
}
