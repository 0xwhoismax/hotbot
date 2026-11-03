"use client";
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile';
import type { HomeData } from './data';
import { pct, signedSol, sol, tone } from './format';
import { viewedAtom } from './state';
import s from './team.module.css';

/** A trade older than FRESH_MS when the app sees it stays in the feed only, so a tab that comes back later does not replay it. */
const FRESH_MS = 60_000, SHOWN_MS = 4_000;

/** The buys and sales that `next` brings and `prev` did not have, oldest first, each with the SOL and profit its event recorded: what every
 *  notice shows, as the feed lists it. Each strategy trades in its own portfolio, so its fills count whichever portfolio is on screen. Only
 *  strategies `prev` had too, so viewing another team brings none. */
export function newFills(prev: HomeData, next: HomeData) {
  const had = new Set(prev.trades.map(fill => fill.id)), known = new Set([...prev.strategies, ...prev.archived].map(row => row.id));
  return next.trades.filter(fill => !had.has(fill.id) && fill.strategyId != null && known.has(fill.strategyId)).reverse();
}

/** TraderBot's buys and sells (`home.trades`), each as one line that drops from the top centre (`.trade-toast` in globals.css): the coin, the
 *  SOL a buy spent or a sale's profit. Each fill shows once while it is fresh, a take-profit's part sale too, as the feed lists it. Only for
 *  the portfolio on screen, only on one's own team and not on phones, where MobileNav's header line announces each fill and a toast would
 *  land on top of it. It reads the home data already loaded, with no read of its own. */
export function TradeToast({ data }: { data: HomeData }) {
  const viewing = Boolean(useAtomValue(viewedAtom)), shownAt = useRef(0);
  const trades = data.trades, mode = data.workspace.mode;
  useEffect(() => {
    // Read at each new fill rather than through useIsMobile, which reports a phone only after its first render.
    if (viewing || window.innerWidth < MOBILE_BREAKPOINT) return;
    // Oldest first, so the newest lands on top; `shownAt` is the time of the newest fill shown.
    for (const trade of [...trades].reverse()) {
      if (trade.at <= shownAt.current || trade.mode !== mode || Date.now() - trade.at > FRESH_MS) continue;
      shownAt.current = trade.at;
      // A sale's profit is on the part it sold: what it brought back against that part's cost.
      const pnl = trade.pnlSol ?? 0, cost = trade.amountSol - pnl, result = trade.kind === 'sold' ? tone(pnl, 3) : undefined;
      const money = result ? `${s.num} ${s[result]}` : s.num;
      toast(<>
        <span className={s.muted}>{trade.kind === 'bought' ? 'Bought' : 'Sold'}</span><b>{trade.symbol}</b>
        {trade.kind === 'bought' ? <span className={money}>{sol(trade.amountSol)}</span> : <><span className={money}>{signedSol(pnl)}</span><span className={money}>{pct(cost > 0 ? pnl / cost * 100 : null)}</span></>}
      </>, { id: 'hotbot-trade:' + trade.id, position: 'top-center', duration: SHOWN_MS, className: 'trade-toast',
        icon: <TokenAvatar className="size-full rounded-full" address={trade.address ?? undefined} symbol={trade.symbol}/> });
    }
  }, [trades, viewing, mode]);
  return null;
}
