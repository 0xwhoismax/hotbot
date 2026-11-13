"use client";
import { useState, type CSSProperties } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { ArrowUpRight, Check, ChevronDown, LoaderCircle, LogOut, ShieldAlert } from 'lucide-react';
import type { Wallet } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { LegalMascot } from '@/components/legal/LegalMascot';
import { api } from '@/lib/convex';
import { solanaWallets } from '@/lib/solanaWallets';
import { signText } from '@/lib/walletSign';
import { useCountry } from '@/hooks/useTokenBuy';
import { currentUserIdAtom, userStateAtom } from '@/store/user/atoms';
import { LEGAL, REAL_SOL, TERMS, TERMS_DECLARES, legalHash, realSolMessage, type LegalKind } from '../../../../types/legal';
import type { HomeData } from './data';
import { useHome } from './useHome';
import { failToast, legalAskAtom, logoutAtom, useSession } from './state';
import s from './team.module.css';
import o from './onboarding.module.css';

/** Each declaration as a row the person ticks; `ticked` holds their indexes. */
function Declares({ lines, ticked, onTick }: { lines: readonly string[]; ticked: ReadonlySet<number>; onTick: (next: ReadonlySet<number>) => void }) {
  return <div className={s.legalDeclares} role="group" aria-label="Declarations">{lines.map((text, index) => {
    const on = ticked.has(index);
    return <button key={text} type="button" role="checkbox" aria-checked={on} className={s.legalDeclare}
      onClick={() => { const next = new Set(ticked); if (on) next.delete(index); else next.add(index); onTick(next); }}>
      <span className={s.legalTick} aria-hidden>{on && <Check size={13}/>}</span>{text}
    </button>;
  })}</div>;
}

const Links = () => <p className={s.legalLinks}>
  <a href="/terms" target="_blank" rel="noreferrer">Terms<ArrowUpRight size={12}/></a>
  <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy<ArrowUpRight size={12}/></a>
</p>;

/** The Terms and the Privacy policy, accepted once per version. `onDecline` adds a Decline button and `onLater` a Not now button. */
export function TermsAccept({ onLater, onDecline, onDone }: { onLater?: () => void; onDecline?: () => void; onDone?: () => void }) {
  const accept = useMutation(api.legal.accept), [ticked, setTicked] = useState<ReadonlySet<number>>(new Set()), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await accept({ kind: 'terms', version: LEGAL.terms.version }); onDone?.(); } catch (cause) { failToast(cause, { call: 'legal.accept' }); } finally { setBusy(false); }
  };
  return <>
    {onDecline && <p className={s.legalWarning} role="alert"><LogOut aria-hidden/>If you decline, you’ll be signed out. You can sign in again any time to accept.</p>}
    <p className={s.legalIntro}>{TERMS.short}</p>
    <Links/>
    <Declares lines={TERMS_DECLARES} ticked={ticked} onTick={setTicked}/>
    <div className={s.accountActions}>
      {onDecline && <Button variant="secondary" disabled={busy} onClick={onDecline}>Decline</Button>}
      {onLater && <Button variant="secondary" onClick={onLater}>Not now</Button>}
      <Button variant="secondary" tone={ticked.size === TERMS_DECLARES.length ? 'positive' : undefined} data-state={ticked.size === TERMS_DECLARES.length ? 'set' : undefined} className={ticked.size === TERMS_DECLARES.length ? 'text-[var(--positive)]' : undefined} disabled={ticked.size < TERMS_DECLARES.length || busy} onClick={() => void go()}>{busy ? <LoaderCircle className="animate-spin"/> : <Check/>}Accept</Button>
    </div>
  </>;
}

function useRecoveryWallet(data: HomeData) {
  const methods = useAtomValue(userStateAtom).profileData?.methods ?? [], recovery = data.workspace.wallet?.recovery;
  return recovery ? recovery.type === 'wallet' ? recovery.address : null : methods.find(method => method.provider === 'solana')?.id ?? null;
}

/** Go live's Accept step and the "Accept the new terms" dialog: the Real SOL notice, read once it is opened, and
 *  one Accept, green once it is read, signed by the recovery wallet where it is on this device, else a click. Pressing it is the
 *  declaration (`REAL_SOL.declares`). `onLater` adds a Not now button; `onDone` runs once Convex has it. */
export function RealSolAccept({ data, onLater, onDone }: { data: HomeData; onLater?: () => void; onDone?: () => void }) {
  const accept = useMutation(api.legal.accept), country = useCountry(), recovery = useRecoveryWallet(data), userId = useAtomValue(currentUserIdAtom);
  const [busy, setBusy] = useState<string | null>(null), [signFailed, setSignFailed] = useState(false);
  const [opened, setOpened] = useState(false), [read, setRead] = useState(false);
  const wallets = recovery ? solanaWallets() : [], ready = !busy && Boolean(country) && read;
  const key = { variant: 'secondary', tone: ready ? 'positive' : undefined, 'data-state': ready ? 'set' : undefined, disabled: !ready, className: ready ? 'text-[var(--positive)]' : undefined } as const;
  const send = async (signed?: { nonce: string; at: string; signature: string }) => {
    await accept({ kind: 'realSol', version: LEGAL.realSol.version, ...(country?.code ? { country: country.code } : {}), ...(signed ? { signed } : {}) });
    onDone?.();
  };
  const click = async () => {
    setBusy('click');
    try { await send(); } catch (cause) { failToast(cause, { call: 'legal.accept' }); } finally { setBusy(null); }
  };
  const sign = async (wallet: Wallet) => {
    if (!recovery || !userId) return;
    setBusy(wallet.name);
    try {
      const { accounts } = await (wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect]).connect();
      const account = accounts.find(item => item.address === recovery);
      if (!account) throw new Error(`Switch ${wallet.name} to ${recovery.slice(0, 4)}…${recovery.slice(-4)}, the wallet that recovers your HOTBOT wallet.`);
      const signed = { nonce: crypto.randomUUID(), at: new Date().toISOString() };
      const message = realSolMessage({ userId, recovery, version: LEGAL.realSol.version, hash: await legalHash(LEGAL.realSol.text), ...signed });
      await send({ ...signed, signature: await signText(wallet, account, message) });
    } catch (cause) { setSignFailed(true); failToast(cause, { call: 'legal.accept' }); } finally { setBusy(null); }
  };
  const termsDue = useAtomValue(userStateAtom).profileData?.accepted.terms?.version !== LEGAL.terms.version;
  if (termsDue) return <TermsAccept onLater={onLater}/>;
  return <>
    <Collapsible open={opened} onOpenChange={next => { setOpened(next); if (next) setRead(true); }}>
      <CollapsibleTrigger className={`${o.option} ${s.riskNotice}`} style={{ '--style-color': 'var(--destructive)' } as CSSProperties}>
        <span className={o.icon}><ShieldAlert/></span><span className={o.optionText}><strong>{REAL_SOL.title}</strong></span>
        <span className={s.pill} data-tone={read ? 'live' : 'down'}>{read ? <Check size={11}/> : 'Read'}</span>
        <ChevronDown className={s.legalChevron} aria-hidden/>
      </CollapsibleTrigger>
      <CollapsibleContent><div className={`${s.legalDeclares} ${s.riskPoints}`}>{REAL_SOL.points.map(([title, text]) =>
        <div key={title} className={`${s.legalPoint} ${s.riskPoint}`}><b>{title}</b><small>{text}</small></div>)}</div></CollapsibleContent>
    </Collapsible>
    <div className={s.accountActions}>
      {onLater && <Button variant="secondary" onClick={onLater}>Not now</Button>}
      {wallets.map(wallet => <Button key={wallet.name} {...key} onClick={() => void sign(wallet)}>
        {busy === wallet.name ? <LoaderCircle className="animate-spin"/> : <img src={wallet.icon} alt="" className={s.legalWalletIcon}/>}Sign with {wallet.name}
      </Button>)}
      {(!wallets.length || signFailed) && <Button {...key} onClick={() => void click()}>
        {busy === 'click' ? <LoaderCircle className="animate-spin"/> : <Check/>}{wallets.length ? 'Accept without signing' : 'Accept risk'}
      </Button>}
    </div>
  </>;
}

/** The Accept dialog over the app. The Terms stand in the way of a signed-in person until they accept: Accept closes it and Decline signs them
 *  out, so there is no way round it. The Real SOL notice opens where a gate refused for it or an Accept button asked (`legalAskAtom`), and
 *  Not now closes that one. */
export function LegalGate() {
  const session = useSession(), profile = useAtomValue(userStateAtom).profileData, [ask, setAsk] = useAtom(legalAskAtom), logout = useAtomValue(logoutAtom);
  const termsDue = Boolean(session.connected && profile && profile.accepted.terms?.version !== LEGAL.terms.version);
  const kind: LegalKind | null = termsDue ? 'terms' : ask === 'terms' ? null : ask;
  const data = useHome(session.connected);
  const open = kind === 'terms' || (kind === 'realSol' && Boolean(data) && !data!.workspace.realSolTermsCurrent);
  const required = kind === 'terms', close = () => setAsk(null);
  return <Dialog open={open} onOpenChange={next => { if (!next && !required) close(); }}>
    <DialogContent className="sm:max-w-[30rem]" aria-describedby={undefined} showCloseButton={!required}
      onEscapeKeyDown={event => { if (required) event.preventDefault(); }} onInteractOutside={event => { if (required) event.preventDefault(); }}>
      <div className={s.decision}>
        <div className={s.legalHero}><LegalMascot size={104}/><span>
          <DialogTitle asChild><b>{kind === 'realSol' ? 'Accept the new Real SOL terms' : profile?.accepted.terms ? 'Accept the new terms' : 'Accept the terms'}</b></DialogTitle>
          <span className={s.legalHeadPills}><span className={s.pill} data-tone="warn">Beta v{LEGAL[kind ?? 'terms'].version}</span></span>
        </span></div>
        {kind === 'realSol' && data ? <RealSolAccept data={data} onLater={close} onDone={close}/> : <TermsAccept onDecline={logout ? () => void logout.run() : undefined} onDone={close}/>}
      </div>
    </DialogContent>
  </Dialog>;
}
