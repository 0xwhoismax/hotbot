"use client";
import { useId, useState } from 'react';
import { ArrowUpRight, Copy, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { REAL_SOL_OPEN, tradesAs } from '../../../../types/team';
import type { HomeData } from './data';
import { useCommand } from './state';
import { signedSol, sol, tone, usd } from './format';
import { SettingRow } from './Parts';
import s from './team.module.css';

/** Shared team balance and money controls, on Account and in the sidebar dialog. The balance is the portfolio shown; Practice and Real SOL
 *  switch what the pages show, and each strategy trades in its own portfolio (`RealSolCopies` copies practice ones to Real SOL). */
export function TeamWallet({ data }: { data: HomeData }) {
  const command = useCommand(), titleId = useId();
  const live = data.workspace.mode === 'live', address = data.workspace.walletAddress;
  async function copyAddress() {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); toast.success('Address copied'); }
    catch { toast.error('Could not copy address'); }
  }
  return <section className={`${s.surface} ${s.accountCard} ${s.teamWallet}`} aria-labelledby={titleId}>
          <div className={s.accountCardHead}>
            <span className={s.accountIcon}><BotAvatar role="coordinator" size={30}/></span>
            <div className={s.grow}><h2 id={titleId}>Team wallet</h2><small>Your bots’ trading budget</small></div>
            <span className={s.pill} data-tone={live ? 'ember' : undefined}>{live ? 'Real SOL' : 'Practice'}</span>
          </div>
          <div className={s.accountBalance}><b>{data.money.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small>SOL</small></b><span>{usd(data.money.equity * data.money.solUsd)} · {live ? 'real money' : 'practice money, real prices'}</span></div>
          {(REAL_SOL_OPEN || live) && <div className={s.accountMode} role="group" aria-label="Account shown">
            <button type="button" aria-pressed={!live} onClick={() => live && command({ type: 'mode', mode: 'paper' })}>Practice</button>
            {REAL_SOL_OPEN && <button type="button" aria-pressed={live} onClick={() => !live && command({ type: 'mode', mode: 'live' })}>Real SOL</button>}
          </div>}
          <dl className={s.walletBreakdown}>
            <div><dt>Ready to trade</dt><dd>{sol(data.money.cash)}</dd></div>
            <div><dt>In coins</dt><dd>{sol(data.money.invested)}</dd></div>
            <div><dt>From closed trades</dt><dd className={s[tone(data.workspace.realizedPnlSol) ?? '']}>{signedSol(data.workspace.realizedPnlSol)}</dd></div>
          </dl>
          {REAL_SOL_OPEN && <RealSolCopies data={data}/>}
          {!live && <ResetPractice data={data}/>}
          {REAL_SOL_OPEN && live && (address ? <button type="button" className={s.walletAddress} title={address} onClick={() => void copyAddress()} aria-label={`Copy team wallet address ${address}`}><code>{address.slice(0, 6)}…{address.slice(-6)}</code><Copy size={14}/></button> : <p className={s.empty}>Creating the team wallet…</p>)}
          {REAL_SOL_OPEN && <p className={s.accountNote}>Each strategy trades in its own account. Switching changes only what you see.</p>}
        </section>;
}

/** Copies practice strategies to Real SOL: each copy trades real SOL with the same rules and budget, and the practice one keeps running beside
 *  it to compare. A practice strategy whose twin already trades Real SOL shows as copied. */
function RealSolCopies({ data }: { data: HomeData }) {
  const command = useCommand(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const active = data.strategies.filter(row => row.status === 'running' || row.status === 'paused'), trading = active.filter(row => row.mode === 'live');
  const copied = new Set(trading.map(row => tradesAs(row))), rows = active.filter(row => row.mode === 'paper');
  const chosen = rows.filter(row => picked.has(row.id)), wallet = data.workspace.liveCashSol;
  const budget = [...trading, ...chosen].reduce((sum, row) => sum + row.rules.allocationSol, 0);
  function show(next: boolean) {
    if (next) setPicked(new Set());
    setOpen(next);
  }
  async function copy() {
    setBusy(true);
    if (await command({ type: 'realSolCopy', strategyIds: chosen.map(row => row.id) }) !== false) { setOpen(false); toast.success(`${chosen.length} ${chosen.length === 1 ? 'copy trades' : 'copies trade'} Real SOL`); }
    setBusy(false);
  }
  return <Dialog open={open} onOpenChange={show}>
    <DialogTrigger asChild><button type="button" className={s.walletReset}><ArrowUpRight size={14}/>{trading.length ? `${trading.length} on Real SOL · copy more` : 'Copy strategies to Real SOL'}</button></DialogTrigger>
    <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ArrowUpRight size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Copy to Real SOL</b></DialogTitle><small>The practice ones keep running beside their copies</small></span></div>
        {rows.length ? <div>{rows.map(row => { const twin = copied.has(tradesAs(row)); return <SettingRow key={row.id} label={row.name} sub={twin ? 'Already on Real SOL' : `${sol(row.rules.allocationSol)} budget${row.status === 'paused' ? ' · paused' : ''}`}
          control={<Switch variant="accent" checked={twin || picked.has(row.id)} disabled={twin} aria-label={`Copy ${row.name} to Real SOL`} onCheckedChange={on => setPicked(set => { const next = new Set(set); if (on) next.add(row.id); else next.delete(row.id); return next; })}/>}/>; })}</div>
          : <p className={s.empty}>No practice strategy to copy.</p>}
        <dl className={s.walletBreakdown}>
          <div><dt>Real SOL budgets</dt><dd>{sol(budget)}</dd></div>
          <div><dt>In the wallet</dt><dd className={budget > wallet + 1e-9 ? s.warnText : undefined}>{sol(wallet)}</dd></div>
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button disabled={busy || !chosen.length} onClick={() => void copy()}>{chosen.length ? `Copy ${chosen.length} to Real SOL` : 'Pick a strategy'}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Starts practice over at the starting balance. Earlier practice coins stay on record but stop counting and trading. */
function ResetPractice({ data }: { data: HomeData }) {
  const command = useCommand(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const start = data.workspace.paperStartSol, coins = data.bags.filter(bag => bag.mode === 'paper').length, profit = data.money.openPnl + data.workspace.realizedPnlSol;
  async function reset() {
    setBusy(true);
    if (await command({ type: 'resetPractice' }) !== false) { setOpen(false); toast.success(`Practice reset to ${sol(start)}`); }
    setBusy(false);
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className={s.walletReset}><RotateCcw size={14}/>Reset practice balance</button></DialogTrigger>
    <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><RotateCcw size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Start practice over?</b></DialogTitle><small>Strategies and Real SOL stay as they are</small></span></div>
        <dl className={s.walletBreakdown}>
          <div><dt>Balance</dt><dd>{sol(data.money.equity)} → {sol(start)}</dd></div>
          <div><dt>Practice coins</dt><dd>{coins ? `${coins} cleared` : 'None held'}</dd></div>
          <div><dt>Profit</dt><dd><span className={s[tone(profit) ?? '']}>{signedSol(profit)}</span> → {signedSol(0)}</dd></div>
        </dl>
        <div className={s.accountActions}>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="secondary" className={s.stopTeam} disabled={busy} onClick={() => void reset()}><RotateCcw/>Reset to {sol(start)}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
