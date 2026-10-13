"use client";
import { useEffect, useState } from 'react';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { change, type HomeData } from './data';
import { appHref, pct, tone } from './format';
import o from './onboarding.module.css';

type Coin = { symbol: string; logo: string | null; address: string; change: number | null };
const LANES = [
  { role: 'research' as const, name: 'ResearchBot', verb: 'Checking', done: 'Passed' },
  { role: 'sniper' as const, name: 'SniperBot', verb: 'Watching', done: 'Entry hit' },
  { role: 'trader' as const, name: 'TraderBot', verb: 'Holding', done: 'Managing exit' },
];
// The pipeline preview's coins, with bundled logos: onboarding reads no market data.
const PREVIEW_COINS: Coin[] = [
  { symbol: 'JUP', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { symbol: 'WIF', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  { symbol: 'POPCAT', address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' },
  { symbol: 'PENGU', address: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv' },
  { symbol: 'RAY', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
  { symbol: 'TRUMP', address: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN' },
  { symbol: 'MEW', address: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5' },
].map(coin => ({ ...coin, logo: `/hotbot/tokens/${coin.symbol.toLowerCase()}.webp`, change: null }));

/** A preview of the pipeline with well-known coins: each tick, a coin moves one bot down the line. */
export function Stage() {
  const coins = PREVIEW_COINS, [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setTick(value => value + 1), 1900);
    return () => clearInterval(timer);
  }, []);
  const at = (offset: number) => coins[((tick - offset) % coins.length + coins.length) % coins.length];
  // Lane i holds the coin that entered i ticks ago; every third coin is turned away by research.
  const lanes = LANES.map((lane, index) => ({ ...lane, coin: at(index * 2), next: at(index * 2 + 1) }));
  const log = [0, 1, 2, 3].map(step => {
    const coin = at(step + 1), rejected = (tick - step) % 3 === 0;
    return { key: tick - step, text: rejected ? `ResearchBot skipped ${coin.symbol}: holders too concentrated` : step % 2 ? `SniperBot armed ${coin.symbol}` : `TraderBot bought ${coin.symbol}`, bot: rejected ? 'research' as const : step % 2 ? 'sniper' as const : 'trader' as const };
  });
  return <div className={o.stage} aria-label="Preview of your team working with live market coins">
    <div className={o.stageHead}><span className={o.live}/>Live market preview</div>
    <div className={o.lanes}>
      {lanes.map((lane, index) => <div key={lane.role} className={o.lane}>
        <div className={o.laneBot}><BotAvatar role={lane.role} size={76}/></div>
        <strong>{lane.name}</strong>
        <div className={o.chips}>
          <Chip key={'a' + (tick - index * 2)} coin={lane.coin} status={lane.verb} active/>
          <Chip key={'b' + (tick - index * 2 - 1)} coin={lane.next} status={lane.done}/>
        </div>
        {index < 2 && <span className={o.arrow} aria-hidden/>}
      </div>)}
    </div>
    <ol className={o.log}>{log.map((row, index) => <li key={row.key} style={{ opacity: 1 - index * 0.22 }}><BotAvatar role={row.bot} size={22}/><span className={o.logText}>{row.text}</span><time>{index === 0 ? 'now' : index * 2 + 's'}</time></li>)}</ol>
  </div>;
}

function Chip({ coin, status, active = false }: { coin: Coin; status: string; active?: boolean }) {
  return <div className={o.chip} data-active={active || undefined}>
    <TokenAvatar className="size-7 rounded-[28%]" address={coin.address || undefined} logoUrl={coin.logo ?? undefined} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>
    <span><b>{coin.symbol}</b><small>{status}</small></span>
  </div>;
}

type LaneCoin = { key: string; symbol: string; logo?: string; address?: string; status: string; tone?: 'up' | 'down'; href?: string };
type Lanes = { research: LaneCoin[]; sniper: LaneCoin[]; trader: LaneCoin[]; live: boolean };

/** What each bot is on right now, from the home the page already watches: ResearchBot's checks, SniperBot's asks, waits and queue, TraderBot's
 *  coins with their move. `links` off leaves the coins unlinked (the launch step keeps onboarding on screen whatever the address says). */
export function laneCoins(data: HomeData, links = true): Lanes {
  const coin = (item: { id: string; token: HomeData['bags'][number]['token'] }, status: string, move?: 'up' | 'down'): LaneCoin =>
    ({ key: item.id, symbol: item.token.symbol, logo: item.token.logoUri ?? undefined, address: item.token.address, status, tone: move, href: links ? appHref('tokens', item.id) : undefined });
  return {
    research: data.researching.map(item => coin(item, 'Checking')),
    sniper: [...data.needs.map(item => coin(item, 'Wants your OK')), ...data.watching.map(item => coin(item, 'Waiting to buy')), ...data.queued.map(item => coin(item, 'Waits for room'))],
    trader: data.bags.map(bag => { const move = change(bag); return coin(bag, bag.stage === 'buying' ? 'Buying…' : bag.stage === 'selling' ? 'Selling…' : move == null ? 'Holding' : pct(move), bag.stage === 'held' ? tone(move) : undefined); }),
    live: data.strategies.some(row => row.status === 'running') && !data.workspace.halted && data.worker.online,
  };
}

/** The Stage once the team exists: the same three lanes on the coins each bot is really on, and what the team has done so far. Before the first
 *  update arrives (the team is still starting) the lanes wait. */
export function LiveStage({ data, lanes = { research: [], sniper: [], trader: [], live: true } }: { data: HomeData | null | undefined; lanes?: Lanes }) {
  const total = (key: 'found' | 'passed' | 'bought') => data?.strategies.reduce((sum, row) => sum + row.funnel[key], 0) ?? 0;
  return <div className={o.stage} aria-label="Your team at work">
    <div className={o.stageHead}><span className={o.live}/>{data ? 'Your team, live' : 'Starting your team'}</div>
    <TeamLanes {...lanes}/>
    <div className={o.stageCounts} aria-live="polite"><span><b>{total('found')}</b> checked</span><span><b>{total('passed')}</b> picked</span><span><b>{total('bought')}</b> bought</span></div>
  </div>;
}
/** Compact one-row team strip (the launch step without its Stage): each bot with what it is doing right now. */
export function TeamStrip({ research, sniper, trader, live }: Lanes) {
  const lanes = [
    { role: 'research' as const, name: 'Research', coins: research, idle: live ? 'Scanning' : 'Paused' },
    { role: 'sniper' as const, name: 'Sniper', coins: sniper, idle: 'Waiting' },
    { role: 'trader' as const, name: 'Trader', coins: trader, idle: 'No coins' },
  ];
  return <div className={o.strip}>{lanes.map(lane => { const coin = lane.coins[0]; return <a key={lane.role} className={o.stripBot} href={coin?.href}>
    <span className={o.stripHead}><BotAvatar role={lane.role} size={22}/><small>{lane.name}</small>{lane.coins.length > 1 && <i>+{lane.coins.length - 1}</i>}</span>
    {coin ? <span className={o.stripCoin}><TokenAvatar className="size-4 rounded-[28%]" address={coin.address} logoUrl={coin.logo} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/><b>{coin.symbol}</b></span> : null}
    <em className={o.stripStatus} data-tone={coin?.tone}>{coin ? coin.status : lane.idle}</em>
  </a>; })}</div>;
}

/** The same three-bot line as onboarding, driven by what each bot is really working on. */
export function TeamLanes({ research, sniper, trader, live }: Lanes) {
  const lanes = [
    { role: 'research' as const, name: 'ResearchBot', coins: research, idle: live ? 'Scanning the market' : 'Paused' },
    { role: 'sniper' as const, name: 'SniperBot', coins: sniper, idle: 'Waiting for a pass' },
    { role: 'trader' as const, name: 'TraderBot', coins: trader, idle: 'No coins held' },
  ];
  return <div className={o.lanes}>{lanes.map((lane, index) => <div key={lane.role} className={o.lane}>
    <div className={o.laneBot}><BotAvatar role={lane.role} size={60}/></div>
    <strong>{lane.name}</strong>
    <div className={o.chips}>
      {lane.coins.slice(0, 2).map(coin => <a key={coin.key} href={coin.href} className={o.chip} data-active style={{ color: 'inherit', textDecoration: 'none' }}>
        <TokenAvatar className="size-7 rounded-[28%]" address={coin.address} logoUrl={coin.logo} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>
        <span><b>{coin.symbol}</b><small style={coin.tone ? { color: coin.tone === 'up' ? 'var(--positive)' : 'var(--destructive)' } : undefined}>{coin.status}</small></span>
      </a>)}
      {!lane.coins.length && <div className={o.chipIdle}><span className={o.idleDot}/>{lane.idle}</div>}
      {lane.coins.length > 2 && <small className={o.more}>+{lane.coins.length - 2} more</small>}
    </div>
    {index < 2 && <span className={o.arrow} aria-hidden/>}
  </div>)}</div>;
}
