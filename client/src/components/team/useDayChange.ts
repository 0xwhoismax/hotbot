"use client";
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { api, useQuery } from '@/lib/convex';
import { useTabVisible } from '@/hooks/useTabVisible';
import type { HomeData } from './data';
import { useNow } from './Parts';
import { viewAsAtom } from './state';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE, DAY_STEP = 5 * MINUTE;
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
  const gain = data.money.realizedPnlSol + data.money.openPnl - base, capital = data.money.equity - gain;
  return capital > 0 ? gain / capital * 100 : null;
}
