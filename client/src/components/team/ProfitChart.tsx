"use client";
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useAtomValue } from 'jotai';
import { api, useQuery } from '@/lib/convex';
import { viewAsAtom } from './state';
import { useTabVisible } from '@/hooks/useTabVisible';
import { Loading, useNow } from './Parts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { curveScale, type CurveResolution } from '../../../../types/home';
import type { HomeData, StrategyRow } from './data';
import { pct, signedSol, tone } from './format';
import s from './team.module.css';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Each resolution's bucket and its offset (weeks start on Monday, as the candles do). */
const BUCKETS = { minute: [MINUTE, 0], hour: [HOUR, 0], day: [DAY, 0], week: [7 * DAY, 4 * DAY] } as const;
const RANK: Record<CurveResolution, number> = { minute: 0, hour: 1, day: 2, week: 3 };
const bucketStart = (at: number, resolution: CurveResolution) => { const [size, offset] = BUCKETS[resolution]; return Math.floor((at - offset) / size) * size + offset; };
/** The bucket a chart asks with: the coarsest whose start still leaves the history old enough for that resolution, by team.curve's own rule. It follows
 *  the history's first sample and the clock, never the resolution an answer came back with: a history crossing a window (3 hours, a week, 30 days)
 *  answers coarser from this bucket's start and finer from the coarser one's, and following the answers flipped between the two cached results on
 *  every render. Inside such a window the chart asks with the finer bucket, and the coarser answer runs up to that bucket's start. */
const bucketOf = (first: number | null | undefined, now: number, range: number): CurveResolution => first == null ? 'minute'
  : (['week', 'day', 'hour'] as const).find(resolution => RANK[curveScale(bucketStart(now, resolution) - first, range).resolution] >= RANK[resolution]) ?? 'minute';
const RANGES = [{ label: 'Auto', span: Infinity }, { label: '1H', span: HOUR }, { label: '1D', span: DAY }, { label: '1W', span: 7 * DAY }] as const;
const amount = (value: number) => signedSol(value, 4).replace(' SOL', '');
const time = (at: number, span: number) => new Date(at).toLocaleString('en-US', span <= DAY ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { month: 'short', day: 'numeric' });

export type ReplayLine = { points: { at: number; pnl: number }[]; from: number; end: number; low: number; high: number; value: number };

export function ProfitChart({ data, strategyId, actions, replay, variant = 'full' }: { data: HomeData; strategyId?: string; actions?: ReactNode; replay?: ReplayLine; variant?: 'full' | 'spark' }) {
  const [range, setRange] = useState<typeof RANGES[number]>(RANGES[0]), [open, setOpen] = useState(false);
  // The server picks the window and reads only its resolution; a new range keeps the previous chart until its candles arrive.
  // Only closed candles are read: `before` is the current bucket's start (bucketOf), so the chart reloads once a bucket and the live figure is its
  // last point. A hidden tab lets go of the candles and keeps drawing the last chart.
  const visible = useTabVisible(), now = useNow(5_000), [kept, setKept] = useState<FunctionReturnType<typeof api.team.curve>>();
  const before = now ? bucketStart(now, bucketOf(kept?.first, now, range.span)) : 0;
  const as = useAtomValue(viewAsAtom), fetched = useQuery(api.team.curve, visible && before ? { ...as, ...(strategyId ? { strategyId } : {}), ...(range.span !== Infinity ? { range: range.span } : {}), before } : 'skip');
  if (fetched !== undefined && fetched !== kept) setKept(fetched);
  const history = fetched ?? kept;
  const beginHistory = useMutation(api.team.beginProfitHistory);
  const [startError, setStartError] = useState(false);
  const gradient = useId().replace(/:/g, '');
  useEffect(() => {
    if (history && history.first == null && !as.as) void beginHistory().catch(() => setStartError(true));
  }, [history, beginHistory, as.as]);

  const strategy = strategyId ? data.strategies.find(row => row.id === strategyId) : undefined;
  const current = replay ? replay.value : strategy ? strategy.realizedPnlSol + strategy.openPnlSol : data.workspace.realizedPnlSol + data.money.openPnl;
  const view = useMemo(() => {
    if (replay) return { points: replay.points, start: replay.from, end: replay.end, span: replay.end - replay.from, low: replay.low, high: replay.high, fill: [replay.low, replay.high] };
    if (!history || history.first == null || history.last == null) return null;
    const { first, span, resolution } = history, last = Math.max(history.last, now);
    const step = { minute: MINUTE, hour: HOUR, day: DAY, week: 7 * DAY }[resolution];
    const start = Math.max(first, last - span);
    const end = start + span;
    const candles = history.candles;
    const points: { at: number; pnl: number | null }[] = [];
    let previous = 0;
    for (const candle of candles) {
      if (previous && candle.firstSampleAt - previous > step * 2) points.push({ at: previous + step, pnl: null });
      if (candle.firstSampleAt >= start) points.push({ at: candle.firstSampleAt, pnl: candle.open });
      if (candle.lastSampleAt > candle.firstSampleAt) points.push({ at: candle.lastSampleAt, pnl: candle.close });
      previous = candle.lastSampleAt;
    }
    // Profit is recorded every 30 seconds; the live figure above the chart is its last point.
    if (now > previous && previous) {
      if (now - previous > step * 2) points.push({ at: previous + step, pnl: null });
      points.push({ at: now, pnl: current });
    }
    const values = points.flatMap(point => point.pnl == null ? [] : [point.pnl]);
    const low = Math.min(...values), high = Math.max(...values);
    // Tiny early fluctuations should not look like a portfolio crash or a vertical moonshot.
    const padding = Math.max(0.005, (high - low) * 0.3);
    // The spark fills its card: the line keeps near the top edge, with room for the area beneath its low.
    const fill = [low - Math.max(0.002, (high - low) * 0.35), high + Math.max(0.001, (high - low) * 0.06)];
    return { points, start, end, span, low: low - padding, high: high + padding, fill };
  }, [history, now, current, replay]);
  const color = current < 0 ? 'var(--destructive)' : 'var(--positive)';
  if (variant === 'spark') {
    const total = data.workspace.realizedPnlSol + data.money.openPnl, start = data.workspace.paperStartSol;
    return <>
      <button type="button" className={s.profitSpark} onClick={() => setOpen(true)} aria-label="Open the profit chart">
        {view && view.points.length > 1 ? <ChartContainer config={{ pnl: { label: 'Total profit', color } }} className={s.profitSparkCanvas}>
          <AreaChart data={view.points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.24}/><stop offset="100%" stopColor={color} stopOpacity={0.04}/></linearGradient></defs>
            <XAxis hide dataKey="at" type="number" domain={['dataMin', 'dataMax']}/>
            <YAxis hide type="number" domain={view.fill}/>
            <Area dataKey="pnl" type="monotone" stroke={color} strokeWidth={1.75} fill={`url(#${gradient})`} baseValue={view.fill[0]} isAnimationActive={false} connectNulls dot={false} activeDot={false}/>
          </AreaChart>
        </ChartContainer> : <i className={s.profitSparkFlat} aria-hidden/>}
      </button>
      {open && <Dialog open onOpenChange={setOpen}><DialogContent className="sm:max-w-[36rem]">
        <DialogTitle className="sr-only">Total profit</DialogTitle>
        <div className={`${s.homeProfitHead} ${s.profitDialogHead}`}><div><h2>Total profit</h2><b className={s[tone(total) ?? 'muted']}>{signedSol(total, 3)}</b></div>{data.workspace.mode === 'paper' && start > 0 && <span className={`${s.homeReturn} ${s[tone(total) ?? 'muted']}`}>{pct(total / start * 100)}<small>all time</small></span>}</div>
        <ProfitChart data={data}/>
      </DialogContent></Dialog>}
    </>;
  }
  return <div className={s.profitChart}>
    <div className={s.profitToolbar}>
      {actions}
      {!replay && <div className={s.profitPeriods} role="group" aria-label="Profit history range">{RANGES.map(item => <Button key={item.label} type="button" size="xs" variant="ghost" aria-label={item.label === 'Auto' ? 'Automatic time range' : `${item.label} profit history`} aria-pressed={range.label === item.label} onClick={() => setRange(item)}>{item.label}</Button>)}</div>}
    </div>
    {view && view.points.length ? <>
      <ChartContainer config={{ pnl: { label: 'Total profit', color } }} className={s.profitCanvas}>
        <AreaChart accessibilityLayer data={view.points} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.16}/><stop offset="100%" stopColor={color} stopOpacity={0.01}/></linearGradient></defs>
          <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="var(--border)" strokeOpacity={0.45}/>
          <XAxis dataKey="at" type="number" domain={[view.start, view.end]} ticks={[view.start, view.start + view.span / 2, view.end]} tickFormatter={at => time(at, view.span)} tickLine={false} axisLine={false} minTickGap={36} tickMargin={10} height={30}/>
          <YAxis type="number" domain={[view.low, view.high]} tickFormatter={amount} tickLine={false} axisLine={false} width={64} tickCount={3} tickMargin={10}/>
          {view.low <= 0 && view.high >= 0 && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.35} strokeDasharray="3 5"/>}
          <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3, strokeDasharray: '3 4' }} content={<ChartTooltipContent labelFormatter={(_, payload) => new Date(payload[0]?.payload.at ?? 0).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} formatter={value => <span className={s.profitTooltip}><span>Total profit</span><b>{signedSol(Number(value), 4)}</b></span>}/>}/>
          <Area dataKey="pnl" type="monotone" stroke={color} strokeWidth={2} fill={`url(#${gradient})`} baseValue={view.low} isAnimationActive={false} connectNulls={false} dot={view.points.length === 1 ? { r: 3, strokeWidth: 0, fill: color } : false} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}/>
        </AreaChart>
      </ChartContainer>
    </> : !startError && !history ? <Loading variant="box" height="100%" className={s.profitEmpty} label="Loading profit history"/> : <div className={s.profitEmpty}><span>{startError ? 'History is temporarily unavailable' : 'Starting your profit history'}</span><small>Tracks realized and unrealized profit from now on.</small></div>}
  </div>;
}

const DAY_STEP = 5 * MINUTE;
/** The portfolio's last 24 hours in percent: total profit now less its recorded value a day ago (`team.profitAt`, a baseline that moves every 5 minutes),
 *  over the balance now less that gain. Profit leaves deposits and withdrawals out and the balance keeps them, so new SOL counts as capital, never as
 *  gain. null before the baseline arrives, without history or without capital. A hidden tab (or `enabled` false) keeps the last baseline. */
export function useDayChange(data: HomeData, enabled = true) {
  const visible = useTabVisible(), now = useNow(60_000), as = useAtomValue(viewAsAtom), [kept, setKept] = useState<{ as?: string; base: number | null }>();
  const at = now ? Math.floor((now - DAY) / DAY_STEP) * DAY_STEP : 0;
  const fetched = useQuery(api.team.profitAt, enabled && visible && at ? { ...as, at } : 'skip');
  if (fetched !== undefined && (fetched !== kept?.base || as.as !== kept?.as)) setKept({ as: as.as, base: fetched });
  // The last baseline bridges a moved bucket, never a switch to another team.
  const base = fetched !== undefined ? fetched : kept && kept.as === as.as ? kept.base : undefined;
  if (base == null) return null;
  const gain = data.workspace.realizedPnlSol + data.money.openPnl - base, capital = data.money.equity - gain;
  return capital > 0 ? gain / capital * 100 : null;
}

/** A strategy's recorded profit line, closed now at its live figure (profit is recorded every 30 seconds), as a path in a 100×40 box whose
 *  highs and lows reach `top` and `bottom`. The line arrives with `team.home`, which stays subscribed across routes and is extended by one
 *  observation per recorded mark, so cards never refetch or rebuild it. */
function useSparkLine(recorded: StrategyRow['spark'], pnl: number, top = 3, bottom = 37) {
  const now = useNow(5_000);
  return useMemo(() => {
    const points = recorded.length && now > recorded.at(-1)!.at ? [...recorded, { at: now, pnl }] : recorded;
    if (!points.length) return null;
    const first = points[0].at, span = points.at(-1)!.at - first;
    const values = points.map(point => point.pnl), low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max(0.005, (high - low) * 0.15), floor = low - padding, ceiling = high + padding;
    const y = (value: number) => top + (1 - (value - floor) / (ceiling - floor)) * (bottom - top);
    const xy = span > 0 ? points.map(point => [(point.at - first) / span * 100, y(point.pnl)]) : [[0, y(values.at(-1)!)], [100, y(values.at(-1)!)]];
    const path = xy.map(([x, height], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${height.toFixed(2)}`).join(' ');
    return { path, first, end: xy.at(-1)!, zero: floor <= 0 && ceiling >= 0 ? y(0) : null, span };
  }, [recorded, now, pnl, top, bottom]);
}
const sparkShade = (pnl: number) => tone(pnl) === 'up' ? 'var(--positive)' : tone(pnl) === 'down' ? 'var(--destructive)' : 'var(--muted-foreground)';

/** A strategy card's profit figure beside its line since the portfolio start. Colour follows the card's live profit. */
export function ProfitSpark({ points: recorded, pnl }: { points: StrategyRow['spark']; pnl: number }) {
  const gradient = useId().replace(/:/g, ''), line = useSparkLine(recorded, pnl), shade = sparkShade(pnl);
  return <span className={s.spark} style={{ ['--spark' as string]: shade }}>
    <span className={s.sparkFigure}><b className={s[tone(pnl) ?? 'muted']}>{signedSol(pnl)}</b><small>{line ? `since ${time(line.first, line.span)}` : 'No history yet'}</small></span>
    <span className={s.sparkPlot}>
      {line ? <>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={shade} stopOpacity={0.2}/><stop offset="100%" stopColor={shade} stopOpacity={0}/></linearGradient></defs>
          <path d={`${line.path} L100 40 L0 40 Z`} fill={`url(#${gradient})`}/>
          <path d={line.path} fill="none" stroke={shade} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
        </svg>
        {line.zero != null && <i className={s.sparkZero} style={{ top: `${line.zero / 40 * 100}%` }}/>}
        <i className={s.sparkNow} style={{ left: `${line.end[0]}%`, top: `${line.end[1] / 40 * 100}%` }}/>
      </> : <i className={s.sparkZero} style={{ top: '50%' }}/>}
    </span>
  </span>;
}

/** The same line filling the bottom of a compact strategy tile, edge to edge, behind its figures. */
export function SparkBackdrop({ points, pnl }: { points: StrategyRow['spark']; pnl: number }) {
  const gradient = useId().replace(/:/g, ''), line = useSparkLine(points, pnl, 14, 38), shade = sparkShade(pnl);
  if (!line) return null;
  return <svg className={s.sparkBackdrop} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={shade} stopOpacity={0.18}/><stop offset="100%" stopColor={shade} stopOpacity={0}/></linearGradient></defs>
    <path d={`${line.path} L100 40 L0 40 Z`} fill={`url(#${gradient})`}/>
    <path d={line.path} fill="none" stroke={shade} strokeOpacity={0.55} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}
