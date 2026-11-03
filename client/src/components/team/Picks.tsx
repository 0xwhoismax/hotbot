"use client";
import { type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import { Rocket } from 'lucide-react';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { CoinPill, CoinRow, useNow } from './Parts';
import { change, type Bag, type StrategyRow } from './data';
import { ago, pct, tone } from './format';
import { coinLookAtom } from './state';
import { RANK, RUNNER_TIERS, recheckBar } from '../../../../types/team';
import { LET_GO, PULSE, researchLabel, type LetGo, type Missed, type NextCoin, type PulseDay, type ResearchPulse } from '../../../../types/pulse';
import s from './team.module.css';

/** A share as the funnel shows it: whole percent, or under 1% for a few of many. */
const share = (part: number, of: number) => of > 0 ? part > 0 && part * 100 < of ? '<1%' : `${Math.round(part / of * 100)}%` : null;

/** A strategy's last day: the coins found, passed and bought, each with its share of the step before, then why the rest were not bought and
 *  how many picks wait now. `bare`: inside another surface. */
export function DayFunnel({ day, waiting, research, running = true, bare = false }: { day: PulseDay; waiting: number; research?: ResearchPulse; running?: boolean; bare?: boolean }) {
  const top = Math.max(1, day.found), lost = (Object.keys(LET_GO) as LetGo[]).filter(why => day.go[why] > 0).sort((a, b) => day.go[b] - day.go[a]);
  const steps: [string, number, string | null][] = [['Found', day.found, null], ['Passed', day.passed, share(day.passed, day.found)], ['Bought', day.bought, share(day.bought, day.passed)]];
  return <section className={bare ? s.dayFunnel : `${s.surface} ${s.dayFunnel}`} aria-label={`Last ${PULSE.hours} hours`}>
    <div className={s.sectionHead}><h2>Last {PULSE.hours} h</h2></div>
    <ol className={s.dayPipe}>{steps.map(([label, n, rate]) => <li key={label}>
      <b>{n.toLocaleString('en-US')}</b><span>{label}{rate && <small>{rate}</small>}</span>
      <i style={{ '--fill': `${n ? Math.max(3, n / top * 100) : 0}%` } as CSSProperties}/>
    </li>)}</ol>
    {(lost.length > 0 || waiting > 0) && <div className={s.dayLost} aria-label="Not bought">
      {lost.map(why => <span key={why}><b>{day.go[why].toLocaleString('en-US')}</b>{LET_GO[why]}</span>)}
      {waiting > 0 && <span data-waiting><b>{waiting}</b>Waiting</span>}
    </div>}
    <ResearchStatus research={research} running={running}/>
  </section>;
}

export function ResearchStatus({ research, running }: { research?: ResearchPulse; running: boolean }) {
  const now = useNow(), screen = research?.screen, window = research?.window;
  return <div className={s.dayFunnel} aria-label="ResearchBot status">
    <div className={s.sectionHead}><h2>ResearchBot</h2>{screen && <span>Screen {ago(screen.at, now)}</span>}</div>
    <div className={s.small}>{researchLabel(research, now, running)}</div>
    {screen && <div className={s.dayLost} aria-label="Last full screen">
      <span><b>{screen.rows.toLocaleString('en-US')}</b>Screened</span>
      <span><b>{screen.candidates.toLocaleString('en-US')}</b>Candidates</span>
    </div>}
    {window && window.attempts > 0 && <div className={s.dayLost} aria-label="Research window">
      <span><b>{window.attempts.toLocaleString('en-US')}</b>Attempts</span>
      <span><b>{window.distinct.toLocaleString('en-US')}{window.untracked ? '+' : ''}</b>Distinct {window.distinct === 1 && !window.untracked ? 'coin' : 'coins'}</span>
      <span>{Math.max(1, Math.round((window.to - window.from) / 60_000))} min</span>
    </div>}
  </div>;
}

/** The best coins of live rankings, in the order a free place takes them: each coin's trading in the last minute, its move since it first
 *  passed, and its fit against its strategy's pass mark. `named`: rows of several strategies name theirs. */
export function NextUp({ rows, named = false }: { rows: { coin: NextCoin; strategy: StrategyRow }[]; named?: boolean }) {
  const display = usePriceDisplay();
  return <div className={s.holdList}>{rows.map(({ coin, strategy }, at) => { const bar = recheckBar(strategy.rules); return <CoinRow key={strategy.id + coin.token.address} id={null} token={coin.token} bot="sniper" word={{ text: `#${at + 1}`, tone: 'muted' }} {...named ? { strategy } : {}}
    facts={<>
      <span className={s[tone(coin.movePct, 1) ?? 'muted']} title={`Since it first passed, at ${display.format(coin.priceUsd / (1 + coin.movePct / 100), coin.supply)}`}>{pct(coin.movePct)}</span>
      <span title="In the last minute"> · {coin.buys} {coin.buys === 1 ? 'buy' : 'buys'} · {coin.buyers} {coin.buyers === 1 ? 'buyer' : 'buyers'}</span>
      {coin.quietSeconds >= RANK.quietSeconds / 2 && <span className={s.warnText} title="Since its last trade"> · quiet {coin.quietSeconds}s</span>}
    </>}
    end={<span className={s.holdProfit} data-fit={coin.fit >= bar ? 'pass' : 'short'} title={`Fit on its live row; the pass mark is ${bar}`}>
      <b><span className="sr-only">Fit </span>{Math.round(coin.fit)}</b><small>fit</small>
    </span>}/>; })}</div>;
}

/** Picks SniperBot let go that ran after, the biggest run first: the most each rose over its price when let go, where it is now, and why it went. */
export function NearMisses({ missed }: { missed: Missed[] }) {
  const display = usePriceDisplay(), now = useNow();
  return <div className={s.holdList}>{missed.map(miss => {
    const high = (miss.highUsd / miss.fromUsd - 1) * 100, last = (miss.lastUsd / miss.fromUsd - 1) * 100, since = ago(miss.at, now);
    return <CoinRow key={miss.id} id={miss.id} token={miss.token} word={{ text: LET_GO[miss.why], tone: 'muted' }}
      facts={<>{since === 'now' ? 'just now' : `${since} ago`} · {display.format(miss.fromUsd, miss.supply)}{display.unit === 'marketCap' && <span className={s.holdUnit}> mcap</span>}</>}
      end={<span className={s.holdProfit} title="Its high since it was let go, and where it is now">
        <b className={s.up}><span className="sr-only">High </span>{pct(high)}</b><small className={s[tone(last, 1) ?? 'muted']}>now {pct(last)}</small>
      </span>}/>;
  })}</div>;
}

/** Held coins past the first runner tier (RUNNER_TIERS), the biggest move first; each opens its coin. */
export function Runners({ bags }: { bags: Bag[] }) {
  const look = useSetAtom(coinLookAtom), first = Math.min(...RUNNER_TIERS);
  const runners = bags.flatMap(bag => { const move = change(bag); return move != null && move >= first ? [{ bag, move }] : []; }).sort((a, b) => b.move - a.move);
  if (!runners.length) return null;
  return <div className={s.runners} aria-label="Running coins">
    <span className={s.runnersHead}><Rocket aria-hidden/>Running</span>
    {runners.map(({ bag, move }) => <CoinPill key={bag.id} coins={[bag.token]} note={pct(move)} tone="up" onClick={() => look(bag.id)}/>)}
  </div>;
}
