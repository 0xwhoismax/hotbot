"use client";
import { useId, useMemo } from 'react';
import type { StrategyRow } from './data';
import { signedSol, tone } from './format';
import { useNow } from './Parts';
import s from './team.module.css';

const DAY = 86_400_000;
/** A profit line's time label: the clock within a day, the date beyond. */
export const time = (at: number, span: number) => new Date(at).toLocaleString('en-US', span <= DAY ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { month: 'short', day: 'numeric' });

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
