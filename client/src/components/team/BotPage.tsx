"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { FunctionReturnType } from 'convex/server';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery } from '@/lib/convex';
import { viewAsAtom } from './state';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import type { HomeData } from './data';
import { DecisionDialog, Loading } from './Parts';
import { ago, appHref, pct, signedSol, sol, tone } from './format';
import { SignedPercentText } from './SignedPercentText';
import { Paged } from './Stream';
import { PanoramaButton } from './Panorama';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { REVIEW } from '../../../../types/team';
import s from './team.module.css';

type Role = 'research' | 'sniper' | 'trader';
const INFO: Record<Role, { name: string; job: string; steps: [string, string][] }> = {
  research: { name: 'ResearchBot', job: 'Finds coins and checks them against your rules', steps: [['Discover', 'Scans live market candidates for each running strategy.'], ['Verify', 'Checks every enabled rule with market, holder and safety evidence. Missing required data fails.'], ['Pick or pass', 'Scores the fit on your rules and gives SniperBot the coins that clear your pass mark.']] },
  sniper: { name: 'SniperBot', job: 'Sizes the buy and picks the entry', steps: [['Size', 'Uses ResearchBot’s confidence, your per-coin maximum and available budget.'], ['Wait', 'Buys at market or waits for the strategy’s entry price. Unfilled entries expire.'], ['Enter', 'Asks for your OK when ask-first is on, then hands the buy to TraderBot.']] },
  trader: { name: 'TraderBot', job: 'Reviews positions and decides exits', steps: [['Fill', 'Confirms buys and keeps each coin in its original Practice or Real SOL account.'], ['Review', `Looks again on a ${REVIEW.movePct}% move, ${REVIEW.pullbackPct}% off a new high, or within ${REVIEW.fastMs / 1000} seconds of a ${REVIEW.fastPct}% swing; otherwise every ${REVIEW.routineMs / 60_000} minutes, ${REVIEW.quietMs / 60_000} while nothing moves.`], ['Exit', 'The exit plan sells on price; TraderBot sells earlier when the move is done.']] },
};
type Event = FunctionReturnType<typeof api.team.decisions>['page'][number];
function decisionLabel(event: Event) {
  return ({ passed: 'Picked', rejected: 'Turned down', blocked: 'Blocked', failed: 'Failed', armed: 'Entry set', approval: 'Needs OK', queued: 'Queued', expired: 'Let go', bought: 'Bought', sold: 'Sold' } as Record<string, string>)[event.kind] ?? event.kind;
}
function decisionFact(event: Event, price: ReturnType<typeof usePriceDisplay>['describe']) {
  if (event.kind === 'passed' || event.kind === 'rejected') {
    const fit = event.detail?.match(/^Fit (\d+) \/ (\d+)/);
    if (fit) return `${fit[1]}/${fit[2]} fit`;
    const sure = event.detail?.match(/^Confidence (\d+)%, needs (\d+)%/);
    if (sure) return `${sure[1]}/${sure[2]}% sure`;
    const missing = event.detail?.match(/^Missing data for a hard rule: ([^,.]+)/);
    if (missing) return `No ${missing[1].toLowerCase()}`;
    const failed = event.detail?.match(/^Hard rule not (?:met|confirmed): ([^,.]+)/);
    if (failed) return failed[1];
    return event.count != null ? `Score ${event.count}` : '';
  }
  if (event.kind === 'armed') return event.priceUsd ? `Under ${price(event.priceUsd, event.supply)}` : event.amountSol != null ? sol(event.amountSol) : 'At market';
  if (event.kind === 'approval' || event.kind === 'bought' || event.kind === 'queued') return event.amountSol != null ? sol(event.amountSol) : '';
  if (event.kind === 'sold') return signedSol(event.pnlSol);
  return '';
}
function decisionTone(event: Event) {
  if (event.kind === 'passed' || event.kind === 'bought') return 'up';
  if (event.kind === 'approval' || event.kind === 'queued') return 'warn';
  if (event.kind === 'sold') return tone(event.pnlSol) ?? 'muted';
  if (event.kind === 'rejected' || event.kind === 'failed' || event.kind === 'blocked') return 'down';
  return 'muted';
}

export function BotPage({ role, data }: { role: Role; data: HomeData }) {
  const { describe: price } = usePriceDisplay();
  const params = useSearchParams();
  const requested = params.get('strategy');
  const strategyId = data.strategies.some(row => row.id === requested) ? requested : null;
  const [coin, setCoin] = useState<string | null>(null);
  const { results: events, status, loadMore } = usePaginatedQuery(api.team.decisions, { actor: role, mode: data.workspace.mode, ...(strategyId ? { strategyId } : {}), ...useAtomValue(viewAsAtom) }, { initialNumItems: 40 });
  const strategies = strategyId ? data.strategies.filter(row => row.id === strategyId) : data.strategies;
  const mine = <T extends { strategyId: string }>(rows: T[]) => strategyId ? rows.filter(row => row.strategyId === strategyId) : rows;
  const found = strategies.reduce((sum, row) => sum + row.funnel.found, 0);
  const passed = strategies.reduce((sum, row) => sum + row.funnel.passed, 0);
  const bought = strategies.reduce((sum, row) => sum + row.funnel.bought, 0);
  const researching = mine(data.researching), watching = mine(data.watching), needs = mine(data.needs), queued = mine(data.queued), bags = mine(data.bags);
  const current = role === 'research' ? researching : role === 'sniper' ? [...needs, ...watching] : bags;
  const openPnl = bags.reduce((sum, bag) => sum + (bag.entry ? bag.valueSol - bag.entry.sol : 0), 0);
  const realizedPnl = strategies.reduce((sum, row) => sum + row.realizedPnlSol, 0);
  const metrics = role === 'research' ? { lead: String(found), label: 'coins checked', details: [[String(passed), 'picked'], [found ? `${Math.round(passed / found * 100)}%` : '—', 'pass rate'], ...(strategyId || !data.team.keptOut ? [] : [[String(data.team.keptOut.count), 'kept out · 24h']])] }
    : role === 'sniper' ? { lead: String(passed), label: 'picks received', details: [[String(bought), 'entered'], [String(watching.length + needs.length), 'waiting now']] }
    : { lead: String(bags.length), label: 'positions held', details: [[signedSol(openPnl), 'open profit'], [signedSol(realizedPnl), 'realized profit']] };
  // Each coin once, at the bot's latest decision on it.
  const latestItems = new Set<string>();
  const decisions = events.filter(event => {
    if (!event.itemId || latestItems.has(event.itemId)) return false;
    latestItems.add(event.itemId);
    return true;
  });
  const info = INFO[role];
  const scope = strategyId ? data.strategies.find(row => row.id === strategyId) : null;
  const live = data.worker.online && !data.workspace.halted && strategies.some(row => row.status === 'running');
  return <div className={`${s.page} ${s.botPage}`}>
    <Link href={appHref()} className={s.back}><ArrowLeft size={14}/>Home</Link>
    <header className={s.botHeader}>
      <div className={s.botIdentity}><BotAvatar role={role} size={48}/><div><h1 className={s.title}>{info.name}</h1><p className={s.sub}>{info.job}</p></div></div>
      <div className={s.botActions}>{role === 'research' && <PanoramaButton data={data} strategyId={strategyId ?? undefined}/>}<span className={s.botState} data-live={live || undefined}><i/>{live ? 'Working' : data.worker.online ? 'Paused' : 'Reconnecting'}</span></div>
    </header>
    <nav className={s.botFilters} aria-label="Strategy filter"><Link href={appHref('bots', role)} aria-current={!strategyId ? 'page' : undefined}>All strategies</Link>{data.strategies.map(row => <Link key={row.id} href={`${appHref('bots', role)}?strategy=${encodeURIComponent(row.id)}`} aria-current={strategyId === row.id ? 'page' : undefined}>{row.name}</Link>)}</nav>
    <div className={s.botOverview}>
      <section className={`${s.surface} ${s.botPerformance}`} aria-label={`${info.name} performance`}><span className={s.label}>{scope ? scope.name : 'All strategies'} · {data.workspace.mode === 'paper' ? 'Practice' : 'Real SOL'}</span><strong>{metrics.lead}</strong><span className={s.botMetricLabel}>{metrics.label}</span><div className={s.botMetricDetails}>{metrics.details.map(([value, label]) => <span key={label}><b className={`${s.num} ${label === 'open profit' ? s[tone(openPnl) ?? 'muted'] : label === 'realized profit' ? s[tone(realizedPnl) ?? 'muted'] : ''}`}>{value}</b><small>{label}</small></span>)}</div></section>
      <section className={s.botMethod}><div className={s.sectionHead}><h2>How {info.name} works</h2></div><div className={s.botSteps}>{info.steps.map(([title, detail], index) => <div key={title} className={s.botStep}><span className={s.botStepNumber}>{index + 1}</span><div><b>{title}</b><p>{detail}</p></div></div>)}</div></section>
    </div>
    <section className={s.section}><div className={s.sectionHead}><h2>Working on<small>{role === 'research' ? '' : current.length}</small></h2><span>{role === 'research' ? 'Latest checks in progress' : role === 'sniper' ? 'Entries waiting for a price or your approval' : 'Positions under review'}</span></div>{current.length ? <div className={s.botWork}>{current.map(item => {
      const bag = role === 'trader' ? bags.find(row => row.id === item.id) : null;
      const description = role === 'research' ? 'Checking market, holder and safety evidence' : role === 'sniper' ? item.stage === 'approval' ? `Needs your OK · ${sol(item.amountSol)}${item.markPriceUsd ? ` at ${price(item.markPriceUsd, item.supply)}` : ''}` : item.targetPriceUsd ? `Watching for ${price(item.targetPriceUsd, item.supply)} · ${sol(item.amountSol)}` : `Buying at market · ${sol(item.amountSol)}` : item.lastReview?.reason ?? (item.stage === 'buying' ? 'Buying now' : item.stage === 'selling' ? 'Selling now' : 'Awaiting review');
      return <button key={item.id} type="button" className={`${s.surface} ${s.botWorkItem}`} onClick={() => setCoin(item.id)}><TokenAvatar className="size-9 rounded-[28%]" address={item.token.address} logoUrl={item.token.logoUri} symbol={item.token.symbol} network="solana" fallback="letter" disableDetailFallback/><span className={s.grow}><b>{item.token.symbol}</b><small><SignedPercentText>{description}</SignedPercentText></small></span>{bag && <span className={s.botWorkValue}><b>{sol(bag.valueSol)}</b><small className={s[tone(bag.entry ? bag.valueSol - bag.entry.sol : null) ?? 'muted']}>{pct(bag.entry && bag.markPriceUsd ? (bag.markPriceUsd / bag.entry.priceUsd - 1) * 100 : null)}</small></span>}<ChevronRight size={16}/></button>;
    })}</div> : <div className={s.botQuiet}><BotAvatar role={role} size={24}/><span>{role === 'research' ? live ? 'Scanning for the next coin' : 'No checks in progress' : role === 'sniper' ? 'No picks waiting for an entry' : 'No positions held right now'}</span></div>}</section>
    {role === 'sniper' && queued.length > 0 && <section className={s.section}><div className={s.sectionHead}><h2>Waiting for room<small>{queued.length}</small></h2><span>Best score first · checked again on fresh data before it buys</span></div>
      <div className={s.botWork}>{queued.map((item, n) => <button key={item.id} type="button" className={`${s.surface} ${s.botWorkItem}`} onClick={() => setCoin(item.id)}>
        <TokenAvatar className="size-9 rounded-[28%]" address={item.token.address} logoUrl={item.token.logoUri} symbol={item.token.symbol} network="solana" fallback="letter" disableDetailFallback/>
        <span className={s.grow}><b>{item.token.symbol}</b><small>{(item.exitReason ?? 'Waits for room').split(' · ')[0]} · {sol(item.amountSol)}{item.researchPriceUsd ? ` · picked at ${price(item.researchPriceUsd, item.supply)}` : ''}</small></span>
        <span className={s.botWorkValue}><b>#{n + 1}</b>{item.heldAt && <small className={s.muted}>{ago(item.heldAt)}</small>}</span><ChevronRight size={16}/>
      </button>)}</div>
    </section>}
    <section className={s.section}>
      <div className={s.sectionHead}><h2>Decisions<small>{status === 'Exhausted' ? decisions.length : ''}</small></h2><span>Tap a decision for evidence</span></div>
      {status === 'LoadingFirstPage' ? <Loading label="Loading decisions"/> : decisions.length || status !== 'Exhausted' ? <Paged className={`${s.panelList} ${s.botList}`} status={status} onMore={() => loadMore(40)}>{decisions.map(event => <button type="button" key={event.id} className={s.panelRow} onClick={() => setCoin(event.itemId!)} aria-label={`${event.symbol ?? 'Coin'}, ${data.strategies.find(row => row.id === event.strategyId)?.name ?? 'strategy'}, ${decisionLabel(event)}${decisionFact(event, price) ? ', ' + decisionFact(event, price) : ''}. Open decision evidence.`}>
          <TokenAvatar className="size-8 rounded-[28%]" logoUrl={event.logoUri ?? undefined} symbol={event.symbol ?? 'Coin'} network="solana" fallback="letter" disableDetailFallback/>
          <span className={s.grow}><b>{event.symbol ?? 'Coin'}</b>{!strategyId && <small>{data.strategies.find(row => row.id === event.strategyId)?.name ?? 'Strategy'}</small>}</span>
          <span className={s.botDecisionVerdict} data-tone={decisionTone(event)}>{decisionLabel(event)}</span>
          {decisionFact(event, price) && <span className={s.botDecisionFact}>{decisionFact(event, price)}</span>}
          <time>{ago(event.at)}</time><ChevronRight size={14}/>
        </button>)}</Paged> : <p className={s.empty}>No decisions yet</p>}
    </section>
    {coin && <DecisionDialog id={coin} onClose={() => setCoin(null)}/>}
  </div>;
}
