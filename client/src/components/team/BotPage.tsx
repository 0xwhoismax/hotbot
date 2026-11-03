"use client";
import { Fragment, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FunctionReturnType } from 'convex/server';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { api } from '@/lib/convex';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { change, type Bag, type HomeData, type StrategyRow } from './data';
import { entryReason, plainReason } from './Decision';
import { DecisionDialog, Loading, Meter, priceAgeNote, useNow, type Wire } from './Parts';
import { ago, appHref, pct, signedSol, sol, tone } from './format';
import { SignedPercentText } from './SignedPercentText';
import { Paged, useDecisions } from './Stream';
import { PanoramaButton } from './Panorama';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { RANK, REVIEW, heldSells } from '../../../../types/team';
import { NextUp } from './Picks';
import { codeOnlyOf } from '../../../../types/hotbot';
import { openProfit } from '../../../../types/home';
import type { ExitPlan } from '../../../../types/exits';
import s from './team.module.css';
import { Link, useBack, usePlace } from '@/lib/appNavigation';

type Role = 'research' | 'sniper' | 'trader';
const INFO: Record<Role, { name: string; job: string; steps: [string, string][] }> = {
  research: { name: 'ResearchBot', job: 'Finds coins and checks them against your rules', steps: [['Discover', 'Scans live market candidates for each running strategy.'], ['Verify', 'Checks every enabled rule with market, holder and safety evidence. Missing required data fails.'], ['Pick or pass', 'Scores the fit on your rules and gives SniperBot the coins that clear your pass mark.']] },
  sniper: { name: 'SniperBot', job: 'Sizes the buy and picks the entry', steps: [['Size', 'Uses ResearchBot’s confidence, your per-coin maximum and available budget.'], ['Wait', 'Enters at market or waits for the strategy’s entry price. Unfilled entries expire.'], ['Enter', 'Asks for your OK when ask-first is on, then hands the buy to TraderBot.']] },
  trader: { name: 'TraderBot', job: 'Holds each coin and runs its exits', steps: [['Fill', 'Confirms buys and keeps each coin in its original Practice or Real SOL account.'], ['Review', `Looks again on a ${REVIEW.movePct}% move, ${REVIEW.pullbackPct}% off a new high, or within ${REVIEW.fastMs / 1000} seconds of a ${REVIEW.fastPct}% swing; otherwise every ${REVIEW.routineMs / 60_000} minutes, ${REVIEW.quietMs / 60_000} while nothing moves.`], ['Exit', 'The exit plan sells on price; TraderBot sells earlier when the move is done.']] },
};
/** TraderBot's steps while every strategy shown trades by code alone (`codeOnlyOf`): no reviews, the plan sells. */
const CODE_ONLY_STEPS: [string, string][] = [INFO.trader.steps[0], ['Watch', 'Checks every price against the coin’s exit plan.'], ['Exit', 'The exit plan sells on price. No model is asked.']];
/** A held coin's next stop and take-profit as meters: how far each sits from the price, and how far the coin has moved toward it (toward
 *  the stop from its high, toward the take-profit from the entry). The stop is green when it sells above the entry. */
function exitWires(bag: Bag, plan: ExitPlan, now: number, describe: ReturnType<typeof usePriceDisplay>['describe']): Wire[] {
  // The levels run from the shared read the entry triggered on, as the worker's exits do (types/teamItem.ts `reviewedPosition`).
  const entry = bag.entry!, from = bag.signalPriceUsd ?? entry.priceUsd, since = bag.signalAt ?? bag.boughtAt, at = bag.markPriceUsd!, high = Math.max(bag.peakPriceUsd ?? from, at), rungs = bag.sold?.rungs ?? 0;
  const { stop, takeProfit } = heldSells(plan, { entryPriceUsd: from, highUsd: high, rungs, trailsSold: bag.sold?.trailsSold, heldMs: since && now ? now - since : undefined }, bag.lastReview?.levels);
  const part = (moved: number, of: number) => of > 0 ? Math.min(1, Math.max(0, moved / of)) : 0, away = (level: number) => pct((level / at - 1) * 100);
  return [
    stop ? { key: 'stop', label: 'Stop', value: away(stop.priceUsd), fill: part(high - at, high - stop.priceUsd), tone: stop.priceUsd > entry.priceUsd ? 'up' : 'down', title: `${stop.reason} · ${describe(stop.priceUsd, bag.supply)}` }
      : { key: 'stop', label: 'Stop', value: 'None', fill: 0, tone: 'down', done: true, title: 'No price stop in this plan' },
    takeProfit ? { key: 'take', label: 'Take profit', value: away(takeProfit.priceUsd), fill: part(at - from, takeProfit.priceUsd - from), tone: 'up',
      title: `Sells ${takeProfit.sellPct}% ${takeProfit.pullbackPct ? `on a ${takeProfit.pullbackPct}% pullback after` : 'at'} ${describe(takeProfit.priceUsd, bag.supply)}` }
      : { key: 'take', label: 'Take profit', value: rungs ? 'Done' : 'None', fill: rungs ? 1 : 0, tone: 'up', done: true },
  ];
}
/** A coin TraderBot holds: its worth and profit, its price (with its age once old) and how long it has been held, and its next stop and
 *  take-profit. A coin being bought or sold says so instead. `named`: every strategy's coins show, so the card names its strategy. */
function HeldCard({ bag, strategy, named, now, onOpen }: { bag: Bag; strategy?: StrategyRow; named: boolean; now: number; onOpen: () => void }) {
  const { describe } = usePriceDisplay();
  const entry = bag.entry, priced = entry && bag.markPriceUsd != null, profit = priced ? openProfit(bag) : null, digits = profit != null && Math.abs(profit) < 0.01 ? 4 : 3;
  const wires = bag.stage === 'held' && priced && strategy ? exitWires(bag, strategy.rules.exits, now, describe) : [];
  const facts = [bag.markPriceUsd != null ? describe(bag.markPriceUsd, bag.supply) : null, priceAgeNote(bag, now), bag.boughtAt && now ? `held ${ago(bag.boughtAt, now)}` : null].filter(Boolean);
  return <div role="button" tabIndex={0} className={`${s.surface} ${s.botWorkItem} ${s.botHeld}`} aria-label={`Open ${bag.token.symbol}`} onClick={onOpen} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    <span className={s.botHeldHead}>
      <TokenAvatar className="size-9 rounded-[28%]" address={bag.token.address} symbol={bag.token.symbol}/>
      <span className={s.grow}>
        <span className={s.botHeldName}><b title={bag.token.name}>{bag.token.symbol}</b>{named && strategy && <span className={s.holdTag} title={strategy.name}>{strategy.name}</span>}</span>
        <small>{bag.stage === 'buying' ? <em className={s.emberText}>Buying…</em> : bag.stage === 'selling' ? <><em className={s.warnText}>Selling…</em>{bag.exitReason && <> <SignedPercentText>{bag.exitReason}</SignedPercentText></>}</> : facts.map((fact, index) => <Fragment key={index}>{index > 0 && ' · '}{fact}</Fragment>)}</small>
      </span>
      <span className={s.botWorkValue} title="Worth in SOL, then the profit and the return">
        <b>{sol(entry ? bag.valueSol : bag.amountSol)}</b>
        <small className={s[tone(profit, digits) ?? 'muted']}>{profit == null ? '—' : `${signedSol(profit, digits).replace(' SOL', '')} · ${pct(change(bag))}`}</small>
      </span>
      <ChevronRight size={16}/>
    </span>
    {wires.length > 0 && <ul className={s.botHeldExits} aria-label={`${bag.token.symbol} exits`}>{wires.map(wire => <Meter key={wire.key} wire={wire}/>)}</ul>}
  </div>;
}
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
  if (event.kind === 'armed') return event.priceUsd ? `Under ${price(event.priceUsd, event.supply)}` : '';
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
/** What decided it, in 4 to 10 words under the coin: the entry and the SOL it set for SniperBot (the event keeps no per-coin maximum, and the
 *  strategy's may have changed since), the price it asks or filled at, else the stored reason's lead (the deciding check or fit of a verdict,
 *  the exit of a sale). */
function decisionPreview(event: Event, price: ReturnType<typeof usePriceDisplay>['describe']) {
  if (event.kind === 'armed') return [entryReason(event.detail), event.amountSol != null && sol(event.amountSol)].filter(Boolean).join(' · ');
  // A buy's stored detail is its transaction, so it reads only its fill.
  if (event.kind === 'approval' || event.kind === 'bought') return event.priceUsd ? `${event.kind === 'bought' ? 'Filled' : 'Asks to enter'} at ${price(event.priceUsd, event.supply)}` : '';
  const lead = plainReason(event.detail ?? (event.kind === 'expired' ? 'The entry price never came' : '')).split(/ · |; /)[0].replace(/\.$/, '').split(/\s+/).filter(Boolean);
  return lead.length > 10 ? lead.slice(0, 10).join(' ') + '…' : lead.join(' ');
}

export function BotPage({ role, data }: { role: Role; data: HomeData }) {
  const { describe: price } = usePriceDisplay();
  const params = useSearchParams();
  const requested = params.get('strategy');
  const strategyId = data.strategies.some(row => row.id === requested) ? requested : null;
  const [coin, setCoin] = useState<string | null>(null);
  const { results: events, status, loadMore } = useDecisions(role, data, strategyId, 40);
  const strategies = strategyId ? data.strategies.filter(row => row.id === strategyId) : data.strategies;
  const mine = <T extends { strategyId: string }>(rows: T[]) => strategyId ? rows.filter(row => row.strategyId === strategyId) : rows;
  const found = strategies.reduce((sum, row) => sum + row.funnel.found, 0);
  const passed = strategies.reduce((sum, row) => sum + row.funnel.passed, 0);
  const bought = strategies.reduce((sum, row) => sum + row.funnel.bought, 0);
  const researching = mine(data.researching), watching = mine(data.watching), needs = mine(data.needs), bags = mine(data.bags);
  const next = role === 'sniper' ? strategies.flatMap(strategy => (strategy.pulse?.next ?? []).map(coin => ({ coin, strategy }))).sort((a, b) => b.coin.score - a.coin.score).slice(0, RANK.nextUp) : [];
  const current = role === 'research' ? researching : role === 'sniper' ? [...needs, ...watching] : bags;
  const openPnl = bags.reduce((sum, bag) => sum + openProfit(bag), 0);
  const realizedPnl = strategies.reduce((sum, row) => sum + row.realizedPnlSol, 0);
  // The team's coins checked are every coin its screens judged over the last day; a strategy's own are the coins its screen sent to research.
  const kept = strategyId ? null : data.team.keptOut, checked = kept?.checked;
  const metrics = role === 'research' ? kept && checked != null ? { lead: String(checked), label: 'coins checked · 24h', details: [[String(kept.count), 'kept out · 24h'], [String(found), 'researched'], [String(passed), 'picked']] }
      : { lead: String(found), label: 'coins researched', details: [[String(passed), 'picked'], [found ? `${Math.round(passed / found * 100)}%` : '—', 'pass rate'], ...(kept ? [[String(kept.count), 'kept out · 24h']] : [])] }
    : role === 'sniper' ? { lead: String(passed), label: 'picks received', details: [[String(bought), 'entered'], [String(watching.length + needs.length), 'waiting now']] }
    : { lead: String(bags.length), label: 'positions held', details: [[signedSol(openPnl), 'open profit'], [signedSol(realizedPnl), 'realized profit']] };
  // Each coin once, at the bot's latest decision on it.
  const latestItems = new Set<string>();
  const decisions = events.filter(event => {
    if (!event.itemId || latestItems.has(event.itemId)) return false;
    latestItems.add(event.itemId);
    return true;
  });
  const info = INFO[role], now = useNow();
  const steps = role === 'trader' && strategies.every(row => codeOnlyOf(row.rules)) ? CODE_ONLY_STEPS : info.steps;
  const scope = strategyId ? data.strategies.find(row => row.id === strategyId) : null;
  const live = data.worker.online && !data.workspace.halted && strategies.some(row => row.status === 'running');
  // The page's name, as its header and the next page's Back read it.
  const here = scope ? `${info.name} · ${scope.name}` : info.name;
  usePlace(here, strategyId);
  const back = useBack(scope ? { href: appHref('strategies', scope.id), label: scope.name } : { href: appHref(), label: 'Home' });
  return <div className={`${s.page} ${s.botPage}`}>
    <Link href={back.href} onClick={back.onClick} className={s.back}><ArrowLeft size={14}/>{back.label}</Link>
    <header className={s.botHeader}>
      <div className={s.botIdentity}><BotAvatar role={role} size={48}/><div><h1 className={s.title}>{here}</h1><p className={s.sub}>{info.job}</p></div></div>
      <div className={s.botActions}>{role === 'research' && <PanoramaButton data={data} strategyId={strategyId ?? undefined}/>}<span className={s.botState} data-live={live || undefined}><i/>{live ? 'Working' : data.worker.online ? 'Paused' : 'Reconnecting'}</span></div>
    </header>
    <nav className={s.botFilters} aria-label="Strategy filter"><Link href={appHref('bots', role)} aria-current={!strategyId ? 'page' : undefined}>All strategies</Link>{data.strategies.map(row => <Link key={row.id} href={`${appHref('bots', role)}?strategy=${encodeURIComponent(row.id)}`} aria-current={strategyId === row.id ? 'page' : undefined}>{row.name}</Link>)}</nav>
    <div className={s.botOverview}>
      <section className={`${s.surface} ${s.botPerformance}`} aria-label={`${info.name} performance`}><span className={s.label}>{scope ? scope.name : 'All strategies'} · {data.workspace.mode === 'paper' ? 'Practice' : 'Real SOL'}</span><strong>{metrics.lead}</strong><span className={s.botMetricLabel}>{metrics.label}</span><div className={s.botMetricDetails}>{metrics.details.map(([value, label]) => <span key={label}><b className={`${s.num} ${label === 'open profit' ? s[tone(openPnl) ?? 'muted'] : label === 'realized profit' ? s[tone(realizedPnl) ?? 'muted'] : ''}`}>{value}</b><small>{label}</small></span>)}</div></section>
      <section className={s.botMethod}><div className={s.sectionHead}><h2>How {info.name} works</h2></div><div className={s.botSteps}>{steps.map(([title, detail], index) => <div key={title} className={s.botStep}><span className={s.botStepNumber}>{index + 1}</span><div><b>{title}</b><p>{detail}</p></div></div>)}</div></section>
    </div>
    <section className={s.section}><div className={s.sectionHead}><h2>Working on<small>{role === 'research' ? '' : current.length}</small></h2><span>{role === 'research' ? 'Latest checks in progress' : role === 'sniper' ? 'Entries waiting for a price or your approval' : 'Coins held, with their next sells'}</span></div>{current.length ? <div className={s.botWork}>{role === 'trader'
      ? bags.map(bag => <HeldCard key={bag.id} bag={bag} strategy={data.strategies.find(row => row.id === bag.strategyId)} named={!strategyId} now={now} onOpen={() => setCoin(bag.id)}/>)
      : current.map(item => {
        const description = role === 'research' ? 'Checking market, holder and safety evidence' : item.stage === 'approval' ? `Needs your OK · ${sol(item.amountSol)}${item.markPriceUsd ? ` at ${price(item.markPriceUsd, item.supply)}` : ''}` : item.targetPriceUsd ? `Watching for ${price(item.targetPriceUsd, item.supply)} · ${sol(item.amountSol)}` : `Buying at market · ${sol(item.amountSol)}`;
        return <button key={item.id} type="button" className={`${s.surface} ${s.botWorkItem}`} onClick={() => setCoin(item.id)}><TokenAvatar className="size-9 rounded-[28%]" address={item.token.address} symbol={item.token.symbol}/><span className={s.grow}><b>{item.token.symbol}</b><small><SignedPercentText>{description}</SignedPercentText></small></span><ChevronRight size={16}/></button>;
      })}</div> : <div className={s.botQuiet}><BotAvatar role={role} size={24}/><span>{role === 'research' ? live ? 'Scanning for the next coin' : 'No checks in progress' : role === 'sniper' ? 'No picks waiting for an entry' : 'No positions held right now'}</span></div>}</section>
    {next.length > 0 && <section className={s.section}><div className={s.sectionHead}><h2>Next up</h2></div><NextUp rows={next} named={!strategyId}/></section>}
    <section className={s.section}>
      <div className={s.sectionHead}><h2>Decisions<small>{status === 'Exhausted' ? decisions.length : ''}</small></h2><span>Tap a decision for evidence</span></div>
      {status === 'LoadingFirstPage' ? <Loading label="Loading decisions"/> : decisions.length || status !== 'Exhausted' ? <Paged className={`${s.panelList} ${s.botList}`} status={status} onMore={() => loadMore(40)}>{decisions.map(event => {
        const strategy = data.strategies.find(row => row.id === event.strategyId), fact = decisionFact(event, price), preview = decisionPreview(event, price);
        // The strategy is named only while every strategy's decisions show.
        const line = [!strategyId && (strategy?.name ?? 'Strategy'), preview].filter(Boolean).join(' · ');
        return <button type="button" key={event.id} className={s.panelRow} onClick={() => setCoin(event.itemId!)} aria-label={`${event.symbol ?? 'Coin'}, ${strategy?.name ?? 'strategy'}, ${decisionLabel(event)}${fact ? ', ' + fact : ''}${preview ? ', ' + preview : ''}. Open decision evidence.`}>
          <TokenAvatar className="size-8 rounded-[28%]" address={event.address ?? undefined} symbol={event.symbol ?? 'Coin'}/>
          <span className={s.grow}><b>{event.symbol ?? 'Coin'}</b>{line && <small>{line}</small>}</span>
          <span className={s.botDecisionVerdict} data-tone={decisionTone(event)}>{decisionLabel(event)}</span>
          {fact && <span className={s.botDecisionFact}>{fact}</span>}
          <time>{ago(event.at)}</time><ChevronRight size={14}/>
        </button>;
      })}</Paged> : <p className={s.empty}>No decisions yet</p>}
    </section>
    {coin && <DecisionDialog id={coin} onClose={() => setCoin(null)}/>}
  </div>;
}
