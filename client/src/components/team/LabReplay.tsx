"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, MousePointerClick, Search, X } from 'lucide-react';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { tokenSearchSource } from '@/services/tokenSearchSource';
import type { SearchResult } from '@/services/solanaTokenSearch';
import type { TokenData } from '@/types/dataApiTypes';
import { EXIT_PLANS, type ExitPlanId } from '../../../../types/exits';
import type { TeamRules } from '../../../../types/hotbot';
import type { FeedbackMark } from '../../../../types/feedback';
import { checkLabel, type Anchor, type CoinAnswer, type CoinHit, type CoinReplay, type LabMeta } from '../../../../types/lab';
import { CoinChart, type ChartMarker } from './CoinChart';
import { RateButton, useCoinRating } from './Rating';
import type { Bag, StrategyRow } from './data';
import { appHref, price, usd } from './format';
import type { OwnTrade } from './labModel';
import { replayOnLab, searchLab } from './labData';
import { Hint, Loading } from './Parts';
import s from './team.module.css';

const M = 60_000, H = 60 * M;
const BEFORE = H, AFTER = 24 * H;
const pc = (x: number) => Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%` : '–';
const toneOf = (x: number) => !Number.isFinite(x) || Math.abs(x) < 1e-6 ? undefined : x > 0 ? 'up' : 'down';
const when = (at: number) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const span = (minutes: number) => minutes >= 90 ? `${+(minutes / 60).toFixed(1)}h` : `${Math.round(minutes)}m`;

export type ReplayCoin = { mint: string; symbol: string; name?: string; logo?: string | null; supply?: number | null; liquidity?: number | null; openedAt: number };
type Ctx = { data: LabMeta; strategy: StrategyRow; strategies: StrategyRow[]; rules: TeamRules; dip: number; trades: OwnTrade[] | undefined; bags: Bag[]; onPlan: (id: ExitPlanId) => void };

export function CoinReplayBlock({ coin, onCoin, ...ctx }: Ctx & { coin: ReplayCoin | null; onCoin: (coin: ReplayCoin | null) => void }) {
  return <section className={`${s.surface} ${s.studioBlock} ${s.replay}`} aria-label="Coin replay">
    <CoinSearch {...ctx} onPick={onCoin}/>
    {coin && <Replay key={`${coin.mint}:${coin.openedAt}`} {...ctx} coin={coin} onClose={() => onCoin(null)}/>}
  </section>;
}

// ---- Search ----
type Hit = ReplayCoin & { source: 'bought' | 'research' | 'market'; sub: string; cap?: number };
/** The Lab's own coins first (the portfolio's buys, then research's reads), then any Solana coin from market search. */
function CoinSearch({ trades, bags, strategies, onPick }: Ctx & { onPick: (coin: ReplayCoin) => void }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [market, setMarket] = useState<{ query: string; rows: SearchResult<TokenData>[] } | null>(null), [lab, setLab] = useState<{ query: string; rows: CoinHit[] } | null>(null);
  const text = query.trim(), lower = text.toLowerCase();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      tokenSearchSource(text, controller.signal).then(rows => { if (!controller.signal.aborted) setMarket({ query: text, rows: rows.slice(0, 8) }); }).catch(() => {});
      searchLab(text, controller.signal).then(rows => { if (!controller.signal.aborted) setLab({ query: text, rows }); }).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text]);
  const hits = useMemo(() => {
    if (text.length < 2) return [];
    const match = (symbol: string, mint: string) => symbol.toLowerCase().includes(lower) || mint === text;
    const name = (id: string) => strategies.find(row => row.id === id)?.name ?? 'A strategy';
    const out = new Map<string, Hit>();
    for (const bag of bags) if (bag.entry && match(bag.token.symbol, bag.token.address)) out.set(bag.token.address, { mint: bag.token.address, symbol: bag.token.symbol, name: bag.token.name, logo: bag.token.logoUri, supply: bag.supply, source: 'bought', sub: `${name(bag.strategyId)} holds it`, openedAt: 0 });
    for (const trade of trades ?? []) if (!out.has(trade.token.address) && match(trade.token.symbol, trade.token.address)) out.set(trade.token.address, { mint: trade.token.address, symbol: trade.token.symbol, logo: trade.token.logoUri, source: 'bought', sub: `${name(trade.strategyId)} sold it ${when(trade.closedAt)}`, openedAt: 0 });
    for (const c of lab?.query === text ? lab.rows : []) if (!out.has(c.mint)) out.set(c.mint, { mint: c.mint, symbol: c.symbol, logo: c.logo, source: 'research', sub: `Research read ${when(c.firstRead)}${c.reads > 1 ? ` and ${c.reads - 1} more` : ''}`, openedAt: 0 });
    const own = [...out.values()].slice(0, 6);
    const rows = market?.query === text ? market.rows.filter(row => !own.some(hit => hit.mint === row.data.address)).slice(0, 6).map((row): Hit => ({ mint: row.data.address, symbol: row.data.symbol, name: row.data.name, logo: row.data.logo_uri, supply: row.data.price > 0 ? row.data.market_cap / row.data.price : null, liquidity: row.data.liquidity ?? null, source: 'market', sub: row.data.name, cap: row.data.market_cap, openedAt: 0 })) : [];
    return [...own, ...rows];
  }, [text, lower, lab, trades, bags, strategies, market]);
  const searching = text.length >= 2 && market?.query !== text;
  const pick = (hit: Hit) => { onPick({ ...hit, openedAt: Date.now() }); setQuery(''); setOpen(false); };
  return <div className={s.replaySearch} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className={s.search}>
      <Search/>
      <input value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Replay any coin: name, ticker or address" aria-label="Coin to replay"
        onKeyDown={event => { if (event.key === 'Enter' && hits[0]) pick(hits[0]); if (event.key === 'Escape') { setQuery(''); setOpen(false); } }}/>
      {searching && <LoaderCircle className="animate-spin"/>}
    </label>
    {open && text.length >= 2 && <div className={`${s.surface} ${s.replayHits}`} role="listbox" aria-label="Coins">
      {hits.map(hit => <button type="button" role="option" aria-selected={false} key={hit.mint} className={s.row} onClick={() => pick(hit)}>
        <TokenAvatar className="size-8 rounded-[28%]" address={hit.mint} logoUrl={hit.logo ?? undefined} symbol={hit.symbol} network="solana" fallback="letter" disableDetailFallback/>
        <span className={s.grow}><b>{hit.symbol}</b><small>{hit.sub}</small></span>
        <span className={s.replaySource} data-source={hit.source}>{hit.source === 'bought' ? 'Bought' : hit.source === 'research' ? 'Researched' : hit.cap ? usd(hit.cap) : 'No record'}</span>
      </button>)}
      {!searching && !hits.length && <p className={s.empty}>No Solana coin matches that.</p>}
    </div>}
  </div>;
}

// ---- One coin ----
type Start = Anchor & { key: string; strategyId?: string; itemId?: string; actual?: OwnTrade };
type Read = CoinAnswer['reads'][number];
function Replay({ coin, strategy, strategies, rules, dip, trades, bags, onPlan, onClose }: Ctx & { coin: ReplayCoin; onClose: () => void }) {
  const name = (id: string) => strategies.find(row => row.id === id)?.name ?? 'A strategy';
  // The coin's reads under the draft, from the server Lab: they offer research entries and the chart's markers.
  const [reads, setReads] = useState<{ key: string; known: boolean; rows: Read[]; symbol?: string; logo?: string; supply?: number | null; liquidity?: number } | null>(null), rulesKey = JSON.stringify([rules, dip]);
  useEffect(() => {
    const controller = new AbortController();
    replayOnLab({ mint: coin.mint, anchor: null, rules, dip }, controller.signal).then(answer => setReads({ key: rulesKey, known: answer.known, rows: answer.reads, symbol: answer.symbol, logo: answer.logo, supply: answer.supply, liquidity: answer.liquidity }), () => {});
    return () => controller.abort();
  }, [coin.mint, rulesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every recorded entry, the draft's own strategy first: its buys (held, then sold, newest first), other strategies' buys, then research's read.
  const starts = useMemo(() => {
    const held = bags.filter(bag => bag.token.address === coin.mint && bag.entry && bag.boughtAt).map((bag): Start => ({ kind: 'bought', key: `held:${bag.id}`, at: bag.boughtAt!, priceUsd: bag.entry!.priceUsd, label: `${name(bag.strategyId)} bought ${when(bag.boughtAt!)}`, strategyId: bag.strategyId, itemId: bag.id }));
    const sold = (trades ?? []).filter(trade => trade.token.address === coin.mint && trade.boughtAt && trade.entryPriceUsd).sort((a, b) => b.boughtAt! - a.boughtAt!)
      .map((trade): Start => ({ kind: 'bought', key: `sold:${trade.id}`, at: trade.boughtAt!, priceUsd: trade.entryPriceUsd!, label: `${name(trade.strategyId)} bought ${when(trade.boughtAt!)}`, strategyId: trade.strategyId, itemId: trade.id, actual: trade }));
    const bought = [...held, ...sold].sort((a, b) => Number(b.strategyId === strategy.id) - Number(a.strategyId === strategy.id));
    // Research's reads, newest first after the buys: each judged again by the draft on the server.
    const read = (reads?.rows ?? []).map((row, i): Start => ({ kind: 'research', key: `read:${i}`, at: row.at, label: `Read ${when(row.at)}` })).reverse().slice(0, 4);
    return [...bought, ...read];
  }, [bags, trades, reads, coin.mint, strategy.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState<string | null>(null), [picked, setPicked] = useState<FeedbackMark | null>(null);
  // The person's rating of the coin, on their own pipeline item when they hold one; while it marks, chart clicks rate instead of picking an entry.
  const rating = useCoinRating({ mint: coin.mint, symbol: coin.symbol, itemId: starts.find(start => start.itemId && start.strategyId && strategies.some(row => row.id === start.strategyId))?.itemId });
  const base = starts.find(start => start.key === chosen) ?? starts[0] ?? null;
  const anchor: Start | null = picked ? { kind: 'picked', key: 'picked', at: picked.t, label: `Your pick ${when(picked.t)}` } : base;
  const from = Math.floor(((base?.at ?? coin.openedAt - AFTER) - BEFORE) / M) * M, to = Math.floor(Math.min(coin.openedAt, (base?.at ?? coin.openedAt) + AFTER) / M) * M;
  const [answer, setAnswer] = useState<{ key: string; value: CoinAnswer } | null>(null), [failed, setFailed] = useState(false);
  const answerKey = anchor ? JSON.stringify([anchor.kind, anchor.at, anchor.kind === 'bought' ? anchor.priceUsd : 0, rulesKey]) : null;
  useEffect(() => {
    if (!answerKey || !anchor) return;
    const controller = new AbortController(), { key: _key, strategyId: _s, itemId: _i, actual: _a, ...plain } = anchor;
    setFailed(false);
    replayOnLab({ mint: coin.mint, anchor: plain as Anchor, rules, dip }, controller.signal).then(value => setAnswer({ key: answerKey, value }), (cause: Error) => { if (cause.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [answerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = answer?.key === answerKey ? answer.value.result : null, plans = answer?.key === answerKey ? [...answer.value.plans].sort((a, b) => b.replay.ret - a.replay.ret) : [];
  // The draft's verdict on the read behind this entry: the read itself, or for a buy the latest read before it.
  const behind = anchor && reads ? [...reads.rows].reverse().find(row => row.at <= anchor.at + 5_000) : undefined;
  // A coin opened from a link knows only its address: its name and logo come from the Lab's data.
  const plan = rules.exits, size = rules.amountSol, supply = coin.supply ?? reads?.supply ?? null, symbol = reads?.symbol || coin.symbol, logo = coin.logo ?? reads?.logo;
  const markers = useMemo(() => chartMarkers(reads?.rows ?? [], anchor, result), [reads, anchor?.key, result]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = result?.entry ? { from: Math.max(from, result.entry.at - 20 * M), to: Math.min(to, (result.sales.at(-1)?.at ?? to) + 45 * M) } : undefined;

  return <div className={s.replayBody}>
    <header className={s.replayHead}>
      <TokenAvatar className="size-10 rounded-[28%]" address={coin.mint} logoUrl={logo ?? undefined} symbol={symbol} network="solana" fallback="letter" disableDetailFallback/>
      <div className={s.replayName}>
        <h2>{symbol}</h2>
        <span className={s.replayVerdict} data-tone={behind ? behind.verdict === 'pick' ? 'up' : 'down' : undefined}>
          {behind ? `${behind.verdict === 'pick' ? 'The draft picks it' : `${behind.verdict === 'fixed' ? 'Out for good' : 'Turned down'}: ${checkLabel(behind.check ?? 'fit')}`} on the read at ${when(behind.at)}` : 'Research never read it in the Lab’s window'}
        </span>
      </div>
      <RateButton rating={rating} symbol={symbol} supply={supply}/>
      {base?.itemId && <Link className={s.replayLink} href={appHref('tokens', base.itemId)}>Coin page</Link>}
      <button type="button" className={s.replayClose} aria-label="Close the replay" onClick={onClose}><X/></button>
    </header>
    <div className={s.replayStarts} role="group" aria-label="Where the replay starts">
      {starts.map(start => <button type="button" key={start.key} aria-pressed={!picked && start.key === base?.key} onClick={() => { setPicked(null); setChosen(start.key); }}>{start.label}</button>)}
      {picked ? <button type="button" aria-pressed>{`Your pick ${when(picked.t)}`}</button> : null}
      <span className={s.replayHint}><MousePointerClick/>{starts.length ? 'Or click a candle to buy there' : 'No recorded entry: click a candle to buy there'}</span>
    </div>
    <CoinChart address={coin.mint} supply={supply} entryPriceUsd={result?.entry?.priceUsd} launchedAt={null} markers={markers} range={{ from, to, view }}
      rating={rating.marking ? rating.chart : { mode: 'buy', buy: picked, sell: null, onMark: (_kind, mark) => setPicked(mark) }}/>
    {reads && !reads.known ? <p className={s.empty}>The Lab replays the coins research read in its window. This one isn’t among them.</p>
      : failed ? <p className={s.empty}>The Lab couldn’t replay this coin right now.</p>
      : !anchor ? null : answer?.key !== answerKey ? <Loading rows={3} label="Replaying"/> : !result || result.status === 'nodata' ? <p className={s.empty}>No prices after this entry in the Lab’s data.</p>
      : <Outcome result={result} anchor={anchor} end={to} actual={!picked ? base?.actual : undefined} entryNote={anchor.kind === 'research' ? dip > 0 ? `${dip}% dip under research’s price` : rules.entryDelayMinutes ? `after a ${rules.entryDelayMinutes} min watch` : 'at market after research' : anchor.kind === 'picked' ? 'at market then' : 'the real fill'} size={size} plans={plans} planName={plan.name} onPlan={onPlan}/>}
  </div>;
}

function chartMarkers(reads: Read[], anchor: Start | null, result: CoinReplay | null): ChartMarker[] {
  const out: ChartMarker[] = reads.map((read, i) => ({ id: `read-${i}`, t: read.at, priceUsd: read.priceUsd, kind: 'pick', role: 'research', title: read.verdict === 'pick' ? 'Draft picks it' : `Turned down: ${checkLabel(read.check ?? 'fit')}`, itemId: null }));
  if (result?.entry) out.push({ id: 'buy', t: result.entry.at, priceUsd: result.entry.priceUsd, kind: 'buy', role: 'sniper', title: anchor?.kind === 'bought' ? 'Bought' : 'Buys', value: price(result.entry.priceUsd), itemId: null });
  result?.sales.forEach((sale, i) => out.push({ id: `sale-${i}`, t: sale.at, priceUsd: sale.priceUsd, kind: 'sell', role: 'trader', title: `Sells ${Math.round(sale.share * 100)}%`, value: pc(sale.ret), tone: sale.ret >= 0 ? 'up' : 'down', sub: sale.reason, itemId: null }));
  return out;
}

/** The draft's plan on this coin: what it made, each fill, the peaks around them, what really happened, and every named plan from the same entry. */
function Outcome({ result, anchor, end, actual, entryNote, size, plans, planName, onPlan }: { result: CoinReplay; anchor: Start; end: number; actual?: OwnTrade; entryNote: string; size: number; plans: { id: ExitPlanId; replay: CoinReplay }[]; planName: string; onPlan: (id: ExitPlanId) => void }) {
  if (result.status !== 'traded') return <p className={s.empty}>{result.status === 'expired' ? 'SniperBot’s entry never came inside its 2-hour window.' : 'It ran past the run-up cap before the entry.'}</p>;
  const best = Math.max(...plans.map(row => Math.abs(row.replay.ret)), 1e-9);
  // Still held at the last candle: a coin whose candles stop half an hour or more before the window's end stopped trading.
  const dead = result.open && result.lastAt !== undefined && end - result.lastAt > 30 * M, held = !result.open ? '' : dead ? `, no trades after ${when(result.lastAt!)}` : ', still held';
  return <div className={s.replayOutcome}>
    <dl className={s.replayFigures}>
      <Hint text="Replayed by the server Lab on 1-second prices, with the worker’s fills.">
        <div><dt>{planName}{held}</dt><dd className={s[toneOf(result.ret) ?? 'muted']}>{pc(result.ret)}<small>{`${result.ret >= 0 ? '+' : '−'}${Math.abs(result.ret * size).toFixed(2)} SOL`}</small></dd></div>
      </Hint>
      {result.peak && <div><dt>Peak after the buy</dt><dd className={s[toneOf(result.peak.pct) ?? 'muted']}>{pc(result.peak.pct)}<small>{when(result.peak.at)}</small></dd></div>}
      {result.after && <div><dt>Peak after the last sale</dt><dd className={s[toneOf(result.after.pct) ?? 'muted']}>{pc(result.after.pct)}<small>{`next ${span(result.after.minutes)}`}</small></dd></div>}
      {actual && <div><dt>What it really made</dt><dd className={s[toneOf(actual.pnlSol) ?? 'muted']}>{pc(actual.changePct / 100)}<small>{actual.reason ?? 'Sold'}</small></dd></div>}
    </dl>
    <ol className={s.replayFills}>
      <li><span>Buy</span><span>{when(result.entry!.at)}</span><span>{price(result.entry!.priceUsd)}</span><small>{entryNote}</small></li>
      {result.sales.map((sale, i) => <li key={i}><span>Sell {Math.round(sale.share * 100)}%</span><span>{when(sale.at)}</span><b className={s[toneOf(sale.ret) ?? 'muted']}>{pc(sale.ret)}</b><small>{sale.reason}</small></li>)}
      {result.open && <li><span>Held</span><span>{when(result.lastAt!)}</span><span/><small>{dead ? 'No trades after this candle: what is left may not sell' : anchor.kind === 'bought' ? 'The plan never sold the rest in the candles read' : 'The plan hasn’t sold the rest yet'}</small></li>}
    </ol>
    <div className={s.studioBlockHead}><h2>Every plan from this entry<small>same trailing stop</small></h2></div>
    <ol className={`${s.studioLedger} ${s.replayPlans}`}>{plans.map(({ id, replay }) => <li key={id} data-current={EXIT_PLANS[id].exits.name === planName || undefined}>
      <button type="button" onClick={() => onPlan(id)}>
        <span><span>{EXIT_PLANS[id].exits.name}</span></span>
        <span className={s.studioBar} data-tone={toneOf(replay.ret)}><i style={{ width: `${Math.min(50, 50 * Math.abs(replay.ret) / best)}%`, [replay.ret >= 0 ? 'left' : 'right']: '50%' }}/></span>
        <b className={s[toneOf(replay.ret) ?? 'muted']}>{replay.status === 'traded' ? pc(replay.ret) : '–'}</b>
      </button>
    </li>)}</ol>
  </div>;
}

