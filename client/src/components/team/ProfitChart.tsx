"use client";
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useAtom, useAtomValue } from 'jotai';
import { api, useQuery } from '@/lib/convex';
import { profitViewAtom, viewAsAtom } from './state';
import { ProfitCalendar, ProfitViews } from './ProfitCalendar';
import { useTabVisible } from '@/hooks/useTabVisible';
import { Loading, useNow } from './Parts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { curveScale, type CurveResolution } from '../../../../types/home';
import type { HomeData } from './data';
import { pct, signedSol, tone } from './format';
import { time } from './ProfitSpark';
import s from './team.module.css';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Each resolution's bucket and its offset (weeks start on Monday, as the candles do). */
const BUCKETS = { minute: [MINUTE, 0], hour: [HOUR, 0], day: [DAY, 0], week: [7 * DAY, 4 * DAY] } as const;
const RANK: Record<CurveResolution, number> = { minute: 0, hour: 1, day: 2, week: 3 };
const bucketStart = (at: number, resolution: CurveResolution) => { const [size, offset] = BUCKETS[resolution]; return Math.floor((at - offset) / size) * size + offset; };
/** The bucket a chart asks with: the coarsest whose start still leaves the history old enough for that resolution, by team.curve's own rule. It follows
 *  the history's first sample and the clock, never the resolution an answer came back with: a history crossing a window (3 hours, a week, 30 days)
 *  answers coarser from this bucket's start and finer from the coarser one's, and following the answers flipped between the two cached results on
 *  every render. Inside such a window the chart asks with the finer bucket, and the coarser answer runs up to that bucket's start. The curve
 *  reads hour rows, so an hour is the finest bucket. */
const bucketOf = (first: number | null | undefined, now: number, range: number): CurveResolution => first == null ? 'hour'
  : (['week', 'day'] as const).find(resolution => RANK[curveScale(bucketStart(now, resolution) - first, range).resolution] >= RANK[resolution]) ?? 'hour';
const RANGES = [{ label: 'Auto', span: Infinity }, { label: '1H', span: HOUR }, { label: '1D', span: DAY }, { label: '1W', span: 7 * DAY }] as const;
const amount = (value: number) => signedSol(value, 4).replace(' SOL', '');

/** A replay's profit line up to its clock, over the whole story's time and profit range so it grows without rescaling; `value` is the profit at the clock. */
export type ReplayLine = { points: { at: number; pnl: number }[]; from: number; end: number; low: number; high: number; value: number };

type ProfitProps = { data: HomeData; strategyId?: string; actions?: ReactNode; replay?: ReplayLine; variant?: 'full' | 'spark' };

/** The team's or one strategy's profit: the line, or the calendar of realized profit by day, as the switch beside the range pills picks (this device
 *  remembers it). `actions` (a strategy's Replay) belong to the line. A replay draws the line. So do the phone spark and its dialog: a phone has
 *  Home's Calendar tab. */
export function ProfitChart(props: ProfitProps) {
  const [view, setView] = useAtom(profitViewAtom);
  if (props.variant === 'spark' || props.replay) return <ProfitLine {...props}/>;
  const views = <ProfitViews value={view} onChange={setView}/>;
  return view === 'calendar' ? <ProfitCalendar data={props.data} strategyId={props.strategyId} views={views}/> : <ProfitLine {...props} views={views}/>;
}

/** Total profit from recorded marks and fills. Short histories get minutes and a stable scale. `actions` sit at the start of its toolbar, `views` before the range pills.
 *  `replay` draws a replay's line instead, without the range pills; the recorded history stays loaded underneath for when it ends.
 *  `spark` is the line alone, filling its box (phone Home's header); tapping it opens the full chart in a dialog, which reads the same history. */
function ProfitLine({ data, strategyId, actions, views, replay, variant = 'full' }: ProfitProps & { views?: ReactNode }) {
  const [range, setRange] = useState<typeof RANGES[number]>(RANGES[0]), [open, setOpen] = useState(false);
  // The server picks the window and reads only its resolution; a new range keeps the previous chart until its candles arrive.
  // Only closed candles are read: `before` is the current bucket's start (bucketOf), so the chart reloads once a bucket and the live figure is its
  // last point. A hidden tab lets go of the candles and keeps drawing the last chart.
  const visible = useTabVisible(), now = useNow(5_000), [kept, setKept] = useState<FunctionReturnType<typeof api.team.curve>>();
  const before = now ? bucketStart(now, bucketOf(kept?.first, now, range.span)) : 0;
  const as = useAtomValue(viewAsAtom), fetched = useQuery(api.team.curve, visible && before ? { ...as, ...(strategyId ? { strategyId } : {}), ...(range.span !== Infinity ? { range: range.span } : {}), before } : 'skip');
  if (fetched !== undefined && fetched !== kept) setKept(fetched);
  const history = fetched ?? kept;
  const gradient = useId().replace(/:/g, '');

  const strategy = strategyId ? data.strategies.find(row => row.id === strategyId) : undefined;
  const current = replay ? replay.value : strategy ? strategy.realizedPnlSol + strategy.openPnlSol : data.money.realizedPnlSol + data.money.openPnl;
  const view = useMemo(() => {
    if (replay) return { points: replay.points as { at: number; pnl: number | null }[], start: replay.from, end: replay.end, span: replay.end - replay.from, low: replay.low, high: replay.high, fill: [replay.low, replay.high] };
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
    // Profit is recorded each hour; the live figure above the chart is its last point.
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
    const total = data.money.realizedPnlSol + data.money.openPnl, start = data.workspace.paperStartSol;
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
        <ProfitLine data={data}/>
      </DialogContent></Dialog>}
    </>;
  }
  return <div className={s.profitChart}>
    <div className={s.profitToolbar}>
      {actions}
      {views}
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
          <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3, strokeDasharray: '3 4' }} content={<ChartTooltipContent labelFormatter={(_, payload) => new Date(payload[0]?.payload.at ?? 0).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} formatter={value => value == null ? null : <span className={s.profitTooltip}><span>Total profit</span><b>{signedSol(Number(value), 4)}</b></span>}/>}/>
          <Area dataKey="pnl" type="monotone" stroke={color} strokeWidth={2} fill={`url(#${gradient})`} baseValue={view.low} isAnimationActive={false} connectNulls={false} dot={view.points.length === 1 ? { r: 3, strokeWidth: 0, fill: color } : false} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}/>
        </AreaChart>
      </ChartContainer>
    </> : !history ? <Loading variant="box" height="100%" className={s.profitEmpty} label="Loading profit history"/> : <div className={s.profitEmpty}><span>Profit history starts at the next hour</span></div>}
  </div>;
}
