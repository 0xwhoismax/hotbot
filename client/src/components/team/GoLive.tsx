"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAtomValue, useSetAtom } from 'jotai';
import { ArrowUpRight, Check, ChevronRight, FileText, LoaderCircle, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { LEGAL } from '../../../../types/legal';
import type { HomeData } from './data';
import { legalAskAtom, useCommand, viewedAtom } from './state';
import { appHref, sol } from './format';
import { RealSolAccept } from './LegalDialog';
import { Deposit, RealSolCopies, RecoveryStep, TeamWalletDialog } from './TeamWallet';
import s from './team.module.css';

/** Paper / Real switches the shown account; the selected Real button opens the shared team wallet. */
export function ModeSwitch({ data }: { data: HomeData }) {
  const command = useCommand(), live = data.workspace.mode === 'live';
  return <div className={s.accountMode} data-compact role="group" aria-label="Account shown">
    <button type="button" aria-pressed={!live} onClick={() => live && command({ type: 'mode', mode: 'paper' })}><FileText size={14} aria-hidden/>Paper</button>
    {live ? <TeamWalletDialog data={data} modeSwitch={false}><button type="button" data-mode="live" aria-pressed aria-label="Real · Open wallet"><Wallet size={14} aria-hidden/>Real</button></TeamWalletDialog> : <GoLiveDialog data={data}/>}
  </div>;
}

export function RealSolTermsButton({ data }: { data: HomeData }) {
  const ask = useSetAtom(legalAskAtom), viewed = useAtomValue(viewedAtom);
  const holds = Boolean(data.workspace.wallet) || data.strategies.some(row => row.mode === 'live');
  if (viewed || data.workspace.realSolTermsCurrent || !holds) return null;
  return <Button variant="ember" onClick={() => ask('realSol')}><ShieldCheck aria-hidden/>Review terms</Button>;
}

/** Wallet setup remains beside the balance once the team's Real terms are accepted. */
export function GoLiveEntry({ data }: { data: HomeData }) {
  const { mode, realSolTermsCurrent: accepted, wallet } = data.workspace;
  if (mode !== 'live' || !accepted || wallet) return null;
  return <div className={s.goLiveStep}><WalletSetup asked/></div>;
}

/** The wallet as `prepareLive` makes it: Setting up while it is on its way, Retry once the ask failed or it is slow. `asked`: an ask already
 *  went (a Real SOL copy makes the wallet too). */
function useWalletSetup(asked: boolean) {
  const command = useCommand(), [setup, setSetup] = useState<'idle' | 'asked' | 'slow' | 'failed'>(asked ? 'asked' : 'idle');
  async function prepare() {
    setSetup('asked');
    if (await command({ type: 'prepareLive' }) === false) setSetup('failed');
  }
  useEffect(() => {
    if (setup !== 'asked') return;
    const timer = setTimeout(() => setSetup('slow'), SETUP_WAIT_MS);
    return () => clearTimeout(timer);
  }, [setup]);
  return { setup, prepare };
}

/** The wallet step's head: Setting up, or Retry. */
function WalletSetup({ number, asked = false, setup: given }: { number?: number; asked?: boolean; setup?: ReturnType<typeof useWalletSetup> }) {
  const own = useWalletSetup(asked), { setup, prepare } = given ?? own;
  return <div className={s.goLiveStepHead}>{number !== undefined && <span className={s.goLiveNum}>{number}</span>}<b>Your HOTBOT wallet</b>
    {setup === 'failed' || setup === 'slow'
      ? <Button size="sm" variant="secondary" className={s.goLiveRetry} onClick={() => void prepare()}><RotateCcw/>{setup === 'failed' ? 'Failed · Retry' : 'Retry'}</Button>
      : <span className={s.pill} data-tone="warn"><LoaderCircle size={11} className="animate-spin"/>Setting up</span>}
  </div>;
}

/** Which of the wallet's steps (TeamWallet.tsx slots) report done; undefined until a slot has reported. */
type StepsDone = { recovery?: boolean; deposit?: boolean };
/** How long the wallet may take to appear before the step offers Retry. */
const SETUP_WAIT_MS = 30_000;

/** Real SOL in order: recover, accept, then the wallet's steps (wallet, fund, strategies) and Go live. Recovery and Accept each fill the dialog
 *  alone until done; the wallet is made only after Accept. The wallet's steps are numbered, a done one ticked and the first not done one marked
 *  current; the wallet's own steps are slots that say when they are done. */
function GoLiveDialog({ data }: { data: HomeData }) {
  const command = useCommand(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState<StepsDone>({});
  const walletSetup = useWalletSetup(false), { prepare } = walletSetup;
  const report = useMemo(() => {
    const step = (name: keyof StepsDone) => (value: boolean) => setDone(now => now[name] === value ? now : { ...now, [name]: value });
    return { recovery: step('recovery'), deposit: step('deposit') };
  }, []);
  // Activation itself spends part of the first deposit (the trading key's fee float, the wallet's rent), so an active wallet is ready whatever is left.
  const accepted = data.workspace.realSolTermsCurrent, wallet = data.workspace.wallet, balance = wallet?.balanceSol ?? 0, ready = Boolean(wallet?.active);
  // Choosing to go live, once the terms are accepted, is what creates the wallet (`prepare`); the worker then watches it for the first deposit.
  async function goLive() {
    setBusy(true);
    if (await command({ type: 'mode', mode: 'live' }) !== false) { setOpen(false); toast.success('You’re live with real SOL'); }
    setBusy(false);
  }
  // Real SOL copies (`RealSolCopies`) are the strategies that trade the wallet; the practice ones keep running beside them.
  const running = data.strategies.filter(row => row.status === 'running' && row.mode === 'live');
  // Before the first SOL arrives the Deposit slot shows the amount to send and the wait, so the step's head says nothing until then.
  const status = ready ? `${sol(balance)} ready` : `Received ${sol(balance)} · activating`;
  // The recovery slot shows only once it reported that it is not done.
  const blocked = done.recovery === false, setupShown = !blocked && accepted;
  const stepsDone = { wallet: Boolean(wallet), fund: ready, strategies: running.length > 0 };
  const order = (Object.keys(stepsDone) as (keyof typeof stepsDone)[]).filter(step => step !== 'wallet' || !wallet), current = order.find(step => !stepsDone[step]);
  const stepState = (step: keyof typeof stepsDone) => stepsDone[step] ? 'done' : step === current ? 'current' : 'next';
  const badge = (step: keyof typeof stepsDone) => <span className={s.goLiveNum}>{stepsDone[step] ? <Check size={13}/> : order.indexOf(step) + 1}</span>;
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (next && accepted && !blocked && (!wallet || !data.workspace.wantLive)) void prepare(); }}>
    <DialogTrigger asChild><button type="button" data-mode="live" aria-pressed={false}><Wallet size={14} aria-hidden/>Real</button></DialogTrigger>
    <DialogContent className="sm:max-w-[30rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><BotAvatar role="coordinator" size={28}/></span><span className={s.grow}><DialogTitle asChild><b>Go live with real SOL</b></DialogTitle>
          <span className={s.legalHeadPills}><span className={s.pill} data-tone="warn">Beta v{LEGAL.realSol.version}</span></span></span></div>
        <div className={s.goLiveStep} hidden={!blocked}>
          <div className={s.goLiveStepHead}><b>Add an email</b></div>
          <RecoveryStep data={data} onDone={report.recovery}/>
        </div>
        {!blocked && !accepted && <RealSolAccept data={data} onLater={() => setOpen(false)} onDone={() => void prepare()}/>}
        {setupShown && <>
          {!wallet && <div className={s.goLiveStep} data-step="current"><WalletSetup number={1} setup={walletSetup}/></div>}
          <div className={s.goLiveStep} data-step={stepState('fund')}>
            <div className={s.goLiveStepHead}>{badge('fund')}<b>Fund your wallet</b>{balance > 0 && <span className={s.pill} data-tone={ready ? 'ember' : 'warn'}>{!ready && <LoaderCircle size={11} className="animate-spin"/>}{status}</span>}</div>
            {wallet && <Deposit data={data} onDone={report.deposit}/>}
          </div>
          <div className={s.goLiveStep} data-step={stepState('strategies')}>
            <div className={s.goLiveStepHead}>{badge('strategies')}<b>Strategies trade it</b></div>
            {running.length ? <div className={s.goLiveStrategies}>{running.map(row => <Link key={row.id} href={appHref('strategies', row.id)} onClick={() => setOpen(false)} className={s.goLiveStrategy}>
              <span className={s.grow}><b>{row.name}</b><small>Up to {sol(row.rules.amountSol)} a coin · {row.rules.maxOpenPositions} at once</small></span>
              {ready && row.rules.amountSol + 0.01 > balance && <span className={s.pill} data-tone="warn">Over wallet</span>}
              <ChevronRight size={14}/>
            </Link>)}</div> : stepState('strategies') === 'current' && <RealSolCopies data={data} pill/>}
          </div>
          <div className={s.accountActions}>
            <DialogClose asChild><Button variant="secondary">Not now</Button></DialogClose>
            <Button disabled={!ready || busy} onClick={() => void goLive()}>{busy ? <LoaderCircle className="animate-spin"/> : <ArrowUpRight/>}Go live</Button>
          </div>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
