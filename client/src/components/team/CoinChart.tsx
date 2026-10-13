"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, LineStyle, type CandlestickData, type HistogramData, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { fetchOHLCVRange } from '@/services/marketDataService';
import { price } from './format';
import { Loading } from './Parts';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import type { AgentRole } from '../../../../types/hotbot';
import type { FeedbackMark } from '../../../../types/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatTokenPrice } from '@/lib/chartUnits';
import type { OHLCVData } from '@/types/dataApiTypes';
import s from './team.module.css';

const PERIODS = [['1s', 1_000], ['5s', 5_000], ['15s', 15_000], ['1m', 60_000], ['5m', 300_000], ['15m', 900_000], ['1h', 3_600_000], ['4h', 14_400_000]] as const;
type Period = typeof PERIODS[number][0];
const PERIOD_NAME: Record<Period, string> = { '1s': 'second', '5s': '5 seconds', '15s': '15 seconds', '1m': 'minute', '5m': '5 minutes', '15m': '15 minutes', '1h': 'hour', '4h': '4 hours' };
// Auto sizes candles to the coin's age: 1-minute for its first few hours, 5-minute through its first day, 15-minute after (and when the age is unknown).
const autoPeriod = (ageMinutes: number | null): Period => ageMinutes == null ? '15m' : ageMinutes < 180 ? '1m' : ageMinutes < 1440 ? '5m' : '15m';
// One cached history per coin and period: every candle loaded so far, and `from`, the earliest time already asked for.
// Second candles exist only for seconds that traded, so their first load and older pages go by candle count (the latest before a time) instead of a time window.
type History = { rows: OHLCVData[]; from: number };
const LATEST = 240, OLDER = 480, EDGE = 20;
// The latest candles at a readable width (at least 30, all of them when they fit), with the price fitted to what is on screen.
function frame(api: IChartApi, count: number) {
  const scale = api.timeScale(), room = Math.max(30, Math.floor(scale.width() / 10));
  if (count > room) scale.setVisibleLogicalRange({ from: count - room, to: count + 3 });
  else scale.fitContent();
  api.priceScale('right').applyOptions({ autoScale: true });
}
export const rangeCandles = (address: string, period: string, from: number, to: number) => ({
  queryKey: ['coin-chart-range', address, period, from, to],
  queryFn: async (): Promise<History> => ({ rows: (await fetchOHLCVRange(address, period, from, to, 'solana')).filter(row => row.close > 0), from }),
  staleTime: Infinity, retry: 2, retryDelay: 1500,
});
const mergeRows = (base: OHLCVData[], next: OHLCVData[]) => [...new Map([...base, ...next].map(row => [row.timestamp, row])).values()].sort((a, b) => a.timestamp - b.timestamp);

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

/** One bot decision at the time and price it happened, a pin with its bot as the Lab's sales; each sale is also a dashed line at its price.
 *  `trade` numbers the coin's picks when there is more than one. */
export type ChartMarker = { id: string; t: number; priceUsd: number; kind: 'pick' | 'buy' | 'sell'; role: AgentRole; title: string; value?: string; tone?: 'up' | 'down'; sub?: string | null; trade?: number; itemId: string | null };
/** A fixed window instead of the live chart (ms): `view` is the stretch framed on load and on Reset view. */
export type ChartRange = { from: number; to: number; view?: { from: number; to: number } };
/** The person's own rating on the chart (Rating.tsx): in a mark mode a click or tap on a candle marks its close; their marks draw as arrows.
 *  `prompt` floats over the chart while marking, with Cancel (`onCancel`), so the page around it never moves. */
export type ChartRating = { mode: 'buy' | 'sell' | null; buy: FeedbackMark | null; sell: FeedbackMark | null; onMark: (kind: 'buy' | 'sell', mark: FeedbackMark) => void; prompt?: string; onCancel?: () => void };
/** Pins in px, as the Lab's (`PIN` in LabPage): a head's top sits `rise` from its dot and its centre `head`. Only decisions on one spot
 *  (within `near` of a pin's first one) share a pin; a head within `width` and `height` of an earlier one moves up or down a `step` at a time. */
const PIN = { stem: 16, rise: 42, head: 25, near: 14, width: 32, height: 30, step: 30 };
/** A pin's head is its sale (the latest), else its buy, else its pick; its ring is that decision's result. */
const RANK = { pick: 0, buy: 1, sell: 2 }, RING = { up: 'var(--positive)', down: 'var(--destructive)', flat: 'var(--foreground)' };
const headOf = (members: ChartMarker[]) => members.reduce((best, m) => RANK[m.kind] >= RANK[best.kind] ? m : best);
/** A pin as laid out: its first decision's id, every id in it in time order and their x range. */
type Lead = { id: string; ids: string[]; from: number; to: number };
/** Price over time from our own market data: candles, volume, the entry price, the latest mark and every bot decision.
 *  `launchedAt` is undefined while the coin's age is still loading (no fetch yet) and null when market data has none. */
export function CoinChart({ address, supply, entryPriceUsd, markPriceUsd, launchedAt, markers = [], focus, onOpenMarker, rating, range }: { address: string; supply: number | null; entryPriceUsd?: number | null; markPriceUsd?: number | null; launchedAt: number | null | undefined; markers?: ChartMarker[]; focus?: string | null; onOpenMarker?: (marker: ChartMarker) => void; rating?: ChartRating; range?: ChartRange }) {
  const { unit, label, format } = usePriceDisplay();
  const [choice, setChoice] = useState<'auto' | Period>('auto');
  const [touching, setTouching] = useState(false), [hovering, setHovering] = useState(false), mobile = useIsMobile();
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (wheelTimer.current) clearTimeout(wheelTimer.current); }, []);
  // A fixed window reads minute candles unless the person picks another size.
  const period = choice === 'auto' ? range ? '1m' : autoPeriod(launchedAt ? (Date.now() - launchedAt) / 60_000 : null) : choice;
  // What is on screen as logical candle positions and the candle count they were measured against, tagged with the coin and period it was framed for.
  // Counted from the newest candle, so candles added in front never leave a stale position behind.
  const [view, setView] = useState<{ key: string; from: number; to: number; count: number } | null>(null);
  // The person moved the price off its automatic fit; zooming or Reset view brings it back.
  const [free, setFree] = useState(false);
  const viewKey = `${address}:${period}:${range ? [range.from, range.to, range.view?.from, range.view?.to].join(':') : ''}`;
  const step = PERIODS.find(row => row[0] === period)![1], seconds = step < 60_000;
  const client = useQueryClient();
  const key = ['coin-chart', address, period, launchedAt ?? 0];
  const candles = useQuery(range ? { ...rangeCandles(address, period, range.from, range.to), placeholderData: (previous: History | undefined) => previous } : {
    queryKey: key,
    // The first fetch loads the latest window (never further back than launch; second candles: the latest 240 by count); every 3-second poll after it asks only from the newest candle on (the live one and anything after a pause) and folds it into what is loaded, so older pages stay.
    queryFn: async (): Promise<History> => {
      const newest = client.getQueryData<History>(key)?.rows.at(-1)?.timestamp;
      const to = Date.now(), from = newest ?? Math.max(to - step * LATEST, launchedAt ? launchedAt - step : -Infinity);
      const counted = seconds && newest == null;
      const rows = (await fetchOHLCVRange(address, period, from, to, 'solana', counted ? LATEST : undefined)).filter(row => row.close > 0);
      const held = client.getQueryData<History>(key), start = counted && rows.length ? rows[0].timestamp : from;
      return { rows: mergeRows(held?.rows ?? [], rows), from: Math.min(held?.from ?? start, start) };
    },
    enabled: launchedAt !== undefined,
    refetchInterval: 3_000, staleTime: 2_000, retry: 2, retryDelay: 1500, placeholderData: previous => previous,
  });
  // The team's mark and the candles arrive on their own clocks: whichever came last sets the live candle, so a mark that stopped moving (a sold coin) never holds it back.
  const [mark, setMark] = useState({ price: markPriceUsd, at: 0 });
  if (mark.price !== markPriceUsd) setMark({ price: markPriceUsd, at: Date.now() });
  const liveMark = mark.price && mark.at > candles.dataUpdatedAt ? mark.price : null;
  // Bars in ascending, unique seconds; a newer mark moves the last candle so the chart never lags the header.
  const bars = useMemo(() => {
    const byTime = new Map<number, CandlestickData<UTCTimestamp> & { volume: number }>();
    for (const row of candles.data?.rows ?? []) {
      const t = Math.floor((row.timestamp < 1e12 ? row.timestamp : row.timestamp / 1000)) as UTCTimestamp;
      byTime.set(t, { time: t, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume });
    }
    const rows = [...byTime.values()].sort((a, b) => a.time - b.time);
    const last = rows[rows.length - 1];
    if (last && liveMark) rows[rows.length - 1] = { ...last, close: liveMark, high: Math.max(last.high, liveMark), low: Math.min(last.low, liveMark) };
    return rows;
  }, [candles.data, liveMark]);
  // Scrolling near the oldest candle loads the page before it, until launch. Pages never change, so they are fetched once and never polled.
  const cursor = candles.data?.from;
  const shown = view?.key === viewKey && bars.length ? { from: bars.length - (view.count - view.from), to: bars.length - (view.count - view.to) } : null;
  // Away: the newest candle is off screen, or empty space past it takes over a third of the view.
  const firstVisible = shown?.from ?? null, away = shown != null && (shown.from > bars.length - 1 || shown.to < bars.length - 1 || shown.to - (bars.length - 1) > (shown.to - shown.from) / 3);
  const older = useQuery({
    queryKey: ['coin-chart-older', address, period, launchedAt ?? 0, cursor],
    queryFn: async () => {
      const to = seconds ? cursor! - 1 : cursor!, from = Math.max(to - step * OLDER, launchedAt ? launchedAt - step : -Infinity);
      const rows = (await fetchOHLCVRange(address, period, from, to, 'solana', seconds ? OLDER : undefined)).filter(row => row.close > 0);
      // A page by count reaches back to its oldest candle; an empty one is the start of the coin's history.
      const start = !seconds ? from : rows.length ? rows[0].timestamp : launchedAt ? launchedAt - step : from;
      // With a launch time, an empty page is a quiet stretch to move past (or, by count, launch reached); without one, it is the start of the coin's history.
      if (rows.length || launchedAt) client.setQueryData<History>(key, held => held && { rows: mergeRows(rows, held.rows), from: Math.min(held.from, start) });
      return rows.length;
    },
    enabled: !range && cursor != null && !candles.isPlaceholderData && firstVisible != null && firstVisible < EDGE && (!launchedAt || cursor > launchedAt),
    staleTime: Infinity, retry: 2, retryDelay: 1500,
  });

  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<{ api: IChartApi; candles: ISeriesApi<'Candlestick'>; volume: ISeriesApi<'Histogram'>; entry: IPriceLine | null; exits: IPriceLine[]; marks: ISeriesMarkersPluginApi<Time>; colors: ReturnType<typeof themeOptions> } | null>(null);
  const sales = markers.filter(marker => marker.kind === 'sell');
  // The chart's click handler is registered once; it reads the current rating here.
  const rated = useRef(rating);
  useEffect(() => { rated.current = rating; });
  // The pins are DOM over the canvas: `place` moves them to their time and price each time the chart paints, reading the latest bars and markers from `placing`.
  const clouds = useRef(new Map<string, HTMLDivElement>());
  // Decisions too close to tell apart share the earliest one's pin: its id → every id in it, in time order. Only changes on a zoom or a new decision.
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const groupsKey = useRef('{}');
  const placing = useRef({ bars: [] as { time: number }[], markers: [] as ChartMarker[], step: 60 });
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
  // A card opens by pointing (a mouse), by the first tap (a finger; the second opens the decision, `openAtTap`) or by focus (the keyboard).
  const show = (id: string) => { lit.current.open = id; light.current(); }, openAtTap = useRef(false);
  const hide = (id: string) => { if (lit.current.open === id) { lit.current.open = null; light.current(); } };
  const [theme, setTheme] = useState(0);
  // The coin and period the chart was last framed for.
  const fitted = useRef('');
  // A fixed window frames its `view`; the live chart its latest candles.
  const fit = (api: IChartApi) => {
    if (!range?.view) return frame(api, bars.length);
    api.timeScale().setVisibleRange({ from: Math.floor(range.view.from / 1000) as UTCTimestamp, to: Math.ceil(range.view.to / 1000) as UTCTimestamp });
    api.priceScale('right').applyOptions({ autoScale: true });
  };

  // The chart is an external canvas: create it once, keep it in sync with the app theme, dispose on unmount.
  useEffect(() => {
    const el = box.current!;
    const colors = themeOptions(el);
    const api = createChart(el, {
      autoSize: true, ...colors.chart,
      crosshair: { ...colors.chart.crosshair, mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, tickMarkFormatter: (time: Time) => localTime(time, false) },
      localization: { priceFormatter: price, timeFormatter: (time: Time) => localTime(time, false, true) },
      handleScale: { axisDoubleClickReset: false },
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
      const x = param.point?.x ?? null;
      if (x !== lit.current.x) { lit.current.x = x; light.current(); }
    });
    place.current = () => {
      const { bars, markers, step } = placing.current, scale = api.timeScale(), width = scale.width(), height = el.clientHeight - scale.height();
      // A decision inside a candle sits at its fraction of that candle's span; one after the last candle sits on it.
      const at = (t: number) => {
        let lo = 0, hi = bars.length - 1;
        if (hi < 0 || t < bars[0].time) return null;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid].time <= t) lo = mid; else hi = mid - 1; }
        return lo - 0.5 + Math.min(1, (t - bars[lo].time) / step);
      };
      type At = { id: string; x: number; y: number };
      const points: At[] = [];
      for (const marker of [...markers].sort((a, b) => a.t - b.t)) {
        const node = clouds.current.get(marker.id);
        if (!node) continue;
        // The chart maps only whole candle positions to pixels, so a fraction is read between the two candles around it.
        const logical = at(marker.t / 1000), whole = logical == null ? null : Math.floor(logical);
        const left = whole == null ? null : scale.logicalToCoordinate(whole as never), right = whole == null ? null : scale.logicalToCoordinate(whole + 1 as never);
        const x = left == null || right == null ? null : left + (right - left) * (logical! - whole!), y = series.priceToCoordinate(marker.priceUsd);
        if (x == null || y == null || x < 0 || x > width || y < 0 || y > height) { node.hidden = true; continue; }
        node.hidden = false;
        node.style.transform = `translate(${x}px, ${y}px)`;
        points.push({ id: marker.id, x, y });
      }
      // A decision near the first one of an earlier pin keeps only its dot and joins that pin.
      const clusters: { first: At; members: At[] }[] = [];
      for (const p of points) {
        let near: typeof clusters[number] | undefined;
        for (let i = clusters.length - 1; i >= 0 && p.x - clusters[i].first.x < PIN.near; i--) if (Math.abs(clusters[i].first.y - p.y) < PIN.near) { near = clusters[i]; break; }
        if (near) near.members.push(p); else clusters.push({ first: p, members: [p] });
      }
      const leads: Lead[] = [], heads: { x: number; y: number }[] = [];
      for (const { first, members } of clusters) {
        // A pin rises above its price. When an earlier head is in the way its stem grows a step at a time, above, else below, as far as the chart
        // has room; with no free spot it keeps the first one with room, overlapping.
        const headY = (up: boolean, lift: number) => up ? first.y - PIN.head - lift : first.y + PIN.head + lift;
        const fits = (up: boolean, lift: number) => up ? first.y - PIN.rise - lift >= 0 : first.y + PIN.rise + lift <= height;
        const free = (up: boolean, lift: number) => !heads.some(h => Math.abs(h.x - first.x) < PIN.width && Math.abs(h.y - headY(up, lift)) < PIN.height);
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

  // Second candles label the time axis and crosshair to the second.
  useEffect(() => {
    chart.current?.api.applyOptions({ timeScale: { secondsVisible: seconds, tickMarkFormatter: (time: Time) => localTime(time, seconds) }, localization: { timeFormatter: (time: Time) => localTime(time, seconds, true) } });
  }, [seconds]);

  // Only labels change units: the raw candles, entry geometry and visible time range stay intact.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const formatter = (value: number) => value < 0 || (unit === 'marketCap' && !supply) ? '' : formatTokenPrice(value, unit, supply);
    c.api.applyOptions({ localization: { priceFormatter: formatter } });
    c.candles.applyOptions({ priceFormat: { type: 'custom', formatter, minMove: 1e-12 } });
  }, [unit, supply]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.candles.setData(bars);
    c.volume.setData(bars.map((bar): HistogramData<UTCTimestamp> => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? c.colors.volumeUp : c.colors.volumeDown })));
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
    const candleAt = (seconds: number) => {
      if (!bars.length || seconds < bars[0].time) return null;
      let lo = 0, hi = bars.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid].time <= seconds) lo = mid; else hi = mid - 1; }
      return bars[lo].time;
    };
    const ember = themeColor(el, '--ember'), list: SeriesMarker<Time>[] = [];
    for (const [kind, m] of [['buy', rating?.buy], ['sell', rating?.sell]] as const) {
      const time = m ? candleAt(m.t / 1000 - 1) : null;
      if (time !== null) list.push(kind === 'buy' ? { time, position: 'belowBar', shape: 'arrowUp', color: ember, text: 'Your buy', size: 1.5 } : { time, position: 'aboveBar', shape: 'arrowDown', color: ember, text: 'Your sell', size: 1.5 });
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
  const note = status && !candles.isPending ? status : unit === 'marketCap' && !supply ? 'Supply unavailable' : older.isFetching ? 'Loading earlier candles…' : null;
  // A drag moves the chart freely, price included; a mostly sideways drag (or a click) lets the price fit itself again on release.
  const grab = (event: React.PointerEvent) => {
    const scale = chart.current?.api.priceScale('right');
    if (!scale || event.button !== 0) return;
    // The corner controls fade while a finger or pointer is on the chart, so they never get in the way of a drag.
    setTouching(true);
    // Capture phase on the window: the chart library stops some of its own events from bubbling, and a missed release would leave the controls faded.
    const ends = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel', 'dragend', 'blur'];
    const release = () => { setTouching(false); ends.forEach(name => window.removeEventListener(name, release, true)); };
    ends.forEach(name => window.addEventListener(name, release, true));
    const wasFitted = scale.options().autoScale, y = event.clientY;
    scale.applyOptions({ autoScale: false });
    window.addEventListener('pointerup', up => {
      if (Math.abs(up.clientY - y) > 12) setFree(true);
      else scale.applyOptions({ autoScale: wasFitted });
    }, { once: true });
  };
  // Zooming with the wheel counts as interacting too, until it pauses.
  const zoomed = () => { setTouching(true); if (wheelTimer.current) clearTimeout(wheelTimer.current); wheelTimer.current = setTimeout(() => setTouching(false), 600); };
  const reset = () => { const c = chart.current; if (c && bars.length) { fit(c.api); setFree(false); } };
  return <div className={`${s.surface} ${s.priceChart}`}>
    <div className={s.chartWrap} onDoubleClick={reset}>
      <div ref={box} className={s.priceArea} data-empty={status ? '' : undefined} data-marking={rating?.mode ?? undefined} onPointerDown={grab} onWheel={zoomed} onPointerEnter={event => setHovering(event.pointerType === 'mouse')} onPointerLeave={() => setHovering(false)}/>
      {candles.isPending && <Loading variant="box" height="100%" className={s.chartGhost} label="Loading the chart"/>}
      {note && <span className={s.chartNote}>{note}</span>}
      {rating?.prompt && <span className={s.chartPrompt} role="status">{rating.prompt}{rating.onCancel && <button type="button" onClick={rating.onCancel}>Cancel</button>}</span>}
      {!status && markers.length > 0 && <div className={s.clouds}>{markers.map(marker => {
        const ids = groups[marker.id] ?? [marker.id], members = ids.flatMap(id => markers.find(other => other.id === id) ?? []), head = headOf(members);
        return <div key={marker.id} hidden className={s.cloudMark} data-kind={marker.kind} data-tone={marker.tone} style={{ '--ring': RING[head.tone ?? 'flat'] } as React.CSSProperties}
          ref={node => { if (node) clouds.current.set(marker.id, node); else clouds.current.delete(marker.id); }} onDoubleClick={event => event.stopPropagation()}
          onPointerEnter={event => { if (event.pointerType === 'mouse') show(marker.id); }} onPointerLeave={event => { if (event.pointerType === 'mouse') hide(marker.id); }}
          onFocus={() => show(marker.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(marker.id); }}>
          <i className={s.cloudDot}/><i className={s.cloudStem}/>
          <button type="button" className={s.cloudBot} onPointerDown={() => { openAtTap.current = lit.current.open === marker.id; }}
            onClick={event => { if ((event.nativeEvent as PointerEvent).pointerType === 'touch' && !openAtTap.current) show(marker.id); else onOpenMarker?.(head); }}
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
      {/* Phones: over the empty corner where the price and time axes meet. Wider screens: the chart's top-left corner, opening downward. */}
      <div className={s.chartPeriod} data-dim={touching ? 'press' : hovering ? 'hover' : undefined}>
        <button type="button" aria-pressed={choice === 'auto'} title="Auto sizes candles to the coin's age: 1-minute for its first hours, 5-minute through its first day, 15-minute after" onClick={() => setChoice(choice === 'auto' ? period : 'auto')}>Auto</button>
        <Select value={period} onValueChange={value => setChoice(value as Period)}>
          <SelectTrigger size="sm" aria-label="Candle size" className="data-[size=sm]:h-9 gap-1.5 rounded-full border-0 bg-foreground/[0.07] px-3.5 py-0 text-sm font-semibold shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)] dark:bg-foreground/[0.07] [&_svg]:size-4"><SelectValue>{period}</SelectValue></SelectTrigger>
          <SelectContent position="popper" side={mobile ? 'top' : 'bottom'} align={mobile ? 'end' : 'start'} className="min-w-0 text-sm">
            {PERIODS.map(([label]) => <SelectItem key={label} value={label} title={`One candle per ${PERIOD_NAME[label]}`}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!status && (free || (away && !range)) && <button type="button" className={s.chartReset} onClick={reset} onDoubleClick={event => event.stopPropagation()} title={range?.view ? 'Back to the replay with the price fitted (or double-click the chart)' : 'Back to the latest candles with the price fitted (or double-click the chart)'}><RotateCcw size={13}/>Reset view</button>}
    </div>
  </div>;
}
