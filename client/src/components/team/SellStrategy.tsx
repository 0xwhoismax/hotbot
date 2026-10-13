"use client";
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { ArrowUpRight, DollarSign, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Bag, StrategyRow } from './data';
import { sol } from './format';
import { CoinPill } from './Parts';
import { useCommand, viewedAtom } from './state';
import s from './team.module.css';

/** Uses the page's live bags and the existing strategy-scoped command; selling leaves its running/paused state alone. `round`: a phone's
 *  tab bar shows it as a $ circle beside the sort button, only while there is something to sell. */
export function SellStrategyButton({ strategy, bags, round }: { strategy: StrategyRow; bags: Bag[]; round?: boolean }) {
  const command = useCommand(), viewed = useAtomValue(viewedAtom);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const held = bags.filter(bag => bag.strategyId === strategy.id && bag.stage === 'held');
  const selling = bags.some(bag => bag.strategyId === strategy.id && bag.stage === 'selling');
  if (viewed || strategy.status === 'archiving' || round && !held.length && !selling) return null;
  const sell = async () => {
    if (busy || !held.length) return;
    setBusy(true);
    const done = await command({ type: 'sellAll', strategyId: strategy.id });
    setBusy(false);
    if (done === false) return;
    setOpen(false);
    toast.success(`Sales queued for ${strategy.name}`);
  };
  return <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
    <DialogTrigger asChild>
      {round ? <button type="button" className={`${s.feedIcon} ${s.sellRound}`} disabled={busy || !held.length}>
        {busy || (selling && !held.length) ? <LoaderCircle className="animate-spin"/> : <DollarSign/>}<span className="sr-only">{selling && !held.length ? 'Selling' : 'Sell all'}</span>
      </button> : <Button type="button" size="sm" variant="outline" className={s.sellAllButton} disabled={busy || !held.length}>
        {busy || (selling && !held.length) ? <LoaderCircle className="animate-spin"/> : <ArrowUpRight/>}{selling && !held.length ? 'Selling…' : 'Sell all'}
      </Button>}
    </DialogTrigger>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined} showCloseButton={!busy}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ArrowUpRight size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Sell all in {strategy.name}?</b></DialogTitle><small>{held.length} {held.length === 1 ? 'coin' : 'coins'} at market</small></span></div>
        <dl className={s.walletBreakdown}>
          <div><dt>Holdings</dt><dd>{held.length ? <CoinPill coins={held.map(bag => ({ symbol: bag.token.symbol, logo: bag.token.logoUri, address: bag.token.address }))}/> : 'None left to sell'}</dd></div>
          <div><dt>Current value</dt><dd>{sol(held.reduce((sum, bag) => sum + bag.valueSol, 0), 2)}</dd></div>
          <div><dt>Account</dt><dd>{[...new Set(held.map(bag => bag.mode === 'live' ? 'Real SOL' : 'Practice'))].join(' + ') || '—'}</dd></div>
          <div><dt>After selling</dt><dd>{strategy.status === 'running' ? 'Keeps running · can buy again' : 'Stays paused'}</dd></div>
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
          <Button type="button" variant="secondary" className={s.stopTeam} disabled={busy || !held.length} onClick={() => void sell()}>{busy ? <LoaderCircle className="animate-spin"/> : <ArrowUpRight/>}{busy ? 'Queuing sales…' : 'Sell all'}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
