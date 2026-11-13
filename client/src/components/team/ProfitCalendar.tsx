"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { CalendarDays, ChartSpline, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { api, convex } from '@/lib/convex';
import { currentUserIdAtom } from '@/store/user/atoms';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/utils/formatterUtils';
import { useNow } from './Parts';
import { viewAsAtom, type ProfitView } from './state';
import type { HomeData } from './data';
import { signedUsd, tone } from './format';
import s from './team.module.css';

/** The profit card's switch between the line and the calendar. */
export function ProfitViews({ value, onChange }: { value: ProfitView; onChange: (view: ProfitView) => void }) {
  return <div className={`${s.profitPeriods} ${s.profitViews}`} role="group" aria-label="Profit view">
    <Button type="button" size="xs" variant="ghost" aria-label="Profit chart" aria-pressed={value === 'chart'} onClick={() => onChange('chart')}><ChartSpline className="size-3.5"/></Button>
    <Button type="button" size="xs" variant="ghost" aria-label="Profit calendar" aria-pressed={value === 'calendar'} onClick={() => onChange('calendar')}><CalendarDays className="size-3.5"/></Button>
  </div>;
}

type Read = FunctionReturnType<typeof api.team.profitDays>;
/** Month reads kept for the session by account, scope and month: a past day never changes, so another view, tab or page reads nothing again. A failed
 *  read leaves the map, so a retry reads again. */
const reads = new Map<string, Promise<Read>>();
function readMonth(key: string, args: FunctionArgs<typeof api.team.profitDays>) {
  let read = reads.get(key);
  if (!read && convex) {
    read = convex.query(api.team.profitDays, args);
    reads.set(key, read);
    read.catch(() => reads.delete(key));
  }
  return read;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Sums of the same sales in another order differ in their last bits, so a smaller move of the running total is no sale. */
const FLAT_SOL = 1e-9;
/** `count` local day starts from `day`, then the start after the last one. */
const startsFrom = (day: Date, count: number) => Array.from({ length: count + 1 }, (_, index) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + index).getTime());
const dayOf = (at: number) => { const day = new Date(at); return new Date(day.getFullYear(), day.getMonth(), day.getDate()); };
const monthOf = (at: number) => { const day = new Date(at); return new Date(day.getFullYear(), day.getMonth(), 1).getTime(); };
/** A day's figure in its cell: whole dollars from $10, thousands as K, cents below $10. A figure that shows as $0 has no sign. */
const short = (value: number) => {
  const size = Math.abs(value), text = formatNumber(value, { compact: true, prefix: '$', precision: size >= 10_000 || (size >= 10 && size < 1000) ? 0 : size >= 1000 ? 1 : 2 });
  return (value > 0 && /[1-9]/.test(text) ? '+' : '') + text;
};

/** Realized profit by local day for one month, the team's (the portfolio shown) or one strategy's, in USD at the live SOL price. A month is read once
 *  (`team.profitDays`: the running realized total at each day start up to today's) and kept for the session. Today runs from its start to the board's
 *  realized total now, which every sale moves, so a sale reads nothing. A day whose total did not move stays empty. `views` sit before the month. */
export function ProfitCalendar({ data, strategyId, views }: { data: HomeData; strategyId?: string; views?: ReactNode }) {
  const now = useNow(60_000), account = useAtomValue(currentUserIdAtom), as = useAtomValue(viewAsAtom), [back, setBack] = useState(0), [attempt, setAttempt] = useState(0);
  const strategy = strategyId ? data.strategies.find(row => row.id === strategyId) : undefined;
  const today = now ? dayOf(now) : null, todayAt = today?.getTime() ?? 0, month = today ? new Date(today.getFullYear(), today.getMonth() - back, 1) : null;
  const start = month?.getTime() ?? 0, size = month ? new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() : 0;
  // What a month's read depends on: the account, who it views, the portfolio and its start (a practice reset), the hidden archived losses and the
  // strategy. The current month is read up to today's start, so again each day.
  const mode = strategy?.mode ?? data.workspace.mode, since = mode === 'paper' ? data.workspace.paperResetAt ?? 0 : 0;
  const hidden = strategyId ? '' : data.archived.flatMap(row => row.hidden ? [row.id] : []).join(',');
  const scope = [account ?? '', as.as ?? '', mode, since, hidden, strategyId ?? '', start].join('|');
  const key = `${scope}|${back === 0 ? todayAt : ''}`, [shown, setShown] = useState<{ key: string; scope: string; read?: Read; failed?: true }>();
  const starts = month ? startsFrom(month, size) : [];

  useEffect(() => {
    if (!start) return;
    let live = true;
    const all = startsFrom(new Date(start), size), days = back === 0 ? all.filter(at => at <= todayAt) : all;
    readMonth(key, { ...as, ...(strategyId ? { strategyId } : {}), days })
      ?.then(read => live && setShown({ key, scope, read }), () => live && setShown({ key, scope, failed: true }));
    return () => { live = false; };
  }, [as, attempt, back, key, scope, size, start, strategyId, todayAt]);

  // A new day keeps the month's figures while it is read again.
  const read = shown?.scope === scope ? shown.read : undefined, failed = shown?.key === key && shown.failed, loading = !failed && shown?.key !== key;
  const realizedNow = strategy?.realizedPnlSol ?? data.money.realizedPnlSol, solUsd = data.money.solUsd;
  // A day is its end's running total less its start's. The last day read ends at the board's total now: today, or yesterday while a new day's read
  // runs, so the month's total holds.
  const days = starts.slice(0, -1).map((at, index) => {
    const from = read?.realized[index];
    if (!read || from == null || at > todayAt) return null;
    const to = index + 1 < read.realized.length && at < todayAt ? read.realized[index + 1] : realizedNow;
    return Math.abs(to - from) < FLAT_SOL ? null : to - from;
  });
  const traded = days.filter((day): day is number => day != null), peak = Math.max(0, ...traded.map(Math.abs));
  const total = read && traded.length ? traded.reduce((sum, day) => sum + day, 0) * solUsd : null;
  const label = month?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) ?? '';
  const first = read?.first ?? null, lead = month ? (month.getDay() + 6) % 7 : 0;
  const cells = Array.from({ length: Math.ceil((lead + size) / 7) * 7 }, (_, index) => index - lead);
  const weeks = Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));

  return <div className={s.profitCalendar} aria-busy={loading}>
    <div className={s.calendarHead}>
      {failed ? <span className={s.calendarTotal} role="alert"><small>Couldn’t load</small><Button type="button" size="icon-xs" variant="ghost" aria-label="Try again" onClick={() => setAttempt(attempt + 1)}><RotateCcw/></Button></span>
        : <span className={s.calendarTotal}><span className="sr-only">{label} total: </span>{total == null ? <small>{read ? 'No sales' : '—'}</small> : <b className={s[tone(total) ?? 'muted']}>{signedUsd(total)}</b>}</span>}
      {views}
      <div className={`${s.profitPeriods} ${s.calendarMonth}`} role="group" aria-label="Month">
        <Button type="button" size="xs" variant="ghost" aria-label="Previous month" disabled={first == null || start <= monthOf(first)} onClick={() => setBack(back + 1)}><ChevronLeft className="size-3.5"/></Button>
        <h3 aria-live="polite">{label}</h3>
        <Button type="button" size="xs" variant="ghost" aria-label="Next month" disabled={back === 0} onClick={() => setBack(back - 1)}><ChevronRight className="size-3.5"/></Button>
      </div>
    </div>
    <table className={s.calendarGrid} aria-label={`Profit by day, ${label}`}>
      <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
      <tbody>{weeks.map((week, row) => <tr key={row}>{week.map(index => {
        if (!month || index < 0 || index >= size) return <td key={index}/>;
        const pnl = days[index], at = starts[index], value = pnl == null ? null : pnl * solUsd;
        const name = new Date(at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }), full = value == null ? null : signedUsd(value);
        return <td key={index}>
          <div className={s.calendarDay} data-tone={value == null ? undefined : tone(value, 2) ?? 'flat'} data-today={at === todayAt || undefined} data-later={at > todayAt || undefined}
            style={pnl == null ? undefined : { ['--heat' as string]: peak > 0 ? Math.abs(pnl) / peak : 0 }} title={full ?? undefined}>
            <span aria-hidden>{index + 1}</span>
            {value != null && <b aria-hidden>{short(value)}</b>}
            <span className="sr-only">{full ? `${name}: ${full}` : name}</span>
          </div>
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
