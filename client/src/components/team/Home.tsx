"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from 'convex/react';
import { useAtomValue } from 'jotai';
import { api } from '@/lib/convex';
import { viewedAtom } from './state';
import type { HomeData } from './data';
import { appHref, pct, signedSol, sol, tone, usd } from './format';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddStrategyButton, bagProfit, CheckCoinButton, Coins, CoinSort, ranked, StrategyCard, usePhone, useTwoColumns, type Order } from './Parts';
import { ActivityFilter, Stream, type Show } from './Stream';
import { ProfitChart, useDayChange } from './ProfitChart';
import s from './team.module.css';

/** Portfolio, then holdings beside recent activity in equal scroll panes filling the rest of the window (one column: Holdings and Activity tabs). Strategies live on their own page. The team's live status sits in the team panel.
 *  Phones open on the balance itself (no card or label), its 24-hour change in percent and the profit line, then a sideways row of strategy tiles, so the coins start in the first screen. */
export function Home({ data }: { data: HomeData }) {
  // Seen marks the account's own team; an admin viewing someone leaves both teams' seen times alone.
  const seen = useMutation(api.team.seen), viewing = Boolean(useAtomValue(viewedAtom)), markSeen = viewing ? undefined : seen;
  const [pageRef, wide] = useTwoColumns(60), phone = usePhone(), [tab, setTab] = useState('holdings'), [order, setOrder] = useState<Order>('newest'), [show, setShow] = useState<Show>();
  useEffect(() => {
    if (!markSeen) return;
    const hidden = () => { if (document.visibilityState === 'hidden') void markSeen(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); void markSeen(); };
  }, [markSeen]);
  const live = data.worker.online && !data.workspace.halted && data.strategies.some(row => row.status === 'running');
  const total = data.money.openPnl + data.workspace.realizedPnlSol, day = useDayChange(data, phone);
  const investedPct = data.money.equity > 0 ? Math.min(100, Math.max(0, data.money.invested / data.money.equity * 100)) : 0;
  // Home is the portfolio shown: its coins, and an empty Real SOL says no strategy trades it rather than showing nothing.
  const bags = ranked(data.bags.filter(bag => bag.mode === data.workspace.mode), order, bag => bag.boughtAt ?? bag.at, bagProfit);
  const idleReal = data.workspace.mode === 'live' && !data.strategies.some(row => row.mode === 'live');
  const openNote = <>{bags.length > 1 && <CoinSort order={order} onChange={setOrder}/>}</>, activityNote = <ActivityFilter value={show} onChange={setShow}/>;
  const holdings = <div className={`${s.scrollPane} ${s.homePane}`}><Coins bags={bags} strategies={data.strategies} empty={idleReal ? 'No strategy trades Real SOL. Move one from the team wallet.' : live ? 'No coins held yet. ResearchBot is looking for your next opportunity.' : 'No coins held right now.'}/></div>;
  const activity = <div className={`${s.scrollPane} ${s.homePane}`}><Stream data={data} show={show} empty="Your team’s first moves show up here within a minute."/></div>;
  return <div ref={pageRef} className={`${s.page} ${s.homePage}`} data-wide={wide || undefined}>
    <header className={s.head}>
      <h1 className={s.title}>Home</h1>
      <div className={s.headActions}><CheckCoinButton/><AddStrategyButton/></div>
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
    </> : <section className={`${s.surface} ${s.homePortfolio}`} aria-label="Account overview">
      <div className={s.homeBalance}>
        <div className={s.sectionHead}><h2>Total balance</h2><Link href={appHref('account')} className={s.pill} data-tone={data.workspace.mode === 'live' ? 'ember' : 'warn'}>{data.workspace.mode === 'paper' ? 'Practice money' : 'Real money'}</Link></div>
        <div className={s.homeEquity}><b>{data.money.equity.toFixed(2)}<small>SOL</small></b><span>{usd(data.money.equity * data.money.solUsd)}</span></div>
        <div className={s.homeAllocation}>
          <div className={s.homeAllocationBar} aria-hidden><i style={{ width: `${investedPct}%` }}/></div>
          <dl><div><dt><i data-dot="free" aria-hidden/>Available</dt><dd>{sol(data.money.cash, 2)}</dd></div><div><dt><i data-dot="coins" aria-hidden/>In {bags.length} {bags.length === 1 ? 'coin' : 'coins'}</dt><dd>{sol(data.money.invested, 2)}</dd></div></dl>
        </div>
      </div>
      <div className={s.homePerformance}>
        <div className={s.homeProfitHead}>
          <div><h2>Total profit</h2><b className={s[tone(total) ?? 'muted']}>{signedSol(total, 3)}</b></div>
          {data.workspace.mode === 'paper' && data.workspace.paperStartSol > 0 && <span className={`${s.homeReturn} ${s[tone(total) ?? 'muted']}`}>{pct(total / data.workspace.paperStartSol * 100)}<small>all time</small></span>}
        </div>
        <ProfitChart data={data}/>
        <div className={s.moneyLine}><span>Realized <b className={s[tone(data.workspace.realizedPnlSol) ?? 'muted']}>{signedSol(data.workspace.realizedPnlSol)}</b></span><span>Unrealized <b className={s[tone(data.money.openPnl) ?? 'muted']}>{signedSol(data.money.openPnl)}</b></span></div>
      </div>
    </section>}

    {wide ? <div className={s.homeLists}>
      <section className={s.section}><div className={s.sectionHead}><h2>Holdings<small>{bags.length}</small></h2><div className={s.strategyTabNote}>{openNote}</div></div>{holdings}</section>
      <section className={s.section}><div className={s.sectionHead}><h2>Recent activity</h2><div className={s.strategyTabNote}>{activityNote}</div></div>{activity}</section>
    </div> : <Tabs value={tab} onValueChange={setTab} className={`${s.strategyTabs} ${s.homeTabs}`}>
      <div className={s.strategyTabsBar}>
        <TabsList variant="line" aria-label="Holdings and activity">
          <TabsTrigger value="holdings">Holdings<TabsCount>{bags.length || ''}</TabsCount></TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <div className={s.strategyTabNote}>{tab === 'holdings' ? openNote : activityNote}</div>
      </div>
      <TabsContent value="holdings">{holdings}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>}
  </div>;
}
