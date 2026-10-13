"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { Clapperboard, LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/convex';
import { fetchOHLCVRange } from '@/services/marketDataService';
import { Button } from '@/components/ui/button';
import type { Bag, HomeData, StrategyRow, Trade } from './data';
import type { HeldThen } from './Parts';
import type { ReplayLine } from './ProfitChart';
import type { StreamEvent } from './Stream';
import { viewAsAtom } from './state';
import s from './team.module.css';

type Page = NonNullable<FunctionReturnType<typeof api.team.replay>>;
type Story = { events: StreamEvent[]; profit: NonNullable<Page['profit']>; trades: NonNullable<Page['trades']> };
type Point = { at: number; pnl: number };
type Knot = { t: number; p: number };
type Snapshot = { at: number; bags: Bag[]; realized: number; profit: number; sold: number; wins: number };
/** A coin the strategy held during the story: a sale from the last day (with its result), or a coin it holds now. */
type Position = { id: Trade['id']; token: Trade['token']; inSol: number; entryUsd: number; boughtAt: number; closedAt: number | null; trade: Trade | null };
/** A sale's proceeds and the profit it banked; a take-profit's leave the rest of the coin held. */
type Sale = { at: number; proceeds: number; pnl: number };
type Candle = { at: number; open: number; close: number };

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Story time: each stretch between buys, sales and notes plays in 0.45–2.6 s by how long it really took, so quiet hours fly past and busy minutes breathe. */
const beat = (ms: number) => Math.min(2_600, 450 + 520 * Math.log10(1 + ms / MINUTE));
const SPEEDS = [1, 2, 4, 8, 16, 32] as const;
/** The playhead moves every frame; the page redraws this many times a second. */
const FPS = 12;
const FEED = 60;
/** Points the chart draws for the day: one every 10 minutes, so it reads like the live chart's candles while its tip moves minute by minute. */
const CHART = 144;
/** Profit is recorded every 30 seconds; samples further apart than this are a gap (the worker was down), not a move. */
const GAP = 5 * MINUTE;

/** The last index whose key is at or before `value`, or −1. */
function floorIndex<T>(rows: readonly T[], value: number, key: (row: T) => number) {
  let low = 0, high = rows.length - 1, found = -1;
  while (low <= high) { const mid = (low + high) >> 1; if (key(rows[mid]) <= value) { found = mid; low = mid + 1; } else high = mid - 1; }
  return found;
}
/** Real time to story time and back, linear between knots. */
function along(knots: Knot[], value: number, from: keyof Knot, to: keyof Knot) {
  const index = Math.max(0, Math.min(knots.length - 2, floorIndex(knots, value, knot => knot[from]))), a = knots[index], b = knots[index + 1] ?? a;
  return b[from] === a[from] ? a[to] : a[to] + (b[to] - a[to]) * Math.min(1, Math.max(0, (value - a[from]) / (b[from] - a[from])));
}

let lane: Promise<unknown> = Promise.resolve();
function inLane<T>(signal: AbortSignal, run: () => Promise<T>) {
  const next = lane.then(async () => {
    if (signal.aborted) throw new DOMException('No longer needed', 'AbortError');
    try { return await run(); } finally { await new Promise(resolve => setTimeout(resolve, 350)); }
  });
  lane = next.catch(() => undefined);
  return next;
}
/** A coin's price at a moment from its 1-minute candles, moving from each candle's open to its close across its minute. */
function priceAt(candles: Candle[], at: number) {
  const index = floorIndex(candles, at, candle => candle.at);
  if (index < 0) return null;
  const candle = candles[index];
  return candle.open + (candle.close - candle.open) * Math.min(1, (at - candle.at) / MINUTE);
}

/** The day on one clock: the feed, every coin held during it, profit minute by minute, and the story time that paces it. */
function build(story: Story, snapshot: Snapshot) {
  const end = snapshot.at, events = story.events.filter(event => event.at <= end);
  const sales: (Sale & { item: string })[] = events.flatMap(event => event.kind === 'sold' && event.itemId ? [{ item: event.itemId, at: event.at, proceeds: event.amountSol ?? 0, pnl: event.pnlSol ?? 0 }] : []);
  const salesOf = new Map<string, Sale[]>();
  for (const sale of sales) { const own = salesOf.get(sale.item); if (own) own.push(sale); else salesOf.set(sale.item, [sale]); }
  const positions: Position[] = [
    ...story.trades.flatMap(({ entryUsd, ...trade }) => trade.boughtAt ? [{ id: trade.id, token: trade.token, inSol: trade.inSol, entryUsd, boughtAt: trade.boughtAt, closedAt: trade.closedAt, trade }] : []),
    ...snapshot.bags.flatMap(bag => bag.entry && bag.boughtAt ? [{ id: bag.id as Trade['id'], token: bag.token, inSol: bag.entry.sol, entryUsd: bag.entry.priceUsd, boughtAt: bag.boughtAt, closedAt: null, trade: null }] : []),
  ];
  const byBuy = [...positions].sort((a, b) => a.boughtAt - b.boughtAt), byClose = positions.filter(position => position.closedAt != null).sort((a, b) => a.closedAt! - b.closedAt!);
  // Coins sold before the day still count toward Sold and its winners.
  const winsBefore = Math.max(0, snapshot.wins - byClose.filter(position => position.trade!.pnlSol > 0).length), soldBefore = Math.max(0, snapshot.sold - byClose.length);
  let won = winsBefore;
  const wins = byClose.map(position => won += position.trade!.pnlSol > 0 ? 1 : 0);
  const samples: Point[] = story.profit.flatMap(candle => candle.lastSampleAt > candle.firstSampleAt ? [{ at: candle.firstSampleAt, pnl: candle.open }, { at: candle.lastSampleAt, pnl: candle.close }] : [{ at: candle.firstSampleAt, pnl: candle.open }]);
  // The last day, or the strategy's whole life when it is younger, with a minute's lead-in.
  const from = Math.max(end - DAY, Math.min(samples[0]?.at ?? Infinity, events[0]?.at ?? Infinity, byBuy[0]?.boughtAt ?? Infinity, end) - MINUTE);

  // Banked profit steps at every sale, from what the strategy had banked before the day.
  const base = snapshot.realized - sales.reduce((total, sale) => total + sale.pnl, 0);
  let sum = base;
  const banked = sales.map(sale => ({ at: sale.at, pnl: sum += sale.pnl }));
  const bankedAt = (at: number) => banked[floorIndex(banked, at, point => point.at)]?.pnl ?? base;
  // Total profit is the recorded one, minute by minute, ending on the snapshot. Across a gap in the record (or before it starts) the last
  // recorded figure carries on with each sale's banked profit added, rather than a straight line that would move before anything happened.
  const line = [...samples.filter(point => point.at >= from && point.at < end), { at: end, pnl: snapshot.profit }];
  const profitAt = (at: number) => {
    if (at >= end) return snapshot.profit;
    const index = floorIndex(line, at, point => point.at), a = line[Math.max(0, index)], b = line[index + 1];
    if (index >= 0 && b && b.at - a.at <= GAP) return a.pnl + (b.pnl - a.pnl) * (at - a.at) / (b.at - a.at);
    return a.pnl + bankedAt(at) - bankedAt(a.at);
  };
  // The chart keeps the last point of each of its CHART slots across the recorded samples (and each sale where the record has a gap).
  const times = [...new Set([from, ...line.map(point => point.at), ...sales.map(sale => sale.at)])].filter(at => at >= from && at <= end).sort((a, b) => a - b);
  const slots = new Map<number, Point>();
  for (const at of times) slots.set(Math.floor((at - from) / (end - from) * CHART), { at, pnl: profitAt(at) });
  const chart = [...slots.values()], values = chart.map(point => point.pnl), top = Math.max(...values), bottom = Math.min(...values), room = Math.max(0.005, (top - bottom) * 0.2);

  // Buys, sales and HOTBOT's and your moves set the pace; research and entries play out between them.
  const knots: Knot[] = [{ t: from, p: 0 }];
  for (const event of events) {
    if (event.kind !== 'bought' && event.kind !== 'sold' && event.actor !== 'coordinator' && event.actor !== 'you') continue;
    const last = knots[knots.length - 1];
    if (event.at > last.t) knots.push({ t: event.at, p: last.p + beat(event.at - last.t) });
  }
  const tail = knots[knots.length - 1];
  if (end > tail.t) knots.push({ t: end, p: tail.p + Math.min(1_500, beat(end - tail.t)) });
  const long = end - from;
  return { events, byBuy, byClose, wins, winsBefore, soldBefore, salesOf, knots, total: knots[knots.length - 1].p, from, end, profitAt, bankedAt, chart, low: bottom - room, high: top + room,
    clock: (at: number) => new Date(at).toLocaleString('en-US', long > 20 * HOUR ? { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
}

export type Replay = ReturnType<typeof useReplay>;
export function useReplay(data: HomeData, strategy: StrategyRow | undefined) {
  const convex = useConvex(), as = useAtomValue(viewAsAtom).as;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const read = useQuery({
    queryKey: ['replay', strategy?.id, as ?? null, snapshot?.at],
    enabled: Boolean(snapshot && strategy),
    queryFn: async (): Promise<Story | null> => {
      const events: StreamEvent[] = [];
      let first: Page | null = null, cursor: string | undefined;
      for (;;) {
        const page = await convex.query(api.team.replay, { strategyId: strategy!.id, from: snapshot!.at - DAY, ...(as ? { as } : {}), ...(cursor ? { cursor } : {}) });
        if (!page) return null;
        first ??= page;
        // The query leaves out the strategy and empty fields; the rows come back whole for the feed.
        events.push(...page.events.map((row): StreamEvent => ({ itemId: null, symbol: null, logoUri: null, supply: null, amountSol: null, pnlSol: null, priceUsd: null, count: null, detail: null,
          proposal: null, status: null, judgement: null, alert: null, turnedDown: [], turnedDownTotal: 0, ...row, strategyId: strategy!.id as StreamEvent['strategyId'], card: null })));
        if (page.done) return { events, profit: first.profit ?? [], trades: first.trades ?? [] };
        cursor = page.cursor;
      }
    },
    staleTime: Infinity, gcTime: 0, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const built = useMemo(() => snapshot && read.data ? build(read.data, snapshot) : null, [snapshot, read.data]);
  const [p, setP] = useState(0), [playing, setPlaying] = useState(true), [chosen, setChosen] = useState<number | null>(null);
  const position = useRef(0);
  // The slowest speed that tells the whole story in about a minute and a half, until one is picked.
  const speed = chosen ?? (built ? SPEEDS.find(rate => built.total / rate <= 90_000) ?? SPEEDS[SPEEDS.length - 1] : 1);
  // The playhead is an animation clock: each frame moves it on by the time since the last at the chosen speed, so a slow or throttled tab keeps
  // pace; a gap over a second (a hidden tab) counts as one second.
  useEffect(() => {
    if (!built || !playing) return;
    let frame = 0, last = performance.now(), drawn = 0;
    const tick = (now: number) => {
      position.current = Math.min(built.total, position.current + Math.min(1_000, now - last) * speed); last = now;
      if (position.current >= built.total) { setSnapshot(null); return; }
      if (now - drawn >= 1000 / FPS) { drawn = now; setP(position.current); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [built, playing, speed]);

  const t = built ? along(built.knots, p, 'p', 't') : 0;
  const bought = built ? floorIndex(built.byBuy, t, position => position.boughtAt) + 1 : 0, closed = built ? floorIndex(built.byClose, t, position => position.closedAt!) + 1 : 0, seen = built ? floorIndex(built.events, t, event => event.at) + 1 : 0;
  const holding = useMemo(() => {
    if (!built) return [];
    const gone = new Set(built.byClose.slice(0, closed).map(position => position.id));
    return built.byBuy.slice(0, bought).filter(position => !gone.has(position.id));
  }, [built, bought, closed]);
  // Each coin held at the clock loads its token chart over the part of the day it was held, once, in the shared lane.
  const charts = useQueries({ queries: holding.map(coin => {
    const start = Math.max(coin.boughtAt, built?.from ?? 0) - MINUTE, stop = coin.closedAt ?? built?.end ?? 0;
    return {
      queryKey: ['replay-chart', coin.token.address, start, stop],
      queryFn: ({ signal }: { signal: AbortSignal }) => inLane(signal, async (): Promise<Candle[]> => (await fetchOHLCVRange(coin.token.address, stop - start > 1_000 * MINUTE ? '5m' : '1m', start, stop))
        .filter(row => row.close > 0).map(row => ({ at: row.timestamp < 1e12 ? row.timestamp * 1000 : row.timestamp, open: row.open, close: row.close }))),
      enabled: Boolean(coin.token.address), staleTime: Infinity, gcTime: 15 * MINUTE, retry: false,
    };
  }) });
  // A coin's worth at the clock: what is left of what went in (take-profits sold part of it), moved by its price since the buy; its profit adds what the sales brought back.
  const held = holding.map((coin, index): HeldThen => {
    const price = charts[index]?.data ? priceAt(charts[index].data, t) : null;
    if (price == null || !(coin.entryUsd > 0)) return { id: coin.id, token: coin.token, inSol: coin.inSol, boughtAt: coin.boughtAt };
    const sold = (built?.salesOf.get(coin.id) ?? []).filter(sale => sale.at <= t), back = sold.reduce((total, sale) => total + sale.proceeds, 0);
    const worth = Math.max(0, coin.inSol - sold.reduce((total, sale) => total + sale.proceeds - sale.pnl, 0)) * price / coin.entryUsd;
    return { id: coin.id, token: coin.token, inSol: coin.inSol, boughtAt: coin.boughtAt, worth, pnl: worth + back - coin.inSol };
  });
  const sold = useMemo((): Trade[] => built ? built.byClose.slice(0, closed).map(position => position.trade!) : [], [built, closed]);
  const feed = useMemo(() => built ? built.events.slice(Math.max(0, seen - FEED), seen).reverse() : [], [built, seen]);
  let view = null;
  if (built) {
    const total = built.profitAt(t), shown = floorIndex(built.chart, t, point => point.at) + 1;
    const chart: ReplayLine = { points: [...built.chart.slice(0, shown), { at: t, pnl: total }], from: built.from, end: built.end, low: built.low, high: built.high, value: total };
    view = { at: t, total, realized: built.bankedAt(t), held, sold, soldCount: built.soldBefore + closed, wins: built.wins[closed - 1] ?? built.winsBefore, feed, chart };
  }

  const start = () => {
    if (!strategy) return;
    position.current = 0; setP(0); setPlaying(true); setChosen(null);
    setSnapshot({ at: Date.now(), bags: data.bags.filter(bag => bag.strategyId === strategy.id), realized: strategy.realizedPnlSol, profit: strategy.realizedPnlSol + strategy.openPnlSol, sold: strategy.sold, wins: strategy.wins });
  };
  const seek = (fraction: number) => { if (built) { position.current = fraction * built.total; setP(position.current); } };
  return { active: snapshot != null, error: snapshot != null && read.isError, retry: () => void read.refetch(), playing, speed, progress: built ? p / built.total : 0, clock: built ? built.clock(t) : '',
    start, stop: () => setSnapshot(null), toggle: () => setPlaying(value => !value), seek, cycleSpeed: () => setChosen(SPEEDS[(SPEEDS.indexOf(speed as typeof SPEEDS[number]) + 1) % SPEEDS.length]), view };
}

export function ReplayControl({ replay }: { replay: Replay }) {
  if (!replay.active) return <Button type="button" variant="ghost" size="xs" className={s.replayButton} onClick={replay.start} title="Play back the last 24 hours" aria-label="Replay"><Clapperboard/><span className={s.replayLabel}>Replay</span></Button>;
  const stop = <button type="button" className={s.replayIcon} onClick={replay.stop} aria-label="Stop the replay" title="Back to now"><X/></button>;
  if (replay.error) return <div className={s.replayBar} role="group" aria-label="Replay"><span>Couldn’t load the replay</span><button type="button" className={s.replayIcon} onClick={replay.retry} aria-label="Try again"><RotateCcw/></button>{stop}</div>;
  if (!replay.view) return <div className={s.replayBar} role="status"><LoaderCircle className="motion-safe:animate-spin" aria-hidden/><span>Rewinding…</span>{stop}</div>;
  return <div className={s.replayBar} role="group" aria-label="Replay">
    <button type="button" className={s.replayIcon} data-play onClick={replay.toggle} aria-label={replay.playing ? 'Pause the replay' : 'Play the replay'}>{replay.playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button>
    <time>{replay.clock}</time>
    <span className={s.replayTrack}><i style={{ width: `${replay.progress * 100}%` }}/><input type="range" min={0} max={1} step="any" value={replay.progress} onChange={event => replay.seek(Number(event.target.value))} aria-label="Replay position" aria-valuetext={replay.clock}/></span>
    <button type="button" className={s.replaySpeed} onClick={replay.cycleSpeed} aria-label={`Replay speed ${replay.speed}×`} title="Change speed">{replay.speed}×</button>
    {stop}
  </div>;
}
