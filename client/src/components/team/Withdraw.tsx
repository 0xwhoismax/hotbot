"use client";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAction, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useAtomValue } from 'jotai';
import { ArrowUpRight, Check, KeyRound, LoaderCircle, Mail, Plus, ShieldAlert, Ticket, Trash2, TriangleAlert, Wallet as WalletIcon, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Wallet as StandardWallet } from '@wallet-standard/base';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, useQuery } from '@/lib/convex';
import { onWalletsChange, opensApp, recoveryAccount, recoveryWallets, signPrepared } from '@/lib/solanaWallets';
import { signText } from '@/lib/walletSign';
import { ADDRESS_LOCK_DAYS, ADDRESS_SIGNATURE_MS, MIN_WITHDRAW_SOL, addressMessage, isAddress, tokenWithdrawalProblem, withdrawalProblem } from '../../../../types/withdrawal';
import { HOTBOT_DECIMALS, HOTBOT_MINT } from '../../../../types/access';
import type { HomeData } from './data';
import type { Prepared } from './EmailApproval';
import { askFreshCode, failToast, useSession, viewedAtom } from './state';
import { useHome } from './useHome';
import { sol } from './format';
import { CodeEntry, SolscanLink, StepButton, useNow } from './Parts';
import { realSolShort } from './LossStop';
import { tokenText, tokens, useAccess } from './AccessGate';
import s from './team.module.css';

type Wallet = NonNullable<HomeData['workspace']['wallet']>;
/** Crossmint's email signer, loaded only when an email-recovered wallet approves; the main button says so while it loads. */
const EmailApproval = dynamic(() => import('./EmailApproval'), { ssr: false, loading: () => <StepButton label="Connecting…"/> });
const EMAIL_APPROVAL = Boolean(process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY);
const short = (address: string) => address.slice(0, 4) + '…' + address.slice(-4);
const DAY_MS = 24 * 60 * 60_000;
/** The place SOL can go without a saved address's lock: the recovery wallet. */
function homes(wallet: Wallet): { address: string; label: string; Icon: LucideIcon }[] {
  return wallet.recovery.type === 'wallet' ? [{ address: wallet.recovery.address, label: 'Recovery wallet', Icon: KeyRound }] : [];
}
/** A saved address as the dialog names it: a wallet that paid one of the person's passes, or one they added. */
function savedPlace(address: string, passWallets: readonly string[]): { address: string; label: string; Icon: LucideIcon } {
  return passWallets.includes(address) ? { address, label: 'Pass wallet', Icon: Ticket } : { address, label: 'Saved address', Icon: WalletIcon };
}
/** "6 d 4 h", "3 h", "12 min": how long until `at`. */
function until(at: number, now: number) {
  const left = Math.max(0, at - now), days = Math.floor(left / DAY_MS), hours = Math.floor(left % DAY_MS / 3_600_000);
  return days ? `${days} d${hours ? ` ${hours} h` : ''}` : hours ? `${hours} h` : `${Math.max(1, Math.ceil(left / 60_000))} min`;
}

/** The wallets that can sign for the recovery, kept current as wallet extensions register. */
function useRecoveryWallets() {
  const [wallets, setWallets] = useState<readonly StandardWallet[]>([]);
  useEffect(() => { const read = () => setWallets(recoveryWallets()); read(); return onWalletsChange(read); }, []);
  return wallets;
}

/** One button for each wallet that can sign for the recovery: the recovery signs, in its own wallet app. */
function SignWith({ wallets, busy, label, onPick, disabled = false }: { wallets: readonly StandardWallet[]; busy: string | null; label: (wallet: StandardWallet) => string; onPick: (wallet: StandardWallet) => void; disabled?: boolean }) {
  if (!wallets.length) return <span className={s.depositProblem}><span className={s.pill} data-tone="warn">No wallet found</span><small className={s.muted}>Open this page in the browser or the app of your recovery wallet.</small></span>;
  return <div className={s.accountActions}>{wallets.map(wallet => <Button key={wallet.name} disabled={disabled || busy !== null} onClick={() => onPick(wallet)}>
    {busy === wallet.name ? <LoaderCircle className="animate-spin"/> : <img src={wallet.icon} alt="" width={16} height={16}/>}{label(wallet)}</Button>)}</div>;
}

/** Money out of the HOTBOT wallet: Crossmint prepares it, this browser checks it sends exactly that, and the recovery approves it. SOL, or
 *  the $HOTBOT the pass does not lock. `Addresses` lists where it may go. */
export function WithdrawDialog({ wallet, team }: { wallet: Wallet; team?: HomeData }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'withdraw' | 'addresses'>('withdraw'), request = wallet.request, holding = request && (request.status === 'prepared' || request.status === 'approved');
  const free = Math.max(0, wallet.hotbot - (useAccess(team)?.access.locked ?? 0));
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) setTab('withdraw'); }}>
    <DialogTrigger asChild><Button variant="secondary" className={s.keyOut} disabled={wallet.balanceSol < MIN_WITHDRAW_SOL + 0.002 && free <= 0 && !holding}>{holding ? <LoaderCircle className="animate-spin"/> : <ArrowUpRight/>}Withdraw</Button></DialogTrigger>
    <DialogContent className="max-h-[min(44rem,calc(var(--view-h)-2rem))] overflow-y-auto sm:max-w-[26rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ArrowUpRight size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Withdraw</b></DialogTitle>
          <small>{sol(wallet.balanceSol)}{wallet.hotbot > 0 ? ` · ${tokens(wallet.hotbot)} $HOTBOT` : ''} in your HOTBOT wallet</small></span></div>
        <div className={s.accountMode} role="group" aria-label="Withdraw or addresses">
          <button type="button" aria-pressed={tab === 'withdraw'} onClick={() => setTab('withdraw')}>Withdraw</button>
          <button type="button" aria-pressed={tab === 'addresses'} onClick={() => setTab('addresses')}>Addresses{wallet.saved.length ? ` · ${wallet.saved.length}` : ''}</button>
        </div>
        {tab === 'withdraw' ? <WithdrawPanel wallet={wallet} team={team} free={free} onAddresses={() => setTab('addresses')}/> : <AddressesPanel wallet={wallet}/>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** The request's state, or the form for a new one. An email approval runs under both, in the place of their main button (each hides its
 *  own while it runs): the request it prepares turns the form into the request's view while it runs. `free`: the $HOTBOT the pass does
 *  not lock. */
function WithdrawPanel({ wallet, team, free, onAddresses }: { wallet: Wallet; team?: HomeData; free: number; onAddresses: () => void }) {
  const request = wallet.request, [again, setAgain] = useState(false), sent = () => setAgain(false);
  const email = useEmailApproval(sent), approval = useWalletApproval(wallet, sent);
  const open = request && (request.status === 'prepared' || request.status === 'approved');
  return <div className={s.deposit}>
    {request && (open || !again) ? <Request wallet={wallet} request={request} email={email} approval={approval} onNew={() => setAgain(true)}/>
      : <WithdrawForm wallet={wallet} team={team} free={free} email={email} approval={approval} onAddresses={onAddresses}/>}
    {email.prompt}
  </div>;
}

/** A withdrawal for the recovery wallet to sign: Crossmint's transaction, checked by this browser, and its request. */
type ToSign = { requestId: string; transaction: string };
/** One recovery-wallet approval at a time, shared by the panel's two views: `start` it from a tap with how to name the transaction; `busy`
 *  names the wallet while it runs, `preparing` while Crossmint prepares; `held` is the latest transaction prepared, for the Approve button,
 *  and `tapFor` the request whose signature waits for that button's own tap. */
type WalletApprovalRun = { start: (signer: StandardWallet, prepare: () => Promise<ToSign>) => void; busy: string | null; preparing: boolean; held: ToSign | null; tapFor: string | null };
/** The recovery wallet's approval of one withdrawal. Crossmint's transaction lands only within 150 blocks of its blockhash, so the wallet
 *  connects before Crossmint prepares and only the signature falls in that time. A wallet app that Chrome opens (`opensApp`) opens only from
 *  a fresh tap, once per tap: when connecting opened it, or the tap went stale while Crossmint prepared, the signature waits for the Approve
 *  button's own tap. Other wallets sign at once. */
function useWalletApproval(wallet: Wallet, onSent: () => void): WalletApprovalRun {
  const approve = useAction(api.withdraw.approve), recovery = wallet.recovery.type === 'wallet' ? wallet.recovery.address : null;
  const [busy, setBusy] = useState<string | null>(null), [preparing, setPreparing] = useState(false), [held, setHeld] = useState<ToSign | null>(null), [tapFor, setTapFor] = useState<string | null>(null);
  async function run(signer: StandardWallet, prepare: () => Promise<ToSign>) {
    if (!recovery) return;
    setBusy(signer.name);
    setTapFor(null);
    try {
      let left = false;
      const away = () => { left = true; };
      window.addEventListener('blur', away);
      const account = await recoveryAccount(signer, recovery).finally(() => window.removeEventListener('blur', away));
      setPreparing(true);
      const prepared = await prepare().finally(() => setPreparing(false));
      setHeld(prepared);
      if (opensApp(signer) && (left || navigator.userActivation?.isActive === false)) { setTapFor(prepared.requestId); return; }
      await approve({ requestId: prepared.requestId, signature: await signPrepared(signer, account, prepared.transaction) });
      onSent();
    } catch (cause) { failToast(cause, { call: 'withdraw.approve' }); } finally { setBusy(null); }
  }
  return { start: (signer, prepare) => void run(signer, prepare), busy, preparing, held, tapFor };
}
/** A two-factor account's fresh code, asked before a new withdrawal's recovery step (`toPrepare` checks it again): false when the person
 *  closed the code dialog. It reads until when this session's last code counts (`twoFactor.status`), so a tap that needs none waits on
 *  nothing: Chrome on Android opens a wallet app only from a fresh tap. */
function useFreshCode() {
  const status = useQuery(api.twoFactor.status, {});
  return async () => !status || status.freshUntil === null || status.freshUntil > Date.now() || await askFreshCode();
}

/** One email approval, shared by the panel's two views: `start` it with how to name the withdrawal; `busy` while it runs; `prompt` holds
 *  the approval, which shows its step or the code field in the main button's place. */
type EmailApprovalRun = { start: (prepare: () => Promise<Prepared>) => void; busy: boolean; prompt: ReactNode };
/** The email-code approval of one withdrawal (EmailApproval.tsx): the code, then `prepare` names the withdrawal and Crossmint's signer
 *  approves it; HOTBOT then reads Crossmint's answer. A code the person cancelled ends it without a toast. */
function useEmailApproval(onSent: () => void): EmailApprovalRun {
  const confirm = useAction(api.withdraw.emailApproved), [run, setRun] = useState<{ id: string; prepare: () => Promise<Prepared> } | null>(null);
  const prompt = run && <EmailApproval key={run.id} prepare={run.prepare}
    onApproved={requestId => void confirm({ requestId }).then(onSent, cause => failToast(cause, { call: 'withdraw.emailApproved' })).finally(() => setRun(null))}
    onFailed={(cause, trail) => { setRun(null); if (!(cause instanceof Error && cause.name === 'AuthRejectedError')) failToast(cause, { call: 'withdraw.emailApproval', trail }); }}/>;
  return { start: prepare => setRun({ id: crypto.randomUUID(), prepare }), busy: run !== null, prompt };
}

/** A request waiting for the recovery's approval, being sent, or ended: a withdrawal of SOL or $HOTBOT, or the pass's fee. */
function Request({ wallet, request, email, approval, onNew }: { wallet: Wallet; request: NonNullable<Wallet['request']>; email: EmailApprovalRun; approval: WalletApprovalRun; onNew: () => void }) {
  const [read, setRead] = useState<string | null>(null), [crossmintTx, setCrossmintTx] = useState<string | null>(null), [readError, setReadError] = useState<string | null>(null), wallets = useRecoveryWallets();
  const pending = useAction(api.withdraw.pending), cancel = useMutation(api.withdrawals.cancel), [cancelling, setCancelling] = useState(false);
  const waiting = request.status === 'prepared' && !request.approving;
  // The transaction this browser prepared is known; one made on another device or before a reload is read from Crossmint again, and
  // checked the same way.
  const transaction = approval.held?.requestId === request.requestId ? approval.held.transaction : read;
  const problem = useMemo(() => !transaction ? null : request.token ? tokenWithdrawalProblem(transaction, { vault: wallet.address, to: request.to, ...request.token })
    : withdrawalProblem(transaction, { vault: wallet.address, to: request.to, lamports: request.lamports }), [transaction, wallet.address, request.to, request.lamports, request.token]);
  useEffect(() => {
    if (!waiting || transaction) return;
    let live = true;
    pending({}).then(found => { if (live && found?.requestId === request.requestId) { setRead(found.transaction); setCrossmintTx(found.crossmintTx); } }).catch(cause => { if (live) setReadError(cause instanceof Error ? cause.message : 'Crossmint did not answer.'); });
    return () => { live = false; };
  }, [waiting, transaction, pending, request.requestId]);
  const tone = request.status === 'landed' ? 'ember' : request.status === 'failed' ? 'down' : undefined;
  const title = { prepared: request.approving ? 'Confirming…' : wallet.recovery.type === 'email' ? 'Waiting for approval' : 'Approve in your wallet', approved: 'Sending…', landed: 'Sent', failed: 'Failed', expired: 'Expired', cancelled: 'Cancelled' }[request.status];
  const checked = `this amount, this address, ${!request.token ? 'SOL' : request.token.mint === HOTBOT_MINT ? '$HOTBOT' : 'USDC'} only`;
  async function stop() {
    setCancelling(true);
    try { await cancel({ requestId: request.requestId }); } catch (cause) { failToast(cause, { call: 'withdrawals.cancel' }); } finally { setCancelling(false); }
  }
  return <div className={s.deposit}>
    <dl className={s.walletBreakdown}>
      <div><dt>Status</dt><dd className={s.withdrawStatus} data-tone={tone}>{(request.status === 'approved' || request.approving) && <LoaderCircle size={13} className="animate-spin"/>}{request.status === 'landed' && <Check size={13}/>}{title}</dd></div>
      <div><dt>Amount</dt><dd>{request.token ? tokenText(request.token) : sol(request.lamports / 1e9, 6)}</dd></div>
      <div><dt>To</dt><dd className={s.walletRecoveryValue}><code title={request.to}>{short(request.to)}</code><SolscanLink kind="account" value={request.to} label="View the destination on Solscan"/></dd></div>
      {request.hash && <div><dt>Transaction</dt><dd className={s.walletRecoveryValue}><code>{short(request.hash)}</code><SolscanLink kind="tx" value={request.hash} label="View the transaction on Solscan"/></dd></div>}
    </dl>
    {request.reason && <div className={s.depositProblem}><span className={s.pill} data-tone="warn">{request.status === 'failed' ? 'Reason' : 'Note'}</span><small className={s.muted}>{request.reason}</small></div>}
    {waiting && <>
      {problem && <div className={s.depositProblem}><ShieldAlert size={14}/><span className={s.pill} data-tone="warn">Not signed</span><small className={s.muted}>{problem}</small></div>}
      {readError && <div className={s.depositProblem}><span className={s.pill} data-tone="warn">Not read</span><small className={s.muted}>{readError}</small></div>}
      {!transaction && !readError && <span className={s.pill}><LoaderCircle size={11} className="animate-spin"/>Checking it</span>}
      {transaction && !problem && <>
        <span className={s.pill} data-tone="ember"><Check size={11}/>Checked: {checked}</span>
        {approval.tapFor === request.requestId && !approval.busy && <span className={s.pill} data-tone="warn">Tap to sign</span>}
        {wallet.recovery.type === 'wallet' ? <SignWith wallets={wallets} busy={approval.busy} label={wallet => `Approve in ${wallet.name}`} onPick={signer => approval.start(signer, async () => ({ requestId: request.requestId, transaction }))}/>
          : !email.busy && <EmailApprove busy={false} onApprove={() => crossmintTx && email.start(async () => ({ requestId: request.requestId, transactionId: crossmintTx }))}/>}
      </>}
      {!email.busy && <div className={s.accountActions}><Button variant="secondary" disabled={cancelling || approval.busy !== null} onClick={() => void stop()}><X/>Cancel</Button></div>}
    </>}
    {request.status === 'approved' && <small className={s.muted}>Your wallet signed it. It lands within a minute.</small>}
    {!(request.status === 'prepared' || request.status === 'approved') && <>
      {request.status === 'cancelled' && <small className={s.muted}>It is dropped by the network within a few minutes; its SOL stays held until then.</small>}
      <div className={s.accountActions}><Button onClick={onNew}><ArrowUpRight/>New withdrawal</Button></div>
    </>}
  </div>;
}

/** The email-recovered wallet's approve button: Crossmint emails a code to the recovery email and asks for it. */
function EmailApprove({ busy, onApprove, label = 'Approve with an email code', disabled = false }: { busy: boolean; onApprove: () => void; label?: string; disabled?: boolean }) {
  if (!EMAIL_APPROVAL) return <span className={s.depositProblem}><span className={s.pill} data-tone="warn">Email approval is off</span></span>;
  return <Button disabled={busy || disabled} onClick={onApprove}>{busy ? <LoaderCircle className="animate-spin"/> : <Mail/>}{label}</Button>;
}

/** Where, what, how much, and Withdraw: SOL, or the $HOTBOT the pass does not lock (`free`). */
function WithdrawForm({ wallet, team, free, email, approval, onAddresses }: { wallet: Wallet; team?: HomeData; free: number; email: EmailApprovalRun; approval: WalletApprovalRun; onAddresses: () => void }) {
  const room = useQuery(api.withdrawals.withdrawable, {}), request = useAction(api.withdraw.request), requestHotbot = useAction(api.withdraw.requestHotbot), wallets = useRecoveryWallets(), now = useNow(60_000);
  const home = wallet.recovery.type === 'wallet' ? wallet.recovery.address : null;
  const ready = wallet.saved.filter(row => !row.confirming && row.unlocksAt <= now), locked = wallet.saved.filter(row => !row.confirming && row.unlocksAt > now);
  const passWallets = room?.passWallets ?? [], places = [...homes(wallet), ...ready.map(row => savedPlace(row.address, passWallets))];
  const [to, setTo] = useState(''), [amount, setAmount] = useState(''), [token, setToken] = useState<'SOL' | 'HOTBOT'>('SOL'), hotbot = token === 'HOTBOT';
  const value = Number(amount), available = hotbot ? free : room?.sol ?? 0, budgetsShort = team && !hotbot && value > 0 ? realSolShort(team, 0, value) : 0;
  const place = places.find(item => item.address === to) ?? places[0], valid = Boolean(place) && Number.isFinite(value) && value >= (hotbot ? 10 ** -HOTBOT_DECIMALS : MIN_WITHDRAW_SOL) && value <= available + 1e-9;
  const [signer, setSigner] = useState<string | null>(null);
  const picked = wallets.find(item => item.name === signer) ?? wallets[0], byEmail = wallet.recovery.type === 'email', shown = hotbot ? `${tokens(value)} $HOTBOT` : sol(value);
  /** Crossmint prepares it, this browser checks it sends exactly that, and returns it for the recovery to approve. */
  async function prepare(to: string, requestId: string) {
    if (hotbot) {
      const raw = Math.round(value * 10 ** HOTBOT_DECIMALS), prepared = await requestHotbot({ requestId, to, raw });
      const problem = tokenWithdrawalProblem(prepared.transaction, { vault: wallet.address, to, mint: HOTBOT_MINT, raw });
      if (problem) throw new ConvexError(`The prepared withdrawal was not approved. ${problem}`);
      return prepared;
    }
    const lamports = Math.round(value * 1e9), prepared = await request({ requestId, to, lamports });
    const problem = withdrawalProblem(prepared.transaction, { vault: wallet.address, to, lamports });
    if (problem) throw new ConvexError(`The prepared withdrawal was not approved. ${problem}`);
    return prepared;
  }
  const fresh = useFreshCode();
  /** The email path: the code first, then Crossmint prepares it and this browser checks it before the email signer approves it. */
  async function sendByEmail() {
    if (!valid || !place || !await fresh()) return;
    const to = place.address;
    email.start(async () => { const requestId = crypto.randomUUID(); return { requestId, transactionId: (await prepare(to, requestId)).crossmintTx }; });
  }
  /** The wallet path: the recovery wallet connects, Crossmint prepares it, this browser checks it, and the wallet signs (useWalletApproval). */
  async function send(chosen: StandardWallet) {
    if (!valid || !place || !home || !await fresh()) return;
    const to = place.address;
    approval.start(chosen, async () => { const requestId = crypto.randomUUID(); return { requestId, transaction: (await prepare(to, requestId)).transaction }; });
  }
  const running = email.busy || approval.busy !== null;
  return <form className={s.deposit} onSubmit={event => { event.preventDefault(); if (running) return; if (byEmail) void sendByEmail(); else if (picked) void send(picked); }}>
    <fieldset disabled={running} className={s.formLock}>
    {wallet.hotbot > 0 && <div className={s.accountMode} role="group" aria-label="What to withdraw">
      <button type="button" aria-pressed={!hotbot} onClick={() => { setToken('SOL'); setAmount(''); }}>SOL</button>
      <button type="button" aria-pressed={hotbot} onClick={() => { setToken('HOTBOT'); setAmount(''); }}>$HOTBOT</button>
    </div>}
    {places.length > 0 && <div className={s.depositWallets} role="group" aria-label="Send to">{places.map(item => <button type="button" key={item.address} aria-pressed={item.address === place?.address} title={item.address} onClick={() => setTo(item.address)}>
      <item.Icon size={13}/>{item.label} · {short(item.address)}</button>)}</div>}
    {locked.map(row => <span key={row.address} className={s.depositProblem}><span className={s.pill}>Unlocks in {until(row.unlocksAt, now)}</span><code className={s.muted}>{short(row.address)}</code></span>)}
    <button type="button" className={s.walletReset} onClick={onAddresses}><Plus size={14}/>{places.length > 1 || locked.length ? 'Manage addresses' : 'Add an address'}</button>
    <div className={s.withdrawAmount}>
      <Input type="number" inputMode="decimal" step="any" min={0} max={available} placeholder="0.00" value={amount} onChange={event => setAmount(event.target.value)} aria-label={hotbot ? 'Amount in $HOTBOT' : 'Amount in SOL'}/>
      <span>{hotbot ? '$HOTBOT' : 'SOL'}</span>
      <button type="button" className={s.walletReset} disabled={available <= 0} onClick={() => setAmount(String(hotbot ? Math.floor(available * 10 ** HOTBOT_DECIMALS) / 10 ** HOTBOT_DECIMALS : Math.floor(available * 1e9) / 1e9))}>Max</button>
    </div>
    <dl className={s.walletBreakdown}>
      <div><dt>Available</dt><dd>{hotbot ? `${tokens(available)} $HOTBOT` : room === undefined ? '…' : sol(available, 6)}</dd></div>
      {hotbot && wallet.hotbot - free > 0 && <div><dt>Locked by your pass</dt><dd>{tokens(wallet.hotbot - free)} $HOTBOT</dd></div>}
      {budgetsShort > 0.0005 && <div><dt>Leaves budgets short</dt><dd className={s.warnText}>{sol(budgetsShort)}</dd></div>}
    </dl>
    {!byEmail && wallets.length > 1 && <div className={s.depositWallets} role="group" aria-label="Approve with">{wallets.map(item => <button type="button" key={item.name} aria-pressed={item === picked} onClick={() => setSigner(item.name)}><img src={item.icon} alt="" width={18} height={18}/>{item.name}</button>)}</div>}
    {byEmail ? (EMAIL_APPROVAL ? !email.busy && <Button type="submit" disabled={!valid}><Mail/>{`Withdraw${value > 0 ? ' ' + shown : ''}`}</Button>
      : <EmailApprove busy={false} onApprove={() => {}}/>)
    : picked ? <Button type="submit" disabled={!valid || approval.busy !== null} className={approval.busy ? s.stepButton : undefined}>{approval.busy ? <LoaderCircle className="animate-spin"/> : <img src={picked.icon} alt="" width={16} height={16}/>}
      {approval.preparing ? 'Preparing…' : approval.busy ? `Approve in ${approval.busy}` : `Withdraw${value > 0 ? ' ' + shown : ''}`}</Button>
      : <SignWith wallets={wallets} busy={null} label={item => item.name} onPick={() => {}} disabled/>}
    </fieldset>
  </form>;
}

/** The saved addresses and a new one: the recovery wallet signs each, or an emailed code confirms it for an email-recovered wallet; a new
 *  one waits ADDRESS_LOCK_DAYS before SOL can go to it. */
export function AddressesPanel({ wallet }: { wallet: Wallet }) {
  const add = useMutation(api.withdrawals.addAddress), remove = useMutation(api.withdrawals.removeAddress), wallets = useRecoveryWallets(), now = useNow(60_000), room = useQuery(api.withdrawals.withdrawable, {});
  const requestCode = useMutation(api.withdrawals.requestAddressCode), confirm = useMutation(api.withdrawals.confirmAddress), [codes, setCodes] = useState<Readonly<Record<string, string>>>({});
  const [address, setAddress] = useState(''), [busy, setBusy] = useState<string | null>(null), recovery = wallet.recovery.type === 'wallet' ? wallet.recovery.address : null;
  const frozen = wallet.addsFrozenUntil !== null && wallet.addsFrozenUntil > now, text = address.trim();
  const fixed = homes(wallet), passWallets = room?.passWallets ?? [], valid = isAddress(text) && text !== wallet.address && !fixed.some(row => row.address === text) && !wallet.saved.some(row => row.address === text);
  async function sign(signer: StandardWallet) {
    if (!recovery || !valid) return;
    setBusy(signer.name);
    try {
      const account = await recoveryAccount(signer, recovery), nonce = crypto.randomUUID(), expires = new Date(Date.now() + ADDRESS_SIGNATURE_MS - 60_000).toISOString();
      await add({ address: text, nonce, expires, signature: await signText(signer, account, addressMessage({ vault: wallet.address, address: text, nonce, expires })) });
      setAddress('');
      toast.success(`Saved · unlocks in ${ADDRESS_LOCK_DAYS} days`);
    } catch (cause) { failToast(cause, { call: 'withdrawals.addAddress' }); } finally { setBusy(null); }
  }
  async function emailCode(target: string) {
    setBusy(`code:${target}`);
    try { await requestCode({ address: target }); if (target === text) setAddress(''); toast.success('Code sent to your email'); }
    catch (cause) { failToast(cause, { call: 'withdrawals.requestAddressCode' }); } finally { setBusy(null); }
  }
  async function confirmCode(target: string) {
    setBusy(`confirm:${target}`);
    try { await confirm({ address: target, code: codes[target] ?? '' }); setCodes(typed => ({ ...typed, [target]: '' })); toast.success(`Confirmed · unlocks in ${ADDRESS_LOCK_DAYS} days`); }
    catch (cause) { failToast(cause, { call: 'withdrawals.confirmAddress' }); } finally { setBusy(null); }
  }
  async function drop(target: string) {
    setBusy(`drop:${target}`);
    try { await remove({ address: target }); } catch (cause) { failToast(cause, { call: 'withdrawals.removeAddress' }); } finally { setBusy(null); }
  }
  return <div className={s.deposit}>
    {(fixed.length > 0 || wallet.saved.length > 0) && <div className={`${s.rows} ${s.surface} ${s.addressList}`}>
      {fixed.map(row => <div className={`${s.row} ${s.signInRow}`} key={row.address}><row.Icon size={14}/>
        <span className={`${s.grow} ${s.addressText}`}><code title={row.address}>{short(row.address)}</code><small className={s.muted}>{row.label}</small></span>
        <span className={s.pill} data-tone="ember">Ready</span><SolscanLink kind="account" value={row.address} label={`View the ${row.label.toLowerCase()} on Solscan`}/></div>)}
      {wallet.saved.map(row => { const place = savedPlace(row.address, passWallets); return <Fragment key={row.address}>
        <div className={`${s.row} ${s.signInRow}`}>
          <place.Icon size={14}/><span className={`${s.grow} ${s.addressText}`}><code title={row.address}>{short(row.address)}</code><small className={s.muted}>{place.label}</small></span>
          {row.confirming ? <span className={s.pill} data-tone="warn">Needs code</span> : row.unlocksAt > now ? <span className={s.pill} data-tone="warn">Unlocks in {until(row.unlocksAt, now)}</span> : <span className={s.pill} data-tone="ember">Ready</span>}
          <SolscanLink kind="account" value={row.address} label="View the address on Solscan"/>
          <Button size="icon-sm" variant="ghost" disabled={busy !== null} aria-label={row.unlocksAt > now ? `Cancel ${short(row.address)}` : `Remove ${short(row.address)}`} title={row.unlocksAt > now && !row.confirming ? `Cancel: also stops new addresses for ${ADDRESS_LOCK_DAYS} days` : 'Remove'} onClick={() => void drop(row.address)}>
            {busy === `drop:${row.address}` ? <LoaderCircle className="animate-spin"/> : <Trash2/>}</Button>
        </div>
        {row.confirming && <CodeEntry label={`Code for ${short(row.address)}`} code={codes[row.address] ?? ''} onCode={code => setCodes(typed => ({ ...typed, [row.address]: code }))}
          onConfirm={() => void confirmCode(row.address)} onResend={() => void emailCode(row.address)} disabled={busy !== null}
          busy={busy === `confirm:${row.address}` ? 'confirm' : busy === `code:${row.address}` ? 'resend' : null}/>}
      </Fragment>; })}
    </div>}
    {frozen ? <div className={s.depositProblem}><span className={s.pill} data-tone="warn">New addresses open in {until(wallet.addsFrozenUntil!, now)}</span></div> : <>
      <Input value={address} onChange={event => setAddress(event.target.value)} placeholder="Solana address" spellCheck={false} autoComplete="off" aria-label="New withdrawal address" className={s.withdrawTo}/>
      {recovery ? <SignWith wallets={wallets} busy={busy} label={item => `Add with ${item.name}`} onPick={item => void sign(item)} disabled={!valid}/>
        : <Button disabled={!valid || busy !== null} onClick={() => void emailCode(text)}>{busy === `code:${text}` ? <LoaderCircle className="animate-spin"/> : <Mail/>}Email me a code</Button>}
    </>}
  </div>;
}

/** A new withdrawal address as a toast: its address, Cancel and Dismiss (AddressNotice; /dev/toasts shows it on a sample). `viewed`: an
 *  admin viewing the team, who cannot answer it. */
export function showAddressToast(address: string, { viewed = false, onCancel, onDismiss }: { viewed?: boolean; onCancel: (id: string | number) => void; onDismiss: (id: string | number) => void }) {
  const owner = viewed ? 'Only the owner can answer it' : undefined;
  toast.custom(id => <div className={s.addressToast} role="alert">
    <TriangleAlert size={17} className={s.addressToastIcon} aria-hidden/>
    <span className={s.grow}><b>New withdrawal address</b><code>{short(address)}</code></span>
    <Button size="sm" variant="secondary" disabled={viewed} title={owner} onClick={() => onCancel(id)}>Cancel</Button>
    <Button size="sm" disabled={viewed} title={owner} onClick={() => onDismiss(id)}>Dismiss</Button>
  </div>, { id: `address:${address}`, duration: Infinity });
}
/** The addresses this browser was told of and kept, so it does not ask again. */
const KEPT_KEY = 'hotbot.keptAddresses';
const keptAddresses = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]')); } catch { return new Set<string>(); } };
/** Once for each signed-in page load: a withdrawal address still waiting to unlock, with Cancel and Dismiss. A stolen session cannot approve an
 *  add, but an inbox or a device taken over may have; whoever sees this in any session can stop it. Dismiss stops asking in this browser. An
 *  admin viewing the team sees it with both off: the cancel would act on the admin's own account. */
export function AddressNotice() {
  const session = useSession(), data = useHome(session.connected), remove = useMutation(api.withdrawals.removeAddress), now = useNow(60_000), saved = data?.workspace.wallet?.saved;
  const viewed = Boolean(useAtomValue(viewedAtom));
  const locked = (saved ?? []).filter(row => !row.confirming && row.unlocksAt > now);
  const key = locked.map(row => row.address).join();
  useEffect(() => {
    if (!now) return;
    const ids = key ? key.split(',') : [], kept = keptAddresses();
    for (const address of ids) {
      if (kept.has(address)) continue;
      const keep = (id: string | number) => { localStorage.setItem(KEPT_KEY, JSON.stringify([...keptAddresses(), address])); toast.dismiss(id); };
      const cancel = (id: string | number) => { toast.dismiss(id); void remove({ address }).catch(cause => failToast(cause, { call: 'withdrawals.removeAddress' })); };
      showAddressToast(address, { viewed, onCancel: cancel, onDismiss: keep });
    }
    // The toast keeps its own time; it opens again only when the set of waiting addresses changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, now > 0, viewed]);
  return null;
}
