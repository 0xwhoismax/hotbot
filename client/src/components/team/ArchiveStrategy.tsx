"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ChevronRight, LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { HomeData, StrategyRow } from './data';
import { ago, appHref, signedSol, sol, tone } from './format';
import { CoinPill } from './Parts';
import { useCommand } from './state';
import s from './team.module.css';

type Archived = HomeData['archived'][number];
const coins = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;
const archivedAgo = (at: number | null) => at == null ? 'Archived' : ago(at) === 'now' ? 'Archived just now' : `Archived ${ago(at)} ago`;

/** Archive from the strategy's page. It leaves every list and its profit stays in the totals; coins it still holds sell first, and it is archived when the last one fills.
 *  A strategy that never bought can be deleted for good instead. While it sells, the same place offers to keep it. `block` is the full-width button that closes Settings on phones. */
export function ArchiveStrategyButton({ data, strategy, block = false }: { data: HomeData; strategy: StrategyRow; block?: boolean }) {
  const command = useCommand(), [open, setOpen] = useState<'archive' | 'delete' | null>(null), [busy, setBusy] = useState(false);
  const size = block ? 'default' as const : 'sm' as const, width = block ? 'w-full' : undefined;
  if (strategy.status === 'archiving') return <Button size={size} variant="outline" className={width} disabled={busy} onClick={async () => { setBusy(true); if (await command({ type: 'restore', strategyId: strategy.id }) !== false) toast.success(`${strategy.name} stays, paused`); setBusy(false); }}>{busy ? <LoaderCircle className="animate-spin"/> : <ArchiveRestore/>}Keep strategy</Button>;
  return <>
    <Button size={size} variant={block ? 'outline' : 'ghost'} className={width} onClick={() => setOpen('archive')}><Archive/>{block ? 'Archive strategy' : 'Archive'}</Button>
    <Dialog open={open === 'archive'} onOpenChange={next => { if (!next) setOpen(null); }}>
      <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
        {open === 'archive' && <ArchiveBody data={data} strategy={strategy} onDelete={() => setOpen('delete')} onDone={() => setOpen(null)}/>}
      </DialogContent>
    </Dialog>
    <DeleteStrategyDialog strategy={open === 'delete' ? strategy : null} onClose={() => setOpen(null)}/>
  </>;
}

function ArchiveBody({ data, strategy, onDelete, onDone }: { data: HomeData; strategy: StrategyRow; onDelete: () => void; onDone: () => void }) {
  const command = useCommand(), router = useRouter(), [busy, setBusy] = useState(false);
  const bags = data.bags.filter(bag => bag.strategyId === strategy.id), value = bags.reduce((sum, bag) => sum + bag.valueSol, 0), profit = strategy.realizedPnlSol + strategy.openPnlSol;
  const archive = async () => {
    setBusy(true);
    const done = await command({ type: 'archive', strategyId: strategy.id, ...(bags.length ? { sell: true } : {}) });
    setBusy(false);
    if (done === false) return;
    onDone();
    if (bags.length) toast.success(`Selling ${coins(bags.length)}, then ${strategy.name} is archived`);
    else { toast.success(`${strategy.name} archived`); router.push(appHref('strategies')); }
  };
  return <div className={s.decision}>
    <div className={s.decisionHead}><span className={s.accountIcon}><Archive size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Archive {strategy.name}?</b></DialogTitle><small>It leaves Home, Strategies and activity</small></span></div>
    <dl className={s.walletBreakdown}>
      <div><dt>Coins held</dt><dd>{bags.length ? <CoinPill coins={bags.map(bag => ({ symbol: bag.token.symbol, logo: bag.token.logoUri, address: bag.token.address }))} note={`${sol(value, 2)} · sold first`}/> : 'None'}</dd></div>
      <div><dt>Profit</dt><dd><span className={s[tone(profit) ?? 'muted']}>{signedSol(profit)}</span> stays in your totals</dd></div>
      <div><dt>Restore</dt><dd>Anytime, from Strategies</dd></div>
    </dl>
    <div className={s.accountActions}>
      <DialogClose asChild><Button variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
      <Button disabled={busy} onClick={() => void archive()}>{busy ? <LoaderCircle className="animate-spin"/> : <Archive/>}{bags.length ? `Sell ${coins(bags.length)} and archive` : 'Archive'}</Button>
    </div>
    {!strategy.traded && <button type="button" className={`${s.walletReset} ${s.deleteLink}`} disabled={busy} onClick={onDelete}><Trash2 size={14}/>Never bought a coin? Delete it for good</button>}
  </div>;
}

/** Deleting is only for a strategy that never bought: no trade or profit is lost, and its checked coins and activity go with it. */
function DeleteStrategyDialog({ strategy, onClose }: { strategy: { id: string; name: string } | null; onClose: () => void }) {
  const command = useCommand(), router = useRouter(), [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!strategy) return;
    setBusy(true);
    const done = await command({ type: 'delete', strategyId: strategy.id });
    setBusy(false);
    if (done === false) return;
    onClose();
    toast.success(`${strategy.name} deleted`);
    router.push(appHref('strategies'));
  };
  return <Dialog open={Boolean(strategy)} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      {strategy && <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><Trash2 size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Delete {strategy.name} for good?</b></DialogTitle><small>It never bought a coin, so no profit is lost</small></span></div>
        <dl className={s.walletBreakdown}>
          <div><dt>Trades</dt><dd>None</dd></div>
          <div><dt>Checked coins and activity</dt><dd>Removed</dd></div>
          <div><dt>Undo</dt><dd>Not possible</dd></div>
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
          <Button variant="secondary" className={s.stopTeam} disabled={busy} onClick={() => void remove()}>{busy ? <LoaderCircle className="animate-spin"/> : <Trash2/>}Delete for good</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}

/** The Strategies page's archive: collapsed by default, newest first, each with what it made, Restore, and Delete when it never traded. */
export function ArchivedStrategies({ rows }: { rows: Archived[] }) {
  const [deleting, setDeleting] = useState<Archived | null>(null);
  return <Collapsible className={s.exact}>
    <CollapsibleTrigger><ChevronRight/>Archived<small>{rows.length}</small></CollapsibleTrigger>
    <CollapsibleContent>
      <div className={`${s.surface} ${s.archivedList}`}>{rows.map(row => <ArchivedRow key={row.id} row={row} onDelete={() => setDeleting(row)}/>)}</div>
    </CollapsibleContent>
    <DeleteStrategyDialog strategy={deleting} onClose={() => setDeleting(null)}/>
  </Collapsible>;
}

function ArchivedRow({ row, onDelete }: { row: Archived; onDelete: () => void }) {
  const command = useCommand(), [busy, setBusy] = useState(false);
  const restore = async () => { setBusy(true); if (await command({ type: 'restore', strategyId: row.id }) !== false) toast.success(`${row.name} is back, paused`); setBusy(false); };
  return <div className={s.row}>
    <span className={s.archivedIcon}><Archive size={15}/></span>
    <span className={s.grow}><b>{row.name}</b><small>{archivedAgo(row.archivedAt)}</small></span>
    <span className={s.end}><b className={s[tone(row.realizedPnlSol) ?? 'muted']}>{signedSol(row.realizedPnlSol)}</b><small className={s.muted}>{row.hidden ? 'hidden from totals' : row.traded ? 'in your totals' : 'never traded'}</small></span>
    <span className={s.archivedButtons}>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void restore()}>{busy ? <LoaderCircle className="animate-spin"/> : <ArchiveRestore/>}Restore</Button>
      {!row.traded && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${row.name} for good`} title="Delete for good" onClick={onDelete}><Trash2/></Button>}
    </span>
  </div>;
}

/** A strategy page opened after it was archived: what it kept, and the way back. */
export function ArchivedNotice({ row }: { row: Archived }) {
  const command = useCommand(), [busy, setBusy] = useState(false);
  return <section className={`${s.surface} ${s.archivedNotice}`} aria-label="Archived strategy">
    <span className={s.accountIcon}><Archive size={18}/></span>
    <span className={s.grow}><b>{row.name} is archived</b><small>{archivedAgo(row.archivedAt)} · <span className={s[tone(row.realizedPnlSol) ?? 'muted']}>{signedSol(row.realizedPnlSol)}</span> {row.hidden ? 'hidden from' : 'in'} your totals</small></span>
    <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await command({ type: 'restore', strategyId: row.id }); setBusy(false); }}>{busy ? <LoaderCircle className="animate-spin"/> : <ArchiveRestore/>}Restore</Button>
  </section>;
}
