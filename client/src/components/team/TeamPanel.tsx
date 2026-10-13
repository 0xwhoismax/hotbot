"use client";
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery } from '@/lib/convex';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sidebar, SidebarContent } from '@/components/ui/sidebar';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { Button } from '@/components/ui/button';
import { change, type Bag, type HomeData } from './data';
import { ago, appHref, pct, signedSol, sol, tone } from './format';
import { DecisionDialog, NeedsYou, useNow } from './Parts';
import { SignedPercentText } from './SignedPercentText';
import { Paged } from './Stream';
import { useCommand, viewAsAtom } from './state';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import s from './team.module.css';

export type Role = 'research' | 'sniper' | 'trader';
export const BOTS: Record<Role, { name: string; job: string }> = {
  research: { name: 'ResearchBot', job: 'Finds coins and checks them against your rules' },
  sniper: { name: 'SniperBot', job: 'Sizes the buy and picks the entry' },
  trader: { name: 'TraderBot', job: 'Holds, reviews every minute, decides the exit' },
};

/** What each bot is doing right now, from real state: across the whole team, or for the one strategy on screen. */
function lanes(data: HomeData, strategyId?: string) {
  const mine = <T extends { strategyId: string }>(rows: T[]) => strategyId ? rows.filter(row => row.strategyId === strategyId) : rows;
  const strategies = strategyId ? data.strategies.filter(row => row.id === strategyId) : data.strategies;
  const running = strategies.some(row => row.status === 'running') && !data.workspace.halted && data.worker.online;
  const total = (key: 'found' | 'passed' | 'bought') => strategies.reduce((sum, row) => sum + row.funnel[key], 0);
  // The team's open profit counts coins archived strategies still sell; one strategy's is its own.
  const openPnl = strategyId ? strategies.reduce((sum, row) => sum + row.openPnlSol, 0) : data.money.openPnl;
  return { running, researching: mine(data.researching), needs: mine(data.needs), watching: mine(data.watching), queued: mine(data.queued), bags: mine(data.bags), openPnl, found: total('found'), passed: total('passed'), bought: total('bought'),
    // The bad coins kept out over the last day are counted for the whole team, each coin once, so one strategy's roster leaves them out.
    kept: strategyId ? null : data.team.keptOut };
}

/** Show the held coin's review reason only when a sell or status is recorded. */
const heldLine = (bag: Bag) => bag.lastReview && (bag.lastReview.sell || bag.lastReview.status) ? bag.lastReview.reason.split(/[:;]/)[0] : '';

export function botRows(data: HomeData, now: number, strategyId?: string) {
  const lane = lanes(data, strategyId), openPnl = lane.openPnl;
  // When each bot last acted is kept for the whole team, so one strategy's roster neither glows nor dates for another strategy's work.
  const acted = (role: Role) => strategyId ? null : data.team.acted[role];
  const recent = (role: Role) => { const at = acted(role); return at != null && now > 0 && now - at < 90_000; };
  const more = (n: number) => n > 1 ? <span className={s.muted}> +{n - 1}</span> : null;
  const when = (role: Role) => { const at = acted(role); return at != null && now > 0 ? <time> · {ago(at, now)}</time> : null; };
  // A bot with nothing in hand sleeps, even right after it acted (its hop shows the act).
  const rows: { role: Role; state: string; asleep: boolean; text: ReactNode; count: string }[] = [
    { role: 'research', count: `${lane.found} checked`, asleep: !lane.researching.length && !lane.running, state: recent('research') ? 'acted' : lane.researching.length || lane.running ? 'busy' : 'idle',
      text: lane.researching[0] ? <>Checking <b>{lane.researching[0].token.symbol}</b>{more(lane.researching.length)}</> : lane.running ? <>Scanning for new coins{when('research')}</> : data.worker.online ? 'Paused' : 'Reconnecting' },
    { role: 'sniper', count: `${lane.passed} picked`, asleep: !lane.needs.length && !lane.watching.length && !lane.queued.length, state: lane.needs.length ? 'needs' : recent('sniper') ? 'acted' : lane.watching.length || lane.queued.length ? 'busy' : 'idle',
      text: lane.needs[0] ? <span className={s.warnText}>Wants your OK on <b>{lane.needs[0].token.symbol}</b></span> : lane.watching[0] ? <>Waiting to buy <b>{lane.watching[0].token.symbol}</b>{more(lane.watching.length)}</> : lane.queued.length ? <>{lane.queued.length} {lane.queued.length === 1 ? 'pick waits' : 'picks wait'} for room</> : <>Waiting for a pick{when('sniper')}</> },
    { role: 'trader', count: `${lane.bought} bought`, asleep: !lane.bags.length, state: recent('trader') ? 'acted' : lane.bags.length ? 'busy' : 'idle',
      text: lane.bags.length ? <>Holding {lane.bags.length} {lane.bags.length === 1 ? 'coin' : 'coins'} <span className={s[tone(openPnl) ?? 'muted']}>{signedSol(openPnl)}</span></> : 'Nothing held yet' },
  ];
  return rows;
}

type Chip = { key: string; tokens: { address: string; symbol: string; logoUri?: string }[]; label: ReactNode; name?: ReactNode; icon?: ReactNode; title?: string; warn?: boolean; good?: boolean; acted?: boolean };
/** The coins each bot is on, as onboarding's Stage shows them: ResearchBot's checks, the team's bad coins kept out over the last day and its
 *  latest catch (ember while it just happened), SniperBot's ask, waits and queue (one chip for the queue), and TraderBot's two biggest movers
 *  (the holdings themselves live on Home and the strategy pages). */
function laneChips(data: HomeData, now: number, strategyId?: string): Record<Role, Chip[]> {
  const lane = lanes(data, strategyId), last = lane.kept?.last;
  const queued = lane.queued.length ? [{ key: 'queue', tokens: lane.queued.slice(0, 3).map(item => item.token), label: <>{lane.queued.length} waiting</> }] : [];
  const movers = lane.bags.filter(bag => bag.stage === 'held').sort((a, b) => Math.abs(change(b) ?? 0) - Math.abs(change(a) ?? 0)).slice(0, 2);
  return {
    research: [...lane.researching.slice(0, 2).map(item => ({ key: item.id, tokens: [item.token], label: 'Checking' })),
      ...(lane.kept?.count ? [{ key: 'kept', tokens: [], icon: <ShieldCheck size={13}/>, name: lane.kept.count, label: 'rugs blocked', good: true, title: 'Bad coins kept out over the last day' }] : []),
      ...(last ? [{ key: 'last', tokens: [last], label: last.check[0].toUpperCase() + last.check.slice(1), title: 'Latest coin research kept out', acted: now > 0 && now - last.at < 90_000 }] : [])],
    sniper: [...lane.needs.slice(0, 1).map(item => ({ key: item.id, tokens: [item.token], label: 'Wants your OK', warn: true })), ...lane.watching.slice(0, 1).map(item => ({ key: item.id, tokens: [item.token], label: 'Buying' })), ...queued],
    trader: movers.map(bag => ({ key: bag.id, tokens: [bag.token], label: <span className={s[tone(change(bag)) ?? 'muted']}>{pct(change(bag))}</span> })),
  };
}

type Float = { id: string; n: number; strategyId: string; sol: number; buy: boolean; token: Bag['token'] };
type Motion = { data: HomeData; laps: Record<Role, number>; big: boolean; floats: Float[] };

/** TraderBot's buys and sales between two boards: a bag that gained its entry is a buy of that SOL; a bag sold from (gone, or more of it sold)
 *  is a sale whose profit is its strategy's change in realized profit. Only an update where TraderBot acted counts, and only on strategies in
 *  both boards, so a practice reset, a mode switch or viewing another team never floats a number. */
function trades(prev: HomeData, next: HomeData): Omit<Float, 'id' | 'n'>[] {
  if (prev.workspace.mode !== next.workspace.mode || next.team.acted.trader == null || next.team.acted.trader === prev.team.acted.trader) return [];
  const pnl = (data: HomeData) => new Map([...data.strategies, ...data.archived].map(row => [row.id, row.realizedPnlSol] as const));
  const before = pnl(prev), after = pnl(next), was = new Map(prev.bags.map(bag => [bag.id, bag])), is = new Map(next.bags.map(bag => [bag.id, bag]));
  const buys = next.bags.filter(bag => bag.entry && !was.get(bag.id)?.entry && before.has(bag.strategyId)).map(bag => ({ strategyId: bag.strategyId, sol: bag.entry!.sol, buy: true, token: bag.token }));
  const soldFrom = new Map(prev.bags.filter(bag => { const left = is.get(bag.id); return bag.entry && (!left || (left.sold?.sol ?? 0) > (bag.sold?.sol ?? 0)); }).map(bag => [bag.strategyId, bag.token] as const));
  const sales = [...soldFrom].flatMap(([strategyId, token]) => { const from = before.get(strategyId), to = after.get(strategyId); return from != null && to != null && from !== to ? [{ strategyId, sol: to - from, buy: false, token }] : []; });
  return [...buys, ...sales];
}

/** Each bot's one-shot hop when it acts (a lap count; the team's acts only, since one strategy's roster can't tell whose they were) and TraderBot's
 *  floating buys and sales, derived while rendering from the board before. A float leaves when its animation ends. */
function useMotion(data: HomeData, strategyId?: string) {
  const [motion, setMotion] = useState<Motion>({ data, laps: { research: 0, sniper: 0, trader: 0 }, big: false, floats: [] });
  if (motion.data !== data) {
    const prev = motion.data, at = data.team.acted;
    const fresh = trades(prev, data).filter(trade => !strategyId || trade.strategyId === strategyId).map((trade, n) => ({ ...trade, n, id: `${at.trader}-${n}` }));
    const acted = (role: Role) => prev.workspace.mode === data.workspace.mode && at[role] != null && at[role] !== prev.team.acted[role] && (!strategyId || (role === 'trader' && fresh.length > 0));
    const lap = (role: Role) => motion.laps[role] + (acted(role) ? 1 : 0);
    setMotion({ data, laps: { research: lap('research'), sniper: lap('sniper'), trader: lap('trader') }, big: acted('trader') ? fresh.length > 0 : motion.big, floats: [...motion.floats, ...fresh].slice(-3) });
  }
  return { ...motion, done: (id: string) => setMotion(current => ({ ...current, floats: current.floats.filter(float => float.id !== id) })) };
}

/** The three bots, each with its current task and the coins it is on (the team's, or one strategy's). A bot with nothing to do sleeps, ResearchBot's
 *  eyes scan while it looks, a bot hops when it acts, and TraderBot jiggles as each buy or sale floats its SOL up. Click a bot for everything it is working on. */
export function Roster({ data, strategyId, onOpen }: { data: HomeData; strategyId?: string; onOpen: (role: Role) => void }) {
  const now = useNow(), rows = botRows(data, now, strategyId), chips = laneChips(data, now, strategyId), motion = useMotion(data, strategyId);
  return <div className={s.roster}>{rows.map(row => <button type="button" key={row.role} className={s.agent} onClick={() => onOpen(row.role)}>
    <span className={s.agentFace} data-state={row.state}>
      <span className={s.agentBot} data-lap={motion.laps[row.role] ? motion.laps[row.role] % 2 ? 'a' : 'b' : undefined} data-big={(row.role === 'trader' && motion.big) || undefined}>
        <BotAvatar role={row.role} size={40} mood={row.asleep ? 'asleep' : row.role === 'research' ? 'scan' : undefined}/>
      </span>
      {row.role === 'trader' && motion.floats.map(float => <span key={float.id} className={`${s.botFloat} ${float.buy ? '' : s[tone(float.sol) ?? 'muted']}`} data-buy={float.buy || undefined}
        style={{ '--n': float.n } as CSSProperties} onAnimationEnd={event => { if (event.target === event.currentTarget) motion.done(float.id); }}>
        <TokenAvatar className="size-[1.05rem] rounded-full" address={float.token.address} logoUrl={float.token.logoUri} symbol={float.token.symbol} network="solana" fallback="letter" disableDetailFallback/>
        {float.buy ? sol(float.sol) : signedSol(float.sol)}
      </span>)}
    </span>
    <span className={s.agentText}><span><b>{BOTS[row.role].name}</b><span className={s.agentCount}>{row.count}</span></span><small>{row.text}</small>
      {chips[row.role].length > 0 && <span className={s.laneChips}>{chips[row.role].map(chip => <span key={chip.key} className={s.laneChip} data-warn={chip.warn || undefined} data-good={chip.good || undefined} data-acted={chip.acted || undefined} title={chip.title}>
        <span className={s.pillLogos}>{chip.icon ?? chip.tokens.map(token => <TokenAvatar key={token.address} className="size-[1.15rem] rounded-[28%]" address={token.address} logoUrl={token.logoUri} symbol={token.symbol} network="solana" fallback="letter" disableDetailFallback/>)}</span>
        {chip.name !== undefined ? <b>{chip.name}</b> : chip.tokens.length === 1 && <b>{chip.tokens[0].symbol}</b>}<small>{chip.label}</small>
      </span>)}</span>}
    </span>
    <ChevronRight size={15} className={s.chev}/>
  </button>)}</div>;
}

/** One bot's overview, for the team or one strategy: what it has done in numbers, what it holds or watches now, and its recent decisions. */
export function BotDialog({ role, data, strategyId, onClose }: { role: Role; data: HomeData; strategyId?: string; onClose: () => void }) {
  const { describe: price } = usePriceDisplay();
  const [coin, setCoin] = useState<string | null>(null), lane = lanes(data, strategyId), bot = BOTS[role], now = useNow();
  const { results: history, status, loadMore } = usePaginatedQuery(api.team.decisions, { actor: role, mode: data.workspace.mode, ...(strategyId ? { strategyId } : {}), ...useAtomValue(viewAsAtom) }, { initialNumItems: 20 });
  type Row = { id: string; token: Bag['token']; line: string; end?: ReactNode; warn?: boolean };
  const rows: Row[] = role === 'research' ? lane.researching.map(item => ({ id: item.id, token: item.token, line: 'Checking now' }))
    : role === 'sniper' ? [...lane.needs.map(item => ({ id: item.id, token: item.token, line: `Wants your OK · ${sol(item.amountSol)}${item.markPriceUsd ? ' at ' + price(item.markPriceUsd, item.supply) : ''}`, warn: true })), ...lane.watching.map(item => ({ id: item.id, token: item.token, line: item.targetPriceUsd ? `Buys under ${price(item.targetPriceUsd, item.supply)}` : 'Buying at market', end: item.expiresAt ? <small className={s.muted}>{Math.max(1, Math.round((item.expiresAt - now) / 60000))}m left</small> : undefined })),
      ...lane.queued.map((item, n) => ({ id: item.id, token: item.token, line: `Waits for room · ${(item.exitReason ?? '').split(' · ')[0].toLowerCase() || 'limits full'}`, end: <small className={s.muted}>#{n + 1}</small> }))]
    : lane.bags.map(bag => ({ id: bag.id, token: bag.token, line: bag.stage === 'held' ? heldLine(bag) : bag.stage === 'buying' ? 'Buying…' : 'Selling…', end: <span className={s.end}><b>{sol(bag.valueSol)}</b><small className={s[tone(change(bag)) ?? 'muted']}>{pct(change(bag))}</small></span> }));
  const openPnl = lane.openPnl;
  const sold = history.slice(0, 12).filter(event => event.kind === 'sold'), soldPnl = sold.reduce((sum, event) => sum + (event.pnlSol ?? 0), 0);
  const stats: [string, ReactNode][] = role === 'research' ? [['checked', lane.found], ['picked', lane.passed], ['pass rate', lane.found ? Math.round(lane.passed / lane.found * 100) + '%' : '—'], ...(lane.kept ? [['kept out · 24h', lane.kept.count] as [string, ReactNode]] : [])]
    : role === 'sniper' ? [['waiting', lane.watching.length + lane.needs.length], ['entered', lane.bought], ['need you', lane.needs.length]]
    : [['holding', lane.bags.length], ['open', <span className={s[tone(openPnl) ?? 'muted']}>{signedSol(openPnl)}</span>], ['last sales', <span className={s[tone(soldPnl) ?? 'muted']}>{signedSol(soldPnl)}</span>]];
  const line = (event: (typeof history)[number]) => event.kind === 'passed' ? `Picked${event.count ? ' · score ' + event.count : ''}` : event.kind === 'rejected' ? 'Turned down' : event.kind === 'armed' ? (event.priceUsd ? `Waited for ${price(event.priceUsd, event.supply)}` : 'Bought at market') : event.kind === 'approval' ? 'Asked you' : event.kind === 'queued' ? 'Queued for room' : event.kind === 'expired' ? 'Let it go' : event.kind === 'bought' ? `Bought ${sol(event.amountSol)}` : event.kind === 'sold' ? 'Sold' : event.kind === 'blocked' ? 'Held back' : 'Couldn’t finish';
  const idle = role === 'research' ? (lane.running ? 'Nothing in the queue right now' : 'Paused') : role === 'sniper' ? 'No picks waiting' : 'Nothing held';
  if (coin) return <DecisionDialog id={coin} onClose={onClose}/>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-[32rem]">
      <DialogTitle className="sr-only">{bot.name}</DialogTitle>
      <div className={s.decision}>
        <div className={s.decisionHead}><BotAvatar role={role} size={44}/><span className={s.grow}><b>{bot.name}</b><small>{bot.job}</small></span></div>
        <Link href={strategyId ? `${appHref('bots', role)}?strategy=${encodeURIComponent(strategyId)}` : appHref('bots', role)} className={s.botOpen} onClick={onClose}>Open {bot.name} page <ChevronRight size={16}/></Link>
        <div className={s.stats}>{stats.map(([label, value]) => <div key={label} className={s.stat}><b>{value}</b><small>{label}</small></div>)}</div>
        {role === 'research' && lane.kept?.count ? <div className={s.laneChips}>{lane.kept.checks.map(check => <span key={check.label} className={s.laneChip}><span className={s.pillLogos}><ShieldCheck size={13}/></span><b>{check.count}</b><small>{check.label}</small></span>)}</div> : null}
        <div>
          <p className={s.label}>Now</p>
          {rows.length ? <div className={s.panelList}>{rows.map(row => <button type="button" key={row.id} className={s.panelRow} onClick={() => setCoin(row.id)}>
            <TokenAvatar className="size-8 rounded-full" address={row.token.address} logoUrl={row.token.logoUri} symbol={row.token.symbol} network="solana" fallback="letter" disableDetailFallback/>
            <span className={s.grow}><b>{row.token.symbol}</b><small className={row.warn ? s.warnText : undefined}><SignedPercentText>{row.line}</SignedPercentText></small></span>
            {row.end}<ChevronRight size={16}/>
          </button>)}</div> : <p className={s.empty}>{idle}</p>}
        </div>
        {(history.length > 0 || status === 'CanLoadMore' || status === 'LoadingMore') && <div>
          <p className={s.label}>Recent decisions</p>
          <div className={`${s.scrollPane} ${s.panelScroll}`}><Paged className={s.panelList} status={status} onMore={() => loadMore(20)}>{history.map(event => <button type="button" key={event.id} className={s.panelRow} onClick={() => setCoin(event.itemId!)}>
            <TokenAvatar className="size-7 rounded-full" logoUrl={event.logoUri ?? undefined} symbol={event.symbol ?? '?'} network="solana" fallback="letter" disableDetailFallback/>
            <span className={s.grow}><b>{event.symbol}</b><small>{line(event)}</small></span>
            {event.kind === 'sold' && <span className={`${s.num} ${s[tone(event.pnlSol) ?? 'muted']}`}>{signedSol(event.pnlSol)}</span>}
            <time className={s.when}>{ago(event.at, now || undefined)}</time>
          </button>)}</Paged></div>
        </div>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** The team beside every page: the three bots and the coins they are on, for the whole team or, on a strategy's page, that strategy's team; and every buy that needs you.
 *  The holdings live on Home and the strategy pages. */
export function TeamPanel({ data, strategyId }: { data: HomeData; strategyId?: string }) {
  const [bot, setBot] = useState<Role | null>(null), command = useCommand();
  // A strategy that left the list (archived, deleted) shows the whole team.
  const scope = strategyId ? data.strategies.find(row => row.id === strategyId) : undefined;
  const running = (scope ? [scope] : data.strategies).filter(row => row.status === 'running').length, live = data.worker.online && !data.workspace.halted && running > 0;
  const status = data.workspace.halted ? 'Team stopped' : !data.worker.online ? 'Reconnecting to your team'
    : scope ? <>{scope.name}<span className={s.muted}> · {scope.status === 'running' ? 'running' : scope.status === 'archiving' ? 'selling out' : 'paused'}</span></>
    : running ? `${running} ${running === 1 ? 'strategy' : 'strategies'} running` : 'All strategies paused';
  return <Sidebar side="right" variant="floating" collapsible="offcanvas" className={s.teamSidebar}>
    <SidebarContent className={s.panel}>
      <div className={s.panelHead} role="status"><span className={s.dot} data-live={live || undefined} data-off={!live || undefined}/><b>{status}</b>{data.workspace.halted && <Button size="xs" onClick={() => command({ type: 'resumeAll' })}>Resume</Button>}</div>
      <Roster data={data} strategyId={scope?.id} onOpen={setBot}/>
      {/* Buys waiting on you stay team-wide: one never hides because another strategy's page is open. */}
      {data.needs.length > 0 && <div className={s.panelNeeds}><NeedsYou items={data.needs} strategies={data.strategies}/></div>}
    </SidebarContent>
    {bot && <BotDialog role={bot} data={data} strategyId={scope?.id} onClose={() => setBot(null)}/>}
  </Sidebar>;
}
