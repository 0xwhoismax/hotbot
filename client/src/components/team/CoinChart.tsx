"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronRight, RotateCcw } from 'lucide-react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, LineStyle, TickMarkType, type CandlestickData, type HistogramData, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { bucketOf, marketCandles, useMarketBars, useMarketOpenedAt, useMarketPrice } from '@/services/market';
import { price, signedSol, sol, tone } from './format';
import { Loading } from './Parts';
import { entryReason, plainReason, type Item } from './Decision';
import { devCandles } from './devCandles';
import { chartPeriodAtom } from './state';
import type { StreamEvent } from './Stream';
import { tokenDetailsLaunchedAt, type useTokenDetails } from './TokenInfo';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import type { AgentRole } from '../../../../types/hotbot';
import type { FeedbackMark } from '../../../../types/feedback';
import { MARKET_CANDLES, MARKET_PERIODS, chainBars, foldBar, type CandlesAnswer, type MarketBar, type MarketPeriod } from '../../../../types/marketFeed';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatTokenPrice } from '@/lib/chartUnits';
import s from './team.module.css';

const PERIODS = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h'] as const satisfies readonly MarketPeriod[];
type Period = typeof PERIODS[number];
const PERIOD_NAME: Record<Period, string> = { '1s': 'second', '5s': '5 seconds', '15s': '15 seconds', '1m': 'minute', '5m': '5 minutes', '15m': '15 minutes', '1h': 'hour', '4h': '4 hours' };
/** Auto sizes candles to the coin's age: each size while the coin is younger than its hours, the last one after (and when the age is unknown). */
const AUTO: [hours: number, size: Period][] = [[3, '1m'], [24, '5m'], [Infinity, '15m']];
const autoPeriod = (ageMinutes: number | null) => AUTO.find(([hours]) => ageMinutes != null && ageMinutes < hours * 60)?.[1] ?? AUTO[AUTO.length - 1][1];
const AUTO_TITLE = 'Sized to the coin’s age: ' + AUTO.map(([hours, size]) => hours === Infinity ? `${size} after` : `${size} under ${hours}h`).join(', ');
// One cached history per coin and period: `rows`, the candles the reads returned; `from`, where they start in full; `readAt`, when the
// latest read began (this clock); `through`, the newest 1-second bar the reads held; `live`, the socket's 1-second bars after it, oldest
// first; and `first`, the start of the coin's earliest candle that the gateway holds, once a read named it.
// Second candles exist only for seconds that traded, so their first load and older pages go by candle count (the latest before a time) instead of a time window.
type History = { rows: MarketBar[]; from: number; readAt: number; through?: number; live: MarketBar[]; first?: number };
/** LIVE: the socket bars `live` holds before its finished periods fold into `rows`. */
const LATEST = 240, OLDER = 480, EDGE = 20, LIVE = 1_800;
/** How many candles one frame shows at a readable width: at least 30. */
const roomOf = (api: IChartApi) => Math.max(30, Math.floor(api.timeScale().width() / 10));
// The latest candles at a readable width (all of them when they fit), with the price fitted to what is on screen.
function frame(api: IChartApi, count: number) {
  const scale = api.timeScale(), room = roomOf(api);
  if (count > room) scale.setVisibleLogicalRange({ from: count - room, to: count + 3 });
  else scale.fitContent();
  api.priceScale('right').applyOptions({ autoScale: true });
}
/** A fixed window of one coin's candles (the Lab's replay) in whole candles: fetched once, never live or paged, shared by the chart and whoever replays them. */
export const rangeCandles = (address: string, period: MarketPeriod, from: number, to: number) => ({
  queryKey: ['coin-chart-range', address, period, from, to],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<History> => {
    const step = MARKET_PERIODS[period];
    return { ...await marketCandles(address, period, bucketOf(from, step), Math.ceil(to / step) * step, undefined, signal), readAt: Date.now(), live: [] };
  },
  staleTime: Infinity, retry: 2, retryDelay: 1500,
});
/** `next` over `base` by candle start. */
const mergeRows = (base: MarketBar[], next: MarketBar[]) => [...new Map([...base, ...next].map(row => [row.t, row])).values()].sort((a, b) => a.t - b.t);
/** `bars` folded onto `rows` in one copy: each folds into the last candle, or opens its period's candle at the last one's close (`chainBars`). */
function foldOn(rows: MarketBar[], bars: MarketBar[], step: number) {
  const out = rows.slice();
  for (const bar of bars) {
    const t = bucketOf(bar.t, step), last = out.at(-1);
    if (!last || t > last.t) out.push(...chainBars([t === bar.t ? bar : { ...bar, t }], last?.c));
    else if (t === last.t) out[out.length - 1] = foldBar(last, bar);
  }
  return out;
}
/** `live` and the bars of `bars` after both `through` and its own last bar. */
function after(live: MarketBar[], bars: MarketBar[], through?: number) {
  let last = Math.max(through ?? -Infinity, live.at(-1)?.t ?? -Infinity);
  const added: MarketBar[] = [];
  for (const bar of bars) if (bar.t > last) { added.push(bar); last = bar.t; }
  return added.length ? [...live, ...added] : live;
}
/** A read merged over what is held. The read with the newer `through` wins candles of the same start, and `live` keeps its bars after the
 *  newest `through` (on the first read, the bars that came before it). */
function land(held: History | undefined, answer: CandlesAnswer, readAt: number, early: MarketBar[]): History {
  const mine = held?.through ?? -Infinity, newest = Math.max(mine, answer.through ?? -Infinity), through = Number.isFinite(newest) ? newest : undefined;
  const rows = !held ? answer.rows : (answer.through ?? -Infinity) >= mine ? mergeRows(held.rows, answer.rows) : mergeRows(answer.rows, held.rows);
  return { rows, from: Math.min(held?.from ?? answer.from, answer.from), readAt, through, live: after([], held?.live ?? early, through), first: answer.first ?? held?.first };
}
/** The socket's bars joined to `live`. Past LIVE bars, its finished periods fold into `rows` and raise `through`. */
function take(held: History, bars: MarketBar[], step: number): History {
  const live = after(held.live, bars, held.through);
  if (live === held.live) return held;
  const open = bucketOf(live[live.length - 1].t, step), done = live.length > LIVE ? live.findIndex(bar => bar.t >= open) : 0;
  return done > 0 ? { ...held, rows: foldOn(held.rows, live.slice(0, done), step), through: live[done - 1].t, live: live.slice(done) } : { ...held, live };
}
type Bar = CandlestickData<UTCTimestamp> & { volume: number };
/** The index of the candle holding `seconds` (the last candle for a time after it), or null before the first. */
function candleIndex(bars: Bar[], seconds: number) {
  if (!bars.length || seconds < bars[0].time) return null;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid].time <= seconds) lo = mid; else hi = mid - 1; }
  return lo;
}
const same = (a: Bar, b: Bar) => a === b || (a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume);
// One drawn bar per candle row, so an unchanged candle keeps its object from one draw to the next.
const drawn = new WeakMap<MarketBar, Bar>();
function toBar(row: MarketBar) {
  let bar = drawn.get(row);
  if (!bar) drawn.set(row, bar = { time: Math.floor(row.t / 1000) as UTCTimestamp, open: row.o, high: row.h, low: row.l, close: row.c, volume: row.v });
  return bar;
}

// Theme tokens are oklch; the canvas chart needs plain rgba, so paint each one onto a 1px canvas and read it back.
let probe: CanvasRenderingContext2D | null = null;
export function themeColor(el: Element, token: string, alpha = 1) {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return 'transparent';
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = getComputedStyle(el).getPropertyValue(token).trim() || '#888';
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${(a / 255) * alpha})`;
}
export function themeOptions(el: Element) {
  const up = themeColor(el, '--positive'), down = themeColor(el, '--destructive'), muted = themeColor(el, '--muted-foreground');
  return {
    chart: {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: muted, fontFamily: getComputedStyle(el).fontFamily, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: themeColor(el, '--foreground', 0.06) } },
      crosshair: { vertLine: { color: themeColor(el, '--foreground', 0.3), labelBackgroundColor: themeColor(el, '--foreground') }, horzLine: { color: themeColor(el, '--foreground', 0.3), labelBackgroundColor: themeColor(el, '--foreground') } },
    },
    up, down, muted, pick: themeColor(el, '--foreground'), volumeUp: themeColor(el, '--positive', 0.28), volumeDown: themeColor(el, '--destructive', 0.28),
  };
}
// Second candles read to the second; minute and longer ones to the minute.
const localTime = (time: Time, seconds: boolean, withDate = false) => new Date((time as number) * 1000).toLocaleString('en-US', { ...(withDate && { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit', ...(seconds && { second: '2-digit' }) });
/** An axis label: a tick that starts a day, month or year names its date; a tick within a day names its time. */
const tickLabel = (time: Time, type: TickMarkType, seconds: boolean) => type <= TickMarkType.DayOfMonth ? new Date((time as number) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : localTime(time, seconds);

/** One bot decision at the time and price it happened, a pin with its bot as the Lab's sales; each sale is also a dashed line at its price.
 *  `entry` is SniperBot's entry decision, `buy` TraderBot's fill. `trade` numbers the coin's picks when there is more than one. */
export type ChartMarker = { id: string; t: number; priceUsd: number; kind: 'pick' | 'entry' | 'buy' | 'sell'; role: AgentRole; title: string; value?: string; tone?: 'up' | 'down'; sub?: string | null; trade?: number; itemId: string | null };
/** A coin's trail (`api.team.trail`) as pins: every pick, entry, buy and sale with a price; picks are numbered as trades once the strategy
 *  picked the coin more than once. An entry at market stores no price: it was set at its pick's price in the same moment, or (back from the
 *  queue) at the armed price of `item`, the coin on screen. */
export function trailMarkers(trail: StreamEvent[] | undefined, item: Item | null | undefined): ChartMarker[] {
  const events = trail ?? [], picks = [...new Set([...events].reverse().map(event => event.itemId))];
  const picked = new Map(events.filter(event => event.kind === 'passed').map(event => [event.itemId, event]));
  return events.flatMap((event): ChartMarker[] => {
    const pick = event.kind === 'armed' ? picked.get(event.itemId) : undefined;
    const priceUsd = event.priceUsd ?? (pick && Math.abs(pick.at - event.at) < 5_000 ? pick.priceUsd : event.kind === 'armed' && event.itemId === item?.id ? item.armedPriceUsd : null);
    if (!priceUsd || !['passed', 'armed', 'bought', 'sold'].includes(event.kind)) return [];
    return [{
      id: event.id, t: event.at, priceUsd, itemId: event.itemId, role: event.kind === 'passed' ? 'research' : event.kind === 'armed' || event.actor === 'sniper' ? 'sniper' : 'trader',
      trade: picks.length > 1 && event.itemId ? picks.indexOf(event.itemId) + 1 : undefined,
      ...(event.kind === 'passed' ? { kind: 'pick' as const, title: 'Picked', value: event.count ? `score ${event.count}` : undefined, sub: plainReason(event.detail).replace(/ · score \d+$/, '') || null }
        : event.kind === 'armed' ? { kind: 'entry' as const, title: 'Entry set', value: event.amountSol != null ? sol(event.amountSol) : undefined, sub: entryReason(event.detail) }
        : event.kind === 'bought' ? { kind: 'buy' as const, title: 'Bought', value: sol(event.amountSol) }
        : { kind: 'sell' as const, title: 'Sold', value: signedSol(event.pnlSol), tone: tone(event.pnlSol), sub: event.detail }),
    }];
  });
}
/** A live chart's `launchedAt` from the coin's details read (`useTokenDetails`): undefined during its first attempt, so Auto waits for the
 *  coin's real age instead of fetching twice; a failing read falls back at once. */
export const chartLaunchedAt = (details: ReturnType<typeof useTokenDetails>) => details.isPending && details.failureCount === 0 ? undefined : tokenDetailsLaunchedAt(details.data);
/** A fixed window instead of the live chart (ms): `view` is the stretch framed on load and on Reset view; `period` is the candle Auto
 *  draws, 1-minute when unset. */
export type ChartRange = { from: number; to: number; view?: { from: number; to: number }; period?: Period };
/** The person's own rating on the chart (Rating.tsx): in a mark mode a click or tap on a candle marks its close; their marks draw as arrows.
 *  `prompt` floats over the chart while marking, with Cancel (`onCancel`), so the page around it never moves. */
export type ChartRating = { mode: 'buy' | 'sell' | null; buy: FeedbackMark | null; sell: FeedbackMark | null; onMark: (kind: 'buy' | 'sell', mark: FeedbackMark) => void; 
  /** A pin in the mark's colour follows the pointer, snapped to the close it would mark. */ ghost?: boolean;
  /** Someone else's rating (the admin's Coin ratings): the marks read Buy and Sell, not Your buy and Your sell. */ theirs?: boolean };
/** Pins in px, as the Lab's (`PIN` in LabPage): a head's top sits `rise` from its dot and its centre `head`. Only one bot's decisions on one
 *  spot (within `near` of its pin's first one) share a pin, so each bot keeps its own head; a head within `width` and `height` of an earlier one
 *  moves up or down a `step` at a time. */
const PIN = { stem: 16, rise: 42, head: 25, near: 14, width: 32, height: 30, step: 30 };
/** A pin's head is its sale (the latest), else its buy, else its entry, else its pick; its ring is that decision's result. */
const RANK = { pick: 0, entry: 1, buy: 2, sell: 3 }, RING = { up: 'var(--positive)', down: 'var(--destructive)', flat: 'var(--foreground)' };
const headOf = (members: ChartMarker[]) => members.reduce((best, m) => RANK[m.kind] >= RANK[best.kind] ? m : best);
/** A pin as laid out: its first decision's id, every id in it in time order and their x range. */
type Lead = { id: string; ids: string[]; from: number; to: number };
/** Price over time from our own market data: candles, volume, the entry price, the latest mark and every bot decision.
 *  `launchedAt` is undefined while the coin's age is still loading (no fetch yet) and null when market data has none. */
export function CoinChart({ address, supply, entryPriceUsd, markPriceUsd, launchedAt, markers = [], focus, onOpenMarker, rating, range }: { address: string; supply: number | null; entryPriceUsd?: number | null; markPriceUsd?: number | null; launchedAt: number | null | undefined; markers?: ChartMarker[]; focus?: string | null; onOpenMarker?: (marker: ChartMarker) => void; rating?: ChartRating; range?: ChartRange }) {
  // Without the coin's supply a market cap cannot be drawn, so the chart reads prices instead of a blank scale.
  const { unit: chosen } = usePriceDisplay(), unit = chosen === 'marketCap' && !supply ? 'price' : chosen;
  const label = unit === 'marketCap' ? 'Market cap' : 'Price', format = (value: number, supplied: number | null) => formatTokenPrice(value, unit, supplied);
  // Live charts share the size picked on this device from coin to coin; a fixed window keeps its own, starting on Auto.
  const [stored, store] = useAtom(chartPeriodAtom), [own, setOwn] = useState<'auto' | Period>('auto');
  const choice = range ? own : PERIODS.includes(stored as Period) ? stored as Period : 'auto', setChoice = range ? setOwn : store;
  const [touching, setTouching] = useState(false), [hovering, setHovering] = useState(false), mobile = useIsMobile();
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (wheelTimer.current) clearTimeout(wheelTimer.current); }, []);
  // Auto: a fixed window's own candle size, else minute candles; a live chart's sized to the coin's age.
  const auto = range ? range.period ?? '1m' : autoPeriod(launchedAt ? (Date.now() - launchedAt) / 60_000 : null), period = choice === 'auto' ? auto : choice;
  // What is on screen as logical candle positions and the candle count they were measured against, tagged with the coin and period it was framed for.
  // Counted from the newest candle, so candles added in front never leave a stale position behind.
  const [view, setView] = useState<{ key: string; from: number; to: number; count: number } | null>(null);
  // The person moved the price off its automatic fit; zooming or Reset view brings it back.
  const [free, setFree] = useState(false);
  const viewKey = `${address}:${period}:${range ? [range.from, range.to, range.view?.from, range.view?.to].join(':') : ''}`;
  const step = MARKET_PERIODS[period], seconds = step < MARKET_PERIODS['1m'];
  const client = useQueryClient();
  const key = ['coin-chart', address, period, launchedAt ?? 0];
  const candles = useQuery(range ? { ...rangeCandles(address, period, range.from, range.to), placeholderData: (previous: History | undefined) => previous } : {
    queryKey: key,
    // The first read loads the latest window (never further back than launch; second candles: the latest 240 by count). Each read after it
    // (on mount, or once the socket opened after the last one) asks only from the newest candle on and merges that over what is loaded, so older pages stay.
    // Every read ends at the current period's end, so browsers on this coin and period share one answer.
    queryFn: async ({ signal }): Promise<History> => {
      const newest = client.getQueryData<History>(key)?.rows.at(-1)?.t, readAt = Date.now(), counted = seconds && newest == null;
      const floor = launchedAt ? bucketOf(launchedAt - step, step) : null;
      const from = newest ?? (counted ? floor ?? 0 : Math.max(bucketOf(readAt - step * LATEST, step), floor ?? -Infinity));
      const answer = await marketCandles(address, period, from, bucketOf(readAt, step) + step, counted ? LATEST : undefined, signal);
      const held = client.getQueryData<History>(key), buffered = early.current.mint === address ? early.current.bars : [];
      if (!held) early.current = { mint: address, bars: [] };
      return land(held, answer, readAt, buffered);
    },
    enabled: launchedAt !== undefined,
    staleTime: 0, retry: 2, retryDelay: 1500, placeholderData: previous => previous,
  });
  // The live chart keeps each second the socket sends after its reads' `through` (until the first read lands, in `early`), and reads again
  // from the newest candle once the socket (re)opens after its last read.
  const live = range ? null : address, tick = useMarketPrice(live), opened = useMarketOpenedAt(), early = useRef({ mint: address, bars: [] as MarketBar[] });
  useMarketBars(live, incoming => {
    if (client.getQueryData<History>(key)) return void client.setQueryData<History>(key, held => held && take(held, incoming, step));
    if (early.current.mint !== address) early.current = { mint: address, bars: [] };
    early.current.bars = after(early.current.bars, incoming).slice(-LIVE);
  });
  const behind = !range && candles.data != null && !candles.isPlaceholderData && candles.data.readAt < opened, { refetch } = candles;
  useEffect(() => { if (behind) void refetch({ cancelRefetch: false }); }, [behind, refetch]);
  // Without a tick, the team's mark and the candles arrive on their own clocks: whichever came last sets the live candle, so a mark that stopped moving (a sold coin) never holds it back.
  const [mark, setMark] = useState({ price: markPriceUsd, at: 0 });
  if (mark.price !== markPriceUsd) setMark({ price: markPriceUsd, at: Date.now() });
  const liveMark = mark.price && mark.at > candles.dataUpdatedAt ? mark.price : null;
  // Development: a coin the local gateway holds no candles for draws made-up ones up to the latest read, through its pins and latest mark (`devCandles`).
  const placeholder = process.env.NODE_ENV === 'development' && candles.data != null && !candles.data.rows.length && !candles.data.live.length;
  const anchorKey = placeholder ? JSON.stringify([markers.map(m => [m.t, m.priceUsd]), markPriceUsd]) : '';
  const folded = useMemo(() => {
    if (!candles.data) return [];
    if (!placeholder) return foldOn(candles.data.rows, candles.data.live, step).map(toBar);
    const to = range?.to ?? candles.data.readAt, anchors = [...markers.map(m => ({ t: m.t, p: m.priceUsd })), ...(markPriceUsd ? [{ t: to, p: markPriceUsd }] : [])];
    const from = range?.from ?? Math.max(to - step * MARKET_CANDLES, Math.min(to - step * LATEST, ...anchors.map(a => a.t - step * EDGE)));
    return devCandles(address, step, from, to, anchors).map(toBar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.data, step, placeholder, anchorKey]);
  // The newest tick moves the last candle, so the chart never lags the header; a tick past the last candle's period opens the next one from its close.
  const bars = useMemo(() => {
    const last = folded.at(-1);
    if (!last) return folded;
    if (tick && tick.t >= last.time * 1000 + step) return [...folded, { time: Math.floor(bucketOf(tick.t, step) / 1000) as UTCTimestamp, open: last.close, high: Math.max(last.close, tick.p), low: Math.min(last.close, tick.p), close: tick.p, volume: 0 }];
    const price = tick && tick.t >= last.time * 1000 ? tick.p : liveMark;
    return price ? [...folded.slice(0, -1), { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) }] : folded;
  }, [folded, tick, liveMark, step]);
  // Scrolling near the oldest candle loads the page before it, until the coin's first candle (else launch, while no read named it). Pages
  // never change, so they are fetched once and never polled.
  const cursor = candles.data?.from;
  const shown = view?.key === viewKey && bars.length ? { from: bars.length - (view.count - view.from), to: bars.length - (view.count - view.to) } : null;
  const firstVisible = shown?.from ?? null;
  const older = useQuery({
    queryKey: ['coin-chart-older', address, period, launchedAt ?? 0, cursor],
    queryFn: async ({ signal }) => {
      // Pages end on a candle's start, so a finished page reads the same each time.
      const to = cursor!, floor = client.getQueryData<History>(key)?.first ?? (launchedAt ? bucketOf(launchedAt - step, step) : null);
      const from = seconds ? floor ?? 0 : Math.max(to - step * OLDER, floor ?? -Infinity);
      const answer = await marketCandles(address, period, from, to, seconds ? OLDER : undefined, signal);
      // With the coin's first candle or a launch time, an empty page is a quiet stretch to move past (or, by count, the start reached);
      // without either, it is the start of the coin's history.
      if (answer.rows.length || answer.first != null || launchedAt) client.setQueryData<History>(key, held => held && { ...held, rows: mergeRows(answer.rows, held.rows), from: Math.min(held.from, answer.from), first: answer.first ?? held.first });
      return answer.rows.length;
    },
    enabled: !range && !placeholder && cursor != null && !candles.isPlaceholderData && firstVisible != null && firstVisible < EDGE && cursor > (candles.data?.first ?? launchedAt ?? -Infinity),
    staleTime: Infinity, retry: 2, retryDelay: 1500,
  });

  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<{ api: IChartApi; candles: ISeriesApi<'Candlestick'>; volume: ISeriesApi<'Histogram'>; entry: IPriceLine | null; exits: IPriceLine[]; marks: ISeriesMarkersPluginApi<Time>; colors: ReturnType<typeof themeOptions> } | null>(null);
  // Away: the newest candle is off screen, or empty space past it takes over a third of the view. A history short enough to fit in one frame,
  // with every candle on screen, is the frame itself: the chart caps a candle's width, so its empty space is the fit, not a move away.
  const last = bars.length - 1, whole = shown != null && chart.current != null && bars.length <= roomOf(chart.current.api) && shown.from <= 0 && shown.to >= last;
  const away = shown != null && !whole && (shown.from > last || shown.to < last || shown.to - last > (shown.to - shown.from) / 3);
  const sales = markers.filter(marker => marker.kind === 'sell');
  // The chart's click handler is registered once; it reads the current rating here.
  const rated = useRef(rating), ghost = useRef<HTMLSpanElement>(null), controls = useRef<HTMLDivElement>(null);
  useEffect(() => { rated.current = rating; });
  // The pins are DOM over the canvas: `place` moves them to their time and price each time the chart paints, reading the latest bars and markers from `placing`.
  const clouds = useRef(new Map<string, HTMLDivElement>());
  // Decisions too close to tell apart share the earliest one's pin: its id → every id in it, in time order. Only changes on a zoom or a new decision.
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const groupsKey = useRef('{}');
  const placing = useRef({ bars: [] as Bar[], markers: [] as ChartMarker[], step: 60 });
  const place = useRef(() => {});
  // What lights a pin, read by `light`: the pointer's x on the chart, the pin whose card is open, the activity row under the pointer (`focus`), and the pins as last laid out.
  const lit = useRef({ x: null as number | null, open: null as string | null, focus: null as string | null, leads: [] as Lead[] });
  // An open card lights its pin alone; else the activity row's pin, with its card; else the pins at the pointer's time. Attributes only, so the pointer moving re-renders nothing.
  const light = useRef(() => {
    const { x, open, focus, leads } = lit.current, focused = focus ? leads.find(lead => lead.ids.includes(focus)) : undefined;
    const on = open ? leads.filter(lead => lead.id === open) : focused ? [focused] : x == null ? [] : leads.filter(lead => x >= lead.from - 6 && x <= lead.to + 6);
    const near = new Set(on.flatMap(lead => lead.ids)), card = open ?? focused?.id;
    for (const [id, node] of clouds.current) {
      if (near.has(id)) node.dataset.near = ''; else delete node.dataset.near;
      if (id === card) node.dataset.open = ''; else delete node.dataset.open;
    }
  });
  // A card opens by pointing (a mouse), by the first tap (a finger; the second opens the decision) or by focus (the keyboard). The finger is
  // read on pointerdown, because iOS Safari reports a tap's click as a mouse's.
  const show = (id: string) => { lit.current.open = id; light.current(); }, tap = useRef<{ touch: boolean; wasOpen: boolean } | null>(null);
  const hide = (id: string) => { if (lit.current.open === id) { lit.current.open = null; light.current(); } };
  const [theme, setTheme] = useState(0);
  // The coin and period the chart was last framed for.
  const fitted = useRef('');
  // What the series holds: when only the newest candles changed (a tick, a folded second), they alone are updated; anything else redraws all.
  const painted = useRef<{ bars: Bar[]; theme: number }>({ bars: [], theme: 0 });
  // A fixed window frames its `view`; the live chart its latest candles.
  const fit = (api: IChartApi) => {
    if (!range?.view) return frame(api, bars.length);
    api.timeScale().setVisibleRange({ from: Math.floor(range.view.from / 1000) as UTCTimestamp, to: Math.ceil(range.view.to / 1000) as UTCTimestamp });
    api.priceScale('right').applyOptions({ autoScale: true });
  };

  // The chart is an external canvas: create it once, keep it in sync with the app theme, dispose on unmount.
  useEffect(() => {
    const el = box.current!;
    // A new chart holds nothing (React builds it again in development), so the next paint sets every candle and frames them.
    painted.current = { bars: [], theme: 0 };
    fitted.current = '';
    const colors = themeOptions(el);
    const api = createChart(el, {
      autoSize: true, ...colors.chart,
      crosshair: { ...colors.chart.crosshair, mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, tickMarkFormatter: (time: Time, type: TickMarkType) => tickLabel(time, type, false) },
      localization: { priceFormatter: price, timeFormatter: (time: Time) => localTime(time, false, true) },
      handleScale: { axisDoubleClickReset: false },
      // A finger moving up or down scrolls the page; a finger moving sideways, a mouse or a pen moves the chart.
      handleScroll: { vertTouchDrag: false },
    });
    const series = api.addSeries(CandlestickSeries, { upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down, borderVisible: false, priceFormat: { type: 'custom', formatter: price, minMove: 1e-12 } });
    const volume = api.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    chart.current = { api, candles: series, volume, entry: null, exits: [], marks: createSeriesMarkers(series, []), colors };
    // A click on the chart closes an open card (a tap's, which no pointer leaves); in a mark mode it marks the candle under it at its close (its end time and closing price).
    api.subscribeClick(param => {
      if (lit.current.open) { lit.current.open = null; light.current(); }
      const r = rated.current, bar = param.time === undefined ? undefined : param.seriesData.get(series) as CandlestickData<UTCTimestamp> | undefined;
      if (r?.mode && bar) r.onMark(r.mode, { t: ((param.time as number) + placing.current.step) * 1000, priceUsd: bar.close });
    });
    api.subscribeCrosshairMove(param => {
      const pin = ghost.current, r = rated.current, bar = param.time === undefined ? undefined : param.seriesData.get(series) as CandlestickData<UTCTimestamp> | undefined;
      if (pin) {
        const px = bar ? api.timeScale().timeToCoordinate(param.time as UTCTimestamp) : null, py = bar ? series.priceToCoordinate(bar.close) : null;
        if (r?.ghost && r.mode && px != null && py != null) { pin.style.display = 'grid'; pin.style.transform = `translate(${px + el.offsetLeft}px, ${py + el.offsetTop}px)`; } else pin.style.display = 'none';
      }
      const x = param.point?.x ?? null;
      if (x !== lit.current.x) { lit.current.x = x; light.current(); }
    });
    place.current = () => {
      const { bars, markers } = placing.current, scale = api.timeScale(), width = scale.width(), height = el.clientHeight - scale.height();
      // The pins' layer covers the chart's frame; the drawing sits inside it at its own offset.
      const left = el.offsetLeft, top = el.offsetTop;
      type At = { id: string; role: AgentRole; x: number; y: number };
      const points: At[] = [];
      for (const marker of [...markers].sort((a, b) => a.t - b.t)) {
        const node = clouds.current.get(marker.id);
        if (!node) continue;
        // A decision's dot sits on the candle holding its time, at its price held within that candle's range (a fill's slippage can pass it),
        // so it always touches the candle; its card keeps the exact price.
        const index = candleIndex(bars, marker.t / 1000), bar = index == null ? null : bars[index];
        const x = bar ? scale.timeToCoordinate(bar.time) : null, y = bar ? series.priceToCoordinate(Math.min(bar.high, Math.max(bar.low, marker.priceUsd))) : null;
        if (x == null || y == null || x < 0 || x > width || y < 0 || y > height) { node.hidden = true; continue; }
        node.hidden = false;
        node.style.transform = `translate(${x + left}px, ${y + top}px)`;
        points.push({ id: marker.id, role: marker.role, x, y });
      }
      // A decision near the first one of an earlier pin of the same bot keeps only its dot and joins that pin.
      const clusters: { first: At; members: At[] }[] = [];
      for (const p of points) {
        let near: typeof clusters[number] | undefined;
        for (let i = clusters.length - 1; i >= 0 && p.x - clusters[i].first.x < PIN.near; i--) if (clusters[i].first.role === p.role && Math.abs(clusters[i].first.y - p.y) < PIN.near) { near = clusters[i]; break; }
        if (near) near.members.push(p); else clusters.push({ first: p, members: [p] });
      }
      // The chart's controls sit on the drawing, so a head keeps out of their box as well (`keep`, grown by half a head).
      const corner = controls.current, keep = corner?.offsetWidth ? { left: corner.offsetLeft - left - PIN.width / 2, right: corner.offsetLeft - left + corner.offsetWidth + PIN.width / 2, top: corner.offsetTop - top - PIN.height / 2, bottom: corner.offsetTop - top + corner.offsetHeight + PIN.height / 2 } : null;
      const leads: Lead[] = [], heads: { x: number; y: number }[] = [];
      for (const { first, members } of clusters) {
        // A pin rises above its price. When an earlier head or the controls are in the way its stem grows a step at a time, above, else below, as
        // far as the chart has room; with no free spot it keeps the first one with room, overlapping.
        const headY = (up: boolean, lift: number) => up ? first.y - PIN.head - lift : first.y + PIN.head + lift;
        const fits = (up: boolean, lift: number) => up ? first.y - PIN.rise - lift >= 0 : first.y + PIN.rise + lift <= height;
        const free = (up: boolean, lift: number) => {
          const y = headY(up, lift);
          return !heads.some(h => Math.abs(h.x - first.x) < PIN.width && Math.abs(h.y - y) < PIN.height) && !(keep && first.x > keep.left && first.x < keep.right && y > keep.top && y < keep.bottom);
        };
        const spots = [0, 1, 2, 3].flatMap(n => [{ up: true, lift: n * PIN.step }, { up: false, lift: n * PIN.step }]).filter(spot => fits(spot.up, spot.lift));
        const { up, lift } = spots.find(spot => free(spot.up, spot.lift)) ?? spots[0] ?? { up: true, lift: 0 };
        heads.push({ x: first.x, y: headY(up, lift) });
        for (const m of members.slice(1)) delete clouds.current.get(m.id)!.dataset.lead;
        const node = clouds.current.get(first.id)!;
        node.dataset.lead = '';
        node.dataset.side = up ? 'up' : 'down';
        node.style.setProperty('--stem', `${PIN.stem + lift}px`);
        // The card opens toward the larger space and scrolls inside what is left of the chart there; centred on its pin where its 17rem fit, else away from the nearer edge.
        const above = up ? first.y - PIN.rise - lift : first.y - 22, below = up ? height - first.y - 22 : height - first.y - PIN.rise - lift;
        node.dataset.tipY = above > below ? 'above' : 'below';
        node.style.setProperty('--room', `${Math.max(96, Math.max(above, below) - 12)}px`);
        node.dataset.tipX = first.x >= 120 && first.x <= width - 120 ? 'center' : first.x < width / 2 ? 'start' : 'end';
        leads.push({ id: first.id, ids: members.map(m => m.id), from: first.x, to: members[members.length - 1].x });
      }
      lit.current.leads = leads;
      light.current();
      const next = Object.fromEntries(leads.filter(lead => lead.ids.length > 1).map(lead => [lead.id, lead.ids])), key = JSON.stringify(next);
      if (key !== groupsKey.current) { groupsKey.current = key; setGroups(next); }
    };
    // Placed again whenever the chart repaints its views (price-axis drags, new candles), scrolls or zooms, and after it lays out a new size.
    series.attachPrimitive({ updateAllViews: () => place.current(), paneViews: () => [] });
    api.timeScale().subscribeVisibleLogicalRangeChange(() => place.current());
    api.timeScale().subscribeSizeChange(() => requestAnimationFrame(() => place.current()));
    let span = 0;
    api.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range) return setView(null);
      // Zooming (the visible span changing) re-centres the price on what is on screen.
      if (span && Math.abs(range.to - range.from - span) > 0.01) { api.priceScale('right').applyOptions({ autoScale: true }); setFree(false); }
      span = range.to - range.from;
      setView({ key: fitted.current, from: range.from, to: range.to, count: series.data().length });
    });
    const recolor = new MutationObserver(() => {
      const next = themeOptions(el);
      chart.current!.colors = next;
      api.applyOptions(next.chart);
      series.applyOptions({ upColor: next.up, downColor: next.down, wickUpColor: next.up, wickDownColor: next.down });
      setTheme(value => value + 1);
    });
    recolor.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => { recolor.disconnect(); api.remove(); chart.current = null; };
  }, []);

  useEffect(() => {
    chart.current?.api.applyOptions({ timeScale: { secondsVisible: seconds, tickMarkFormatter: (time: Time, type: TickMarkType) => tickLabel(time, type, seconds) }, localization: { timeFormatter: (time: Time) => localTime(time, seconds, true) } });
  }, [seconds]);

  // Only labels change units: the raw candles, entry geometry and visible time range stay intact.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const formatter = (value: number) => value < 0 ? '' : formatTokenPrice(value, unit, supply);
    c.api.applyOptions({ localization: { priceFormatter: formatter } });
    c.candles.applyOptions({ priceFormat: { type: 'custom', formatter, minMove: 1e-12 } });
  }, [unit, supply]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const volume = (bar: Bar): HistogramData<UTCTimestamp> => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? c.colors.volumeUp : c.colors.volumeDown });
    const before = painted.current.bars, n = before.length;
    const tail = painted.current.theme === theme && n > 1 && bars.length >= n && bars.length <= n + 1 && (bars.length === n ? bars[n - 1].time === before[n - 1].time : bars[n - 1].time >= before[n - 1].time) && before.every((bar, index) => index >= n - 1 || same(bars[index], bar));
    if (tail) for (const bar of bars.slice(n - 1)) { c.candles.update(bar); c.volume.update(volume(bar)); }
    else { c.candles.setData(bars); c.volume.setData(bars.map(volume)); }
    painted.current = { bars, theme };
    // Frame once per coin and period, on its own candles: the latest at a readable width (older history is a scroll away, so a launch spike never flattens today's candles); later refreshes and older pages keep wherever the person scrolled or zoomed.
    if (bars.length && !candles.isPlaceholderData && fitted.current !== viewKey) {
      fitted.current = viewKey;
      fit(c.api);
      setFree(false);
    }
  }, [bars, viewKey, candles.isPlaceholderData, theme]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    if (c.entry) c.candles.removePriceLine(c.entry);
    c.entry = entryPriceUsd ? c.candles.createPriceLine({ price: entryPriceUsd, color: c.colors.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'Entry' }) : null;
  }, [entryPriceUsd, theme]);

  // The person's marks sit on the candle holding each mark's close time.
  const ratingKey = JSON.stringify([rating?.buy, rating?.sell]), saleKey = JSON.stringify(sales);
  useEffect(() => {
    const c = chart.current, el = box.current;
    if (!c || !el) return;
    const up = themeColor(el, '--positive'), down = themeColor(el, '--destructive'), list: SeriesMarker<Time>[] = [];
    for (const [kind, m] of [['buy', rating?.buy], ['sell', rating?.sell]] as const) {
      const index = m ? candleIndex(bars, m.t / 1000 - 1) : null, time = index == null ? null : bars[index].time;
      if (time !== null) list.push(kind === 'buy' ? { time, position: 'belowBar', shape: 'arrowUp', color: up, text: rating?.theirs ? 'Buy' : 'Your buy', size: 1.5 }
        : { time, position: 'aboveBar', shape: 'arrowDown', color: down, text: rating?.theirs ? 'Sell' : 'Your sell', size: 1.5 });
    }
    c.marks.setMarkers(list.sort((a, b) => (a.time as number) - (b.time as number)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, ratingKey, theme]);

  // Each sale is a dashed line at its price like the entry, coloured by how it did, its result on the price axis.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    for (const line of c.exits) c.candles.removePriceLine(line);
    c.exits = sales.map(m => c.candles.createPriceLine({ price: m.priceUsd, color: m.tone === 'up' ? c.colors.up : m.tone === 'down' ? c.colors.down : c.colors.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: m.value ?? 'Sold' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleKey, theme]);

  const markerKey = JSON.stringify(markers);
  useEffect(() => {
    placing.current = { bars, markers, step: step / 1000 };
    // After the chart has laid out the candles just set.
    const frame = requestAnimationFrame(() => place.current());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, markerKey, step]);
  useEffect(() => { place.current(); }, [groups]);
  useEffect(() => { lit.current.focus = focus ?? null; light.current(); }, [focus]);

  const status = candles.isPending ? 'Loading the chart…' : candles.isError && !bars.length ? 'Market data is unavailable right now.' : bars.length < 2 ? 'Not enough trades in this range yet.' : null;
  // The page header carries the coin's figures, so the chart only speaks up when something is missing or still loading.
  const note = status && !candles.isPending ? status : older.isFetching ? 'Loading earlier candles…' : placeholder ? 'Placeholder candles' : null;
  // A drag moves the chart freely, price included; a mostly sideways drag (or a click) lets the price fit itself again on release. A finger
  // never moves the price (its up-and-down scrolls the page), so it leaves the fit alone.
  const grab = (event: React.PointerEvent) => {
    const scale = chart.current?.api.priceScale('right');
    if (!scale || event.button !== 0) return;
    // The corner controls fade while a finger or pointer is on the chart, so they never get in the way of a drag.
    setTouching(true);
    const pricing = event.pointerType !== 'touch', wasFitted = scale.options().autoScale, y = event.clientY;
    if (pricing) scale.applyOptions({ autoScale: false });
    // Capture phase on the window: the chart library stops some of its own events from bubbling, and a missed release would leave the controls faded.
    // The first end of any kind settles the drag, so a cancelled touch leaves nothing waiting for a later release.
    const ends = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel', 'dragend', 'blur'];
    const release = (end: Event) => {
      setTouching(false);
      ends.forEach(name => window.removeEventListener(name, release, true));
      if (!pricing) return;
      if ((end.type === 'pointerup' || end.type === 'mouseup') && Math.abs((end as MouseEvent).clientY - y) > 12) setFree(true);
      else scale.applyOptions({ autoScale: wasFitted });
    };
    ends.forEach(name => window.addEventListener(name, release, true));
  };
  // Zooming with the wheel counts as interacting too, until it pauses.
  const zoomed = () => { setTouching(true); if (wheelTimer.current) clearTimeout(wheelTimer.current); wheelTimer.current = setTimeout(() => setTouching(false), 600); };
  const reset = () => { const c = chart.current; if (c && bars.length) { fit(c.api); setFree(false); } };
  return <div className={s.priceChart}>
    <div className={s.chartWrap} onDoubleClick={reset}>
      <div ref={box} className={s.priceArea} data-empty={status ? '' : undefined} data-nodata={status && !candles.isPending ? '' : undefined} data-marking={rating?.mode ?? undefined} onPointerDown={grab} onWheel={zoomed} onPointerEnter={event => setHovering(event.pointerType === 'mouse')} onPointerLeave={() => setHovering(false)}/>
      {candles.isPending && <Loading variant="box" height="100%" className={s.chartGhost} label="Loading the chart"/>}
      {note && <span className={s.chartNote}>{note}</span>}
      {rating?.ghost && rating.mode && <span ref={ghost} className={s.chartPin} data-kind={rating.mode} aria-hidden>{rating.mode === 'buy' ? <ArrowUp/> : <ArrowDown/>}</span>}
      {!status && markers.length > 0 && <div className={s.clouds}>{markers.map(marker => {
        const ids = groups[marker.id] ?? [marker.id], members = ids.flatMap(id => markers.find(other => other.id === id) ?? []), head = headOf(members);
        return <div key={marker.id} hidden className={s.cloudMark} data-kind={head.kind} data-tone={head.tone} style={{ '--ring': RING[head.tone ?? 'flat'] } as React.CSSProperties}
          ref={node => { if (node) clouds.current.set(marker.id, node); else clouds.current.delete(marker.id); }} onDoubleClick={event => event.stopPropagation()}
          onPointerEnter={event => { if (event.pointerType === 'mouse') show(marker.id); }} onPointerLeave={event => { if (event.pointerType === 'mouse') hide(marker.id); }}
          onFocus={() => show(marker.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(marker.id); }}>
          <i className={s.cloudDot}/><i className={s.cloudStem}/>
          <button type="button" className={s.cloudBot} onPointerDown={event => { tap.current = { touch: event.pointerType === 'touch', wasOpen: lit.current.open === marker.id }; }}
            onClick={() => { const pressed = tap.current; tap.current = null; if (pressed?.touch && !pressed.wasOpen) show(marker.id); else onOpenMarker?.(head); }}
            aria-label={members.length > 1 ? `${members.length} decisions here; open ${head.title}` : `${marker.title}${marker.value ? ' ' + marker.value : ''} at ${format(marker.priceUsd, supply)}, ${localTime(marker.t / 1000 as Time, true, true)}`}>
            <span><BotAvatar role={head.role} size={22}/></span>{members.length > 1 && <b>{members.length > 99 ? '99+' : members.length}</b>}
          </button>
          <div className={s.cloudTip} role="tooltip"><div className={s.cloudTipCard}>{members.map(member => <button key={member.id} type="button" className={s.cloudTipRow} data-focus={member.id === focus || undefined} disabled={!onOpenMarker || !member.itemId} onClick={() => onOpenMarker?.(member)}>
            <span className={s.cloudTipHead}><BotAvatar role={member.role} size={18}/><b>{member.title}</b>{member.value && <b data-tone={member.tone}>{member.value}</b>}{member.trade && <small>Trade {member.trade}</small>}</span>
            <span className={s.cloudTipFigures}><span>{label}<b>{format(member.priceUsd, supply)}</b></span><span>{localTime(member.t / 1000 as Time, true, true)}</span>{onOpenMarker && member.itemId && <ChevronRight size={13}/>}</span>
            {member.sub && <span className={s.cloudTipSub}>{member.sub}</span>}
          </button>)}</div></div>
        </div>;
      })}</div>}
      {/* Phones: over the empty corner where the price and time axes meet, Reset view on their left. Wider screens: the drawing's top-left corner,
          opening downward, Reset view on their right. Only the size fades while the chart is in use; pin heads keep out of them. */}
      <div ref={controls} className={s.chartPeriod}>
        <span className={s.chartSize} data-dim={touching ? 'press' : hovering ? 'hover' : undefined}><Select value={choice} onValueChange={value => setChoice(value as 'auto' | Period)}>
          <SelectTrigger size="sm" aria-label="Candle size" className="data-[size=sm]:h-9 gap-1.5 rounded-full border-0 px-3.5 py-0 text-sm font-semibold [&_svg]:size-4"><SelectValue>{choice !== 'auto' ? period : launchedAt === undefined && !range ? 'Auto' : `Auto (${auto})`}</SelectValue></SelectTrigger>
          <SelectContent position="popper" side={mobile ? 'top' : 'bottom'} align={mobile ? 'end' : 'start'} className="min-w-0 text-sm">
            <SelectItem value="auto" title={range ? `One candle per ${PERIOD_NAME[auto]}, the window’s own size` : AUTO_TITLE}>Auto ({auto})</SelectItem>
            {PERIODS.map(label => <SelectItem key={label} value={label} title={`One candle per ${PERIOD_NAME[label]}`}>{label}</SelectItem>)}
          </SelectContent>
        </Select></span>
        {!status && (free || (away && !range)) && <button type="button" className={s.chartReset} onClick={reset} onDoubleClick={event => event.stopPropagation()} title={range?.view ? 'Back to the replay with the price fitted (or double-click the chart)' : 'Back to the latest candles with the price fitted (or double-click the chart)'}><RotateCcw size={13}/>Reset view</button>}
      </div>
    </div>
  </div>;
}
