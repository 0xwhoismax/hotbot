"use client";
import { useEffect, useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { address } from '@solana/kit';
import type { Wallet } from '@wallet-standard/base';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-standard-mobile';
import { ArrowLeft, Check, ChevronDown, Copy, LoaderCircle, Smartphone } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { api, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { AppFlame } from '@/components/hotbot/AppFlame';
import { WALLET_APPS, openInWallet, payingAccount, sendInstructions, sentStatus, usePayingWallets, type WalletApp } from '@/lib/solanaWallets';
import { holdingsOf, rpc } from '@/lib/solanaTx';
import { payInstructions, stakeCost } from '@/lib/passPay';
import { ACCESS_TIERS, DAY_MS, HOTBOT_DECIMALS, HOTBOT_MINT, PAY_CURRENCIES, USDC_DECIMALS, accessOf, amountText, depositLamports, type PayCurrency } from '../../../../types/access';
import { useAtomValue } from 'jotai';
import { Input } from '@/components/ui/input';
import { requestEmailCode } from '@/lib/emailCode';
import { EMAIL_CODE_DIGITS } from '../../../../types/signIn';
import { failure, signInAtom } from './state';
import { reason } from './SignInStep';
import { AccessTiles, STAKE_WHERE, day, tokens } from './AccessGate';
import { Qr } from './TeamWallet';
import { InfoTip, useNow } from './Parts';
import o from './onboarding.module.css';
import s from './team.module.css';

/** How often a payment from this browser, or from a phone that scanned the QR code, is looked for while it is on its way. */
const LOOK_MS = 3_000;
const wait = (ms: number) => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, ms); return promise; };
const FINDING = 'Finding your payment';
const LANDED = 'Your payment landed. HOTBOT finds it when you open this page again, so don’t pay again.';
/** How many looks for a payment that landed before the screen says it is still being recorded, and the wait before each retry: from
 *  LOOK_MS doubling to a minute, since each look takes one of the person's payment checks. */
export const CONFIRM_TRIES = 3;
export const retryMs = (tries: number) => Math.min(LOOK_MS * 2 ** tries, 60_000);
/** What went wrong, as the person reads it: a wallet's cancel reads plainly. */
const said = (cause: unknown) => cause instanceof Error && /reject|cancel|denied|declined/i.test(cause.message) ? 'Cancelled. Nothing was taken.' : failure(cause).message;
type Quote = FunctionReturnType<typeof api.access.payQuote>;
/** How this device pays: a wallet in this browser, Android's wallet app, a phone wallet's own browser, or a phone that scans the QR code. */
type PayWay = 'wallet' | 'app' | 'open' | 'scan';

/** The pass from the person's own wallet in one approval: the stake into their HOTBOT wallet, their own $HOTBOT or bought on the way, and
 *  the fee, before their team exists as after. It pays only what is still owed: both, the fee alone (the stake is already there), or the
 *  stake alone (a paid pass whose stake fell short). A wallet in this browser pays in one tap; without one, Android's wallet app, a phone
 *  wallet's own browser or a desktop's QR code, whose payment is looked for until it lands. Someone who left halfway finds the payment where
 *  it got to. `renew`: the pass runs, and this adds its days. */
function usePassPay(renew: boolean) {
  const pay = useQuery(api.access.payment, {}), now = useNow(15_000) ?? 0, quote = useMutation(api.access.payQuote), openWallet = useMutation(api.walletsModel.openWallet);
  const confirm = useAction(api.accessChain.confirmPay), checkStake = useAction(api.accessChain.checkStake), startDeposit = useMutation(api.passDeposits.start), paying = usePayingWallets();
  const wallets = paying.filter(wallet => wallet.name !== SolanaMobileWalletAdapterWalletName), app = paying.find(wallet => wallet.name === SolanaMobileWalletAdapterWalletName);
  const [currency, setCurrency] = useState<PayCurrency>('SOL'), [held, setHeld] = useState<bigint | null>(null), [cost, setCost] = useState<bigint | null>(null), [costFailed, setCostFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null), [via, setVia] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [qr, setQr] = useState<Quote | null>(null);
  const [mobile, setMobile] = useState(false), started = useRef(false), resumed = useRef(false), first = useRef<number | null | undefined>(undefined);
  const [landed, setLanded] = useState<string | null>(null), [sendOpen, setSendOpen] = useState(false), [withHotbot, setWithHotbot] = useState(false), [phone, setPhone] = useState(false), [vaultLamports, setVaultLamports] = useState<bigint | null>(null);
  // The pass's end as the screen first read it: renewing pays until it moves.
  if (pay && first.current === undefined) first.current = pay.paidUntil;
  const tier = pay ? ACCESS_TIERS[pay.tier] : null, stakeRaw = tier ? BigInt(tier.hotbot) * 10n ** BigInt(HOTBOT_DECIMALS) : 0n;
  const paid = (pay?.paidUntil ?? 0) > now, feeDue = !paid || (renew && pay?.paidUntil === first.current);
  const short = held === null ? null : held >= stakeRaw ? 0n : stakeRaw - held, settled = pay !== undefined && !feeDue && short === 0n;
  // A HOTBOT wallet still being made holds no stake, so the stake is priced in full meanwhile.
  const owedStake = short ?? (pay && !pay.vault ? stakeRaw : null);

  // The HOTBOT wallet that takes the stake is made as the screen opens, when the person has none yet.
  useEffect(() => { if (pay && !pay.vault && pay.recoverable && !started.current) { started.current = true; void openWallet({}).catch(cause => setError(said(cause))); } }, [pay?.vault, pay?.recoverable]); // eslint-disable-line react-hooks/exhaustive-deps
  // The stake as the chain holds it now, and again after each payment.
  const readHeld = async (vault: string) => setHeld((await holdingsOf(vault)).hotbot?.raw ?? 0n);
  // A read that fails takes the stake Convex last recorded, and is tried again: a failed read never counts as no stake.
  useEffect(() => {
    if (!pay?.vault) return;
    const vault = pay.vault, recorded = BigInt(Math.round((pay.held ?? 0) * 10 ** HOTBOT_DECIMALS));
    let live = true;
    void (async () => {
      for (let tries = 0; live && tries < 5; tries++) {
        if (await readHeld(vault).then(() => true, () => false)) return;
        if (live) setHeld(current => current ?? recorded);
        await wait(LOOK_MS * (tries + 1));
      }
    })();
    return () => { live = false; };
  }, [pay?.vault]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMobile(/iphone|ipad|ipod|android/i.test(navigator.userAgent)); }, []);
  // A payment that landed while the person was away (a phone that scanned the QR code, a closed tab) is found by its quote.
  useEffect(() => {
    if (!pay?.open || resumed.current) return;
    resumed.current = true;
    const { id, vault } = pay.open;
    setBusy(FINDING);
    void confirm({ id }).then(found => found && vault ? readHeld(vault) : undefined).catch(() => undefined)
      .finally(() => setBusy(current => current === FINDING ? null : current));
  }, [pay?.open?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // What buying the stake costs now, for the total. Without a price the payment still goes ahead: it prices the stake again as it is built.
  useEffect(() => {
    setCostFailed(false);
    if (!owedStake) { setCost(owedStake === 0n ? 0n : null); return; }
    let live = true;
    setCost(null);
    stakeCost(currency, owedStake).then(found => { if (live) setCost(BigInt(found.inAmount)); }, () => { if (live) setCostFailed(true); });
    return () => { live = false; };
  }, [currency, owedStake]);

  // With no wallet in this browser, a quote backs HOTBOT's pay page (app/pay), which a computer's QR code and a phone's wallet browser open,
  // while the fee is owed; a computer's QR code else asks for the missing stake straight into the HOTBOT wallet. Each is looked for until
  // it lands.
  // A computer shows the QR code with no wallet in the browser, or when the person picks their phone over the browser's wallet.
  const scanning = !mobile && Boolean(pay?.vault) && (phone || (!wallets.length && !app)), fallback = Boolean(pay?.vault) && feeDue && (scanning || (!wallets.length && !app));
  const stakeLink = scanning && !feeDue && short ? `solana:${pay!.vault}?amount=${Number(short) / 10 ** HOTBOT_DECIMALS}&spl-token=${HOTBOT_MINT}` : null;
  useEffect(() => {
    if (!fallback) return;
    let live = true;
    void quote({ currency }).then(next => { if (live) setQr(next); }, cause => { if (live) setError(said(cause)); });
    return () => { live = false; };
  }, [fallback, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!qr || !fallback) return;
    let live = true;
    void (async () => {
      while (live && Date.now() < qr.expiresAt) {
        const [found] = await rpc().getSignaturesForAddress(address(qr.reference), { limit: 1, commitment: 'confirmed' }).send().catch(() => []);
        if (found && !found.err && live) {
          setBusy('Confirming on Solana');
          setLanded(qr.id);
          if (await recorded(qr, found.signature)) await readHeld(qr.vault).catch(() => undefined); else setError(LANDED);
          setBusy(null);
          return;
        }
        await wait(LOOK_MS);
      }
    })();
    return () => { live = false; };
  }, [qr?.id, fallback]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stakeLink || !pay?.vault) return;
    const vault = pay.vault;
    let live = true;
    void (async () => {
      while (live) {
        await wait(LOOK_MS);
        const found = await holdingsOf(vault).catch(() => null);
        if (!live || !found) continue;
        const raw = found.hotbot?.raw ?? 0n;
        if (raw >= stakeRaw) await checkStake({}).catch(() => undefined);
        setHeld(raw);
        if (raw >= stakeRaw) return;
      }
    })();
    return () => { live = false; };
  }, [stakeLink]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send it yourself, on a wallet made before the team: SOL sent to the HOTBOT wallet, which the worker turns into the stake and the fee
  const deposit = pay?.deposit ?? null, sendable = Boolean(pay?.beforeTeam && pay.vault) && feeDue, sending = sendable && sendOpen;
  useEffect(() => { if (deposit) { setSendOpen(true); setWithHotbot(deposit.withHotbot); } }, [deposit !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sending || !pay?.vault) return;
    const vault = pay.vault;
    let live = true;
    void (async () => {
      while (live) {
        const found = await holdingsOf(vault).catch(() => null);
        if (live && found) { setVaultLamports(found.lamports); setHeld(found.hotbot?.raw ?? 0n); }
        await wait(LOOK_MS);
      }
    })();
    return () => { live = false; };
  }, [sending, pay?.vault]);
  async function sendYourself(stake = withHotbot) {
    setSendOpen(true); setCurrency('SOL'); setError(null); setWithHotbot(stake);
    try { await startDeposit({ withHotbot: stake }); } catch (cause) { setError(said(cause)); }
  }

  // A payment that landed is looked for until Convex records it, since Convex's node may not hold it yet, while this page is open and its quote
  // runs. Pay stays off once one landed (`landed`), so no second payment goes out against the same quote; a reload finds it by its reference.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function recorded(owed: { id: Quote['id']; expiresAt: number }, signature: string) {
    // The first look always runs; the quote's end only stops the retries, which back off since each takes a payment check (`accessCheck`).
    for (let tries = 0; ; tries++) {
      const answer = await confirm({ id: owed.id, signature }).catch(cause => failure(cause).message.includes('isn’t yours') ? null : false);
      if (answer === true) return true;
      if (answer === null || !mounted.current || Date.now() > owed.expiresAt) return false;
      if (tries === CONFIRM_TRIES) setBusy('Recording your payment');
      await wait(retryMs(tries));
    }
  }

  async function payWith(wallet: Wallet) {
    if (!pay?.vault || short === null || !tier) return;
    setVia(wallet.name); setBusy(`Approve in ${wallet === app ? 'your wallet app' : wallet.name}`); setError(null);
    try {
      const account = await payingAccount(wallet);
      const owed: Quote | null = feeDue ? await quote({ currency }) : null;
      const built = await payInstructions(await holdingsOf(account.address), owed ?? { currency, amount: 0, recipient: '', reference: '', vault: pay.vault, stake: tier.hotbot },
        { stakeRaw: short, fee: feeDue });
      const sent = await sendInstructions(wallet, account, built.instructions, built.tables);
      setBusy('Confirming on Solana');
      for (let status = 'pending'; status !== 'landed';) {
        await wait(LOOK_MS);
        status = await sentStatus(sent.signature, sent.lastValidBlockHeight);
        if (status === 'failed') throw new ConvexError('It failed on chain, and nothing was taken but the network fee. Try again.');
        if (status === 'gone') throw new ConvexError('It didn’t land, and nothing was taken. Try again.');
      }
      if (owed) { setLanded(owed.id); if (!await recorded(owed, sent.signature)) throw new ConvexError(LANDED); }
      else await checkStake({});
      await readHeld(pay.vault);
    } catch (cause) { setError(said(cause)); } finally { setBusy(null); }
  }

  const fee = !pay ? null : feeDue ? pay.fees[currency] : 0, total = cost === null || fee === null ? null : BigInt(fee) + cost;
  const payPage = fallback && qr && typeof window !== 'undefined' ? `${window.location.origin}/pay?id=${qr.id}&ref=${encodeURIComponent(qr.reference)}` : null;
  const scan = scanning ? feeDue ? payPage : stakeLink : null;
  const way: PayWay = wallets.length ? 'wallet' : app ? 'app' : mobile ? 'open' : 'scan';
  // Send it yourself asks for SOL alone (the stake bought on the way), or for the stake in $HOTBOT and the fee in SOL.
  const solFee = pay?.fees.SOL ?? null;
  const ask = !sending || solFee === null ? null : withHotbot ? depositLamports(solFee, null) : currency === 'SOL' && cost !== null ? depositLamports(solFee, cost) : null;
  const send = { available: sendable, open: sending, step: deposit?.step ?? 'waiting', problem: deposit?.problem ?? null, ask, withHotbot, setWithHotbot: (stake: boolean) => { void sendYourself(stake); }, stakeMissing: short, received: vaultLamports, activated: Boolean(deposit?.received),
    arrived: Boolean(deposit?.received) || (vaultLamports ?? 0n) > 0n, vault: pay?.vault ?? null, start: sendYourself, close: () => setSendOpen(false) };
  return { pay, now, tier, held, owedStake, feeDue, settled, currency, setCurrency, fee, cost, costFailed, total, wallets, app, way, scan, payPage, scanning, phone, setPhone, mobile,
    ready: Boolean(pay?.vault) && short !== null && landed === null, busy, via, error, payWith, send };
}
type PayState = ReturnType<typeof usePassPay>;
type Leave = { label: string; run: () => void };
/** An amount as the pay screens show it: one under 0.0001 keeps two significant digits rather than reading 0.0000. */
export function money(currency: PayCurrency, raw: bigint | number) {
  const value = Number(raw) / 10 ** (currency === 'SOL' ? 9 : USDC_DECIMALS);
  return `${value > 0 && value < 1e-4 ? String(Number(value.toPrecision(2))) : amountText(currency, Number(raw))} ${currency}`;
}
const totalText = ({ total, costFailed, fee, currency }: PayState) => total !== null ? money(currency, total) : costFailed && fee !== null ? `${money(currency, fee)} + $HOTBOT` : null;
const pricing = <LoaderCircle size={16} className="animate-spin text-muted-foreground" aria-label="Pricing"/>;

/** SOL or USDC. */
function Currency({ state }: { state: PayState }) {
  return <div className={o.segmented} data-currency role="radiogroup" aria-label="Pay in">{PAY_CURRENCIES.map(item =>
    <button type="button" role="radio" key={item} aria-checked={item === state.currency} disabled={state.busy !== null} onClick={() => state.setCurrency(item)}>{item}</button>)}</div>;
}
/** What is owed, row by row: the $HOTBOT stake at what buying it costs now, and the pass. `total`: the total under them (Account's card;
 *  the pay step shows it as its title). */
function Bill({ state, total = false }: { state: PayState; total?: boolean }) {
  const { tier, owedStake, feeDue, fee, cost, costFailed, currency } = state;
  if (!tier) return null;
  return <div className={s.bill}><div className={s.billRows}><dl>
    {owedStake !== 0n && <div>
      <dt>{tokens(owedStake === null ? tier.hotbot : Number(owedStake) / 10 ** HOTBOT_DECIMALS)} $HOTBOT<InfoTip text={STAKE_WHERE} label="the $HOTBOT stake"/></dt>
      <dd>{costFailed ? 'Market price' : cost === null ? pricing : money(currency, cost)}</dd>
    </div>}
    {feeDue && <div><dt>{tier.days}-day pass</dt><dd>{fee === null ? pricing : money(currency, fee)}</dd></div>}
  </dl>{total && <div className={s.billTotal}><span>Total</span><b>{totalText(state) ?? pricing}</b></div>}</div></div>;
}

/** This device's ways to pay as buttons: the main one (each wallet in this browser, Android's wallet app, or Phantom's own browser on a
 *  phone, where its wallet pays in one tap), then the others side by side, Send it yourself last. A computer with no wallet scans the QR code
 *  instead of a main button. The button at work names the step. `card`: Account's card, which has no Send it yourself. */
function PayButtons({ state, card }: { state: PayState; card?: boolean }) {
  const { way, wallets, app, ready, busy, via, pay, send } = state;
  const size = card ? 'default' : 'lg', className = card ? undefined : o.cta, primary = card ? 'ember' : 'default';
  const making = pay && !pay.vault && pay.recoverable ? 'Setting up your HOTBOT wallet' : null;
  // The browser's wallets, Phantom first: one is one button, two sit side by side, and past two the first has the others behind its arrow.
  const ordered = [...wallets].sort((a, b) => Number(b.name === 'Phantom') - Number(a.name === 'Phantom')), shown = ordered.length === 2 ? ordered : ordered.slice(0, 1);
  const button = (wallet: Wallet, index: number, name = wallet.name) => {
    const working = busy !== null && (via === wallet.name || (index === 0 && !shown.some(item => item.name === via))) ? busy : index === 0 ? making : null;
    return <Button key={wallet.name} size={size} variant={index ? 'outline' : primary} className={className} disabled={!ready || busy !== null} aria-busy={working !== null} onClick={() => void state.payWith(wallet)}>
      {working !== null ? <LoaderCircle className="animate-spin"/> : <img src={wallet.icon} alt="" width={20} height={20}/>}{working ?? `Pay with ${name}`}
    </Button>;
  };
  const open = (name: WalletApp, index: number) => <Button key={name} asChild size={size} variant={index ? 'outline' : primary} className={className}>
    <a href={openInWallet(name, state.payPage ?? undefined)}><img src={WALLET_APPS[name]} alt="" width={20} height={20}/>{index ? name : `Pay with ${name}`}</a></Button>;
  const yourself = send.available && !card ? <Button key="send" size="lg" variant="outline" className={o.cta} disabled={busy !== null} onClick={() => void send.start()}>Send it yourself</Button> : null;
  // A computer offers each way it has: the browser's wallet, the phone's wallet by QR code, and Send it yourself.
  const computer = !card && !state.mobile && (way === 'wallet' || way === 'scan');
  const phoneButton = computer && wallets.length ? <Button key="phone" size="lg" variant="outline" className={o.cta} aria-pressed={state.phone} disabled={busy !== null} onClick={() => state.setPhone(!state.phone)}>
    <Smartphone/>{state.phone ? 'Hide QR code' : 'Pay with phone'}</Button> : null;
  const fromBrowser = ordered.length === 2 ? <div key="wallets" className={o.ctaRow}>{ordered.map((wallet, index) => button(wallet, index))}</div>
    : ordered.length > 2 ? <div key="wallets" className={o.walletPick}>{button(ordered[0]!, 0)}
      <MoreWallets wallets={ordered.slice(1)} mobile={state.mobile} disabled={!ready || busy !== null} pay={wallet => void state.payWith(wallet)}/></div>
    : ordered[0] ? button(ordered[0], 0) : null;
  const [main, ...others] = way === 'wallet' ? [fromBrowser] : way === 'app' && app ? [button(app, 0, 'your wallet app')]
    : way === 'open' ? (Object.keys(WALLET_APPS) as WalletApp[]).map(open) : [null];
  const rest = [...others, ...[phoneButton, yourself].filter(item => item !== null)];
  return <>{main}{rest.length > 1 ? <div className={o.ctaRow}>{rest}</div> : rest}</>;
}

/** The browser's other wallets, behind the arrow beside the first: a menu on a computer, a sheet from the bottom on a phone. */
function MoreWallets({ wallets, mobile, disabled, pay }: { wallets: Wallet[]; mobile: boolean; disabled: boolean; pay: (wallet: Wallet) => void }) {
  const trigger = <Button size="lg" variant="outline" className={`${o.cta} ${o.ctaMore}`} disabled={disabled} aria-label="Other wallets"><ChevronDown/></Button>;
  const label = (wallet: Wallet) => <><img src={wallet.icon} alt="" width={18} height={18}/>{wallet.name}</>;
  if (mobile) return <Sheet><SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent side="bottom" aria-describedby={undefined} className="text-base">
      <SheetHeader className="pt-[0.25em] pb-[0.5em]"><SheetTitle>Pay with</SheetTitle></SheetHeader>
      <div className={s.strategySheet}>{wallets.map(wallet => <SheetClose key={wallet.name} asChild><Button variant="secondary" onClick={() => pay(wallet)}>{label(wallet)}</Button></SheetClose>)}</div>
    </SheetContent></Sheet>;
  return <DropdownMenu><DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[12rem]">{wallets.map(wallet => <DropdownMenuItem key={wallet.name} onSelect={() => pay(wallet)}>{label(wallet)}</DropdownMenuItem>)}</DropdownMenuContent>
  </DropdownMenu>;
}

/** The QR code a phone scans to pay, in its place while its request is made. */
function ScanCode({ value }: { value: string | null }) {
  return <div className={s.payScan} data-scan data-loading={value === null || undefined}>
    {value ? <Qr value={value} label="QR code to pay with your phone"/> : <LoaderCircle className="animate-spin" aria-label="Loading"/>}
  </div>;
}

/** Onboarding's pay step, the first thing after the check: HOTBOT (or the QR code on a computer with no wallet), the total as the title,
 *  what it buys, and the ways to pay. `leave`: the step's way out (another account, or Later). `onDone`: Continue, once it is paid. */
export function PayStep(props: { leave?: Leave; onDone: () => void }) {
  const preview = usePayPreview();
  return preview ? <PayView state={preview} leave={props.leave ?? { label: 'Use another account', run: () => undefined }} onDone={props.onDone}/> : <LivePayStep {...props}/>;
}
function LivePayStep(props: { leave?: Leave; onDone: () => void }) {
  return <PayView state={usePassPay(false)} {...props}/>;
}
function PayView({ state, leave, onDone }: { state: PayState; leave?: Leave; onDone: () => void }) {
  const { pay, settled, busy, error, way, scan, send } = state;
  if (send.open && !settled) return <SendView state={state} leave={leave}/>;
  if (settled && pay) return <div className={o.step} data-pay key="paid">
    <div className={o.crew}><AppFlame size={136}/></div>
    <h1 className={o.payTitle}>You’re all set<small>Your pass runs to {day(pay.paidUntil!)}</small></h1>
    <div className={o.actions}><Button size="lg" className={o.cta} onClick={onDone}>Continue</Button></div>
  </div>;
  const email = pay && !pay.vault && !pay.recoverable;
  const status = busy !== null && (way === 'scan' || way === 'open') ? busy : null;
  return <div className={o.step} data-pay key="pay">
    {state.scanning && !email ? <ScanCode value={scan}/> : <div className={o.crew}><AppFlame size={88}/></div>}
    {email ? <><h1 className={o.payTitle}>Add your email</h1><LinkEmail/></> : <>
      <h1 className={o.payTitle}>{totalText(state) ?? pricing}</h1>
      <Currency state={state}/>
      <Bill state={state}/>
    </>}
    <div className={o.actions}>
      {status && <span className={o.holding} role="status"><LoaderCircle className={o.spin} aria-hidden/>{status}</span>}
      {error && busy === null && <p className={o.inviteError} role="alert">{error}</p>}
      {!email && <PayButtons state={state}/>}
      {leave && <button type="button" className={o.link} disabled={busy !== null} onClick={leave.run}>{leave.label}</button>}
    </div>
  </div>;
}

function LinkEmail() {
  const signIn = useAtomValue(signInAtom);
  const [address, setAddress] = useState(''), [sent, setSent] = useState<string | null>(null), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const email = (sent ?? address).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError(null);
    try { await requestEmailCode(email); setSent(email); setCode(''); } catch (cause) { setError(reason(cause, 'Could not send the code. Try again.')); } finally { setBusy(false); }
  };
  const verify = async (value: string) => {
    if (!signIn || !sent) return;
    setBusy(true); setError(null);
    try { const { signingIn } = await signIn.run('email-code', { email: sent, code: value }); if (!signingIn) throw new Error('Not signed in'); }
    catch (cause) { setCode(''); setError(reason(cause, 'That code didn’t work. Check it or send a new one.')); } finally { setBusy(false); }
  };
  return <div className={o.group}>
    {sent ? <div className={o.emailBox}>
      <p className={o.note}>Enter the code we sent to <b>{sent}</b>.</p>
      <Input className={`${o.field} ${o.code}`} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={'0'.repeat(EMAIL_CODE_DIGITS)} aria-label={`${EMAIL_CODE_DIGITS}-digit code`}
        value={code} disabled={busy} onChange={event => { const next = event.target.value.replace(/\D/g, '').slice(0, EMAIL_CODE_DIGITS); setCode(next); if (next.length === EMAIL_CODE_DIGITS) void verify(next); }}/>
      <div className={o.codeLinks}>
        <button type="button" className={o.link} disabled={busy} onClick={() => void send()}>Send a new code</button>
        <button type="button" className={o.link} disabled={busy} onClick={() => { setError(null); setSent(null); }}>Use another email</button>
      </div>
    </div> : <form className={o.inline} onSubmit={event => void send(event)}>
      <span className={o.fieldSlot}><Input className={o.field} type="email" autoComplete="email" required placeholder="you@example.com" aria-label="Email address" value={address} disabled={busy} onChange={event => setAddress(event.target.value)}/></span>
      <Button type="submit" variant="secondary" size="lg" className={o.inlineButton} disabled={busy || !signIn}>{busy ? 'Sending…' : 'Send code'}</Button>
    </form>}
    {error && <p className={o.inviteError} role="alert">{error}</p>}
  </div>;
}

/** A value to send, copied with one tap; it turns green once copied. `amount`: read larger. */
function CopyField({ value, text, label, amount = false }: { value: string; text: string; label: string; amount?: boolean }) {
  const [copies, setCopies] = useState(0), [fresh, setFresh] = useState(false);
  useEffect(() => { if (!fresh) return; const timer = setTimeout(() => setFresh(false), 1_600); return () => clearTimeout(timer); }, [fresh, copies]);
  return <div className={o.handle} data-found={copies > 0 || undefined} data-amount={amount || undefined} key={copies}>
    <input readOnly className={o.address} value={text} aria-label={label} onFocus={event => event.currentTarget.select()}/>
    <button type="button" className={`${o.paste} ${o.copy}`} aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopies(count => count + 1); setFresh(true); }, () => toast.error('Could not copy'))}>
      <span key={String(fresh)}>{fresh ? <Check aria-hidden/> : <Copy aria-hidden/>}{fresh ? 'Copied' : 'Copy'}</span></button>
  </div>;
}

/** Send it yourself: what to send from any wallet or exchange to the person's own HOTBOT wallet (SOL alone, or their $HOTBOT and SOL), each
 *  value copied with one tap, and where HOTBOT is with it. What is over stays in the HOTBOT wallet. */
function SendView({ state, leave }: { state: PayState; leave?: Leave }) {
  const { send, error, owedStake, tier } = state, { ask, step, problem, vault, withHotbot, arrived } = send;
  const stake = owedStake ?? (tier ? BigInt(tier.hotbot) * 10n ** BigInt(HOTBOT_DECIMALS) : 0n), stakeTokens = Number(stake) / 10 ** HOTBOT_DECIMALS;
  // What is still missing, as the screen can tell: the stake sent in $HOTBOT, and the SOL until the wallet is on chain (the worker says it after).
  const hotbotMissing = withHotbot && send.stakeMissing ? send.stakeMissing : 0n, solMissing = !send.activated && ask !== null && send.received ? ask - send.received : 0n;
  const status = step === 'buying' ? 'Buying your $HOTBOT' : step === 'paying' ? 'Paying your pass'
    : hotbotMissing > 0n && arrived ? hotbotMissing < stake ? `Send ${tokens(Number(hotbotMissing) / 10 ** HOTBOT_DECIMALS)} $HOTBOT more` : 'Waiting for your $HOTBOT'
    : solMissing > 0n ? `Send ${money('SOL', solMissing)} more` : arrived ? 'Received' : 'Waiting for your SOL';
  return <div className={o.step} data-pay key="send">
    <button type="button" className={o.back} onClick={send.close}><ArrowLeft size={15}/>Back</button>
    <div className={o.crew}><AppFlame size={88}/></div>
    <h1 className={o.payTitle}>Send it yourself</h1>
    <div className={o.segmented} data-currency role="radiogroup" aria-label="What you send">
      <button type="button" role="radio" aria-checked={!withHotbot} onClick={() => send.setWithHotbot(false)}>SOL</button>
      <button type="button" role="radio" aria-checked={withHotbot} onClick={() => send.setWithHotbot(true)}>$HOTBOT + SOL</button>
    </div>
    <div className={s.sendFields}>
      {withHotbot && stake > 0n && <CopyField value={String(stakeTokens)} text={`${tokens(stakeTokens)} $HOTBOT`} label="the $HOTBOT amount" amount/>}
      {ask === null ? <div className={o.handle} data-amount>{pricing}</div> : <CopyField value={String(Number(ask) / 1e9)} text={money('SOL', ask)} label="the SOL amount" amount/>}
      {vault && <CopyField value={vault} text={vault} label="your HOTBOT wallet address"/>}
    </div>
    <div className={o.actions}>
      <span className={o.holding} role="status">{arrived || step !== 'waiting' ? <LoaderCircle className={o.spin} aria-hidden/> : <span className={o.livePulse} aria-hidden/>}{status}</span>
      {(problem ?? error) && <p className={o.inviteError} role="alert">{problem ?? error}</p>}
      <Button size="lg" variant="outline" className={o.cta} onClick={send.close}>Pay with a wallet</Button>
      {leave && <button type="button" className={o.link} onClick={leave.run}>{leave.label}</button>}
    </div>
  </div>;
}

/** Account's pass card: the pass and the stake as tiles, then the same bill and way to pay. `onPaid`: it is paid and the stake is in. */
export function PassPay({ renew = false, onPaid }: { renew?: boolean; onPaid?: () => void }) {
  const state = usePassPay(renew), { pay, now, held, settled, busy, error, way, scan } = state;
  useEffect(() => { if (settled) onPaid?.(); }, [settled]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pay) return <LoaderCircle size={18} className={`animate-spin ${s.payCenter}`}/>;
  const access = accessOf({ paidUntil: pay.paidUntil ?? undefined, tier: pay.tier }, held === null ? 0 : Number(held) / 10 ** HOTBOT_DECIMALS, false, now);
  const pending = !pay.vault ? pay.recoverable ? 'Setting up your HOTBOT wallet' : 'Your HOTBOT wallet needs an email' : busy !== null && (way === 'scan' || way === 'open') ? busy : null;
  return <div className={s.deposit}>
    <AccessTiles access={access} now={now}/>
    {!settled && pay.vault && <>
      <Currency state={state}/>
      <Bill state={state} total/>
      {way === 'scan' ? <ScanCode value={scan}/> : <div className={s.accountActions}><PayButtons state={state} card/></div>}
    </>}
    {pending && <div className={s.hotbotWalletPending} role="status"><LoaderCircle size={14} className="animate-spin"/><span className={s.grow}>{pending}</span></div>}
    {error && busy === null && <p className={s.payError} role="alert">{error}</p>}
  </div>;
}

/** Development only: `?pay=<state>` shows the pay step on sample data, with `&way=wallet|app|open|scan` and `&owed=both|fee|stake`. The states:
 *  setup, email, pricing, ready, unpriced, approving, confirming, cancelled, failed, finding, paid, and send (Send it yourself, with
 *  `&step=waiting|received|buying|paying`). */
function usePayPreview(): PayState | null {
  const [query, setQuery] = useState<URLSearchParams | null>(null), [currency, setCurrency] = useState<PayCurrency>('SOL'), [withHotbot, setWithHotbot] = useState(false);
  useEffect(() => {
    const found = new URLSearchParams(window.location.search);
    if (process.env.NODE_ENV === 'development' && found.has('pay')) setQuery(found);
  }, []);
  if (!query) return null;
  const step = query.get('pay') || 'ready', way = (query.get('way') ?? 'wallet') as PayWay, owed = query.get('owed') ?? 'both', sendStep = query.get('step') ?? 'waiting', now = Date.now();
  const tier = ACCESS_TIERS.base, stakeRaw = BigInt(tier.hotbot) * 10n ** BigInt(HOTBOT_DECIMALS), vault = step === 'setup' || step === 'email' ? null : 'HoTBoTVau1tSamp1e1111111111111111111111111';
  const fees = { SOL: 133_333_334, USDC: 20_000_000 }, costs = { SOL: 418_500_000n, USDC: 62_780_000n };
  const feeDue = owed !== 'stake', owedStake = owed === 'fee' ? 0n : stakeRaw, fee = feeDue ? fees[currency] : 0;
  const cost = owedStake === 0n ? 0n : step === 'pricing' || step === 'setup' || step === 'unpriced' ? null : costs[currency];
  // Stand-ins for wallets: the view reads only their names and icons.
  const sample = (name: string, icon: string) => ({ name, icon }) as unknown as Wallet;
  return {
    pay: { tier: 'base', fees, paidUntil: owed === 'stake' || step === 'paid' ? now + 30 * DAY_MS : null, admin: false, vault, held: null, recoverable: step !== 'email', open: null, beforeTeam: true, deposit: null },
    now, tier, held: null, owedStake, feeDue, settled: step === 'paid', currency, setCurrency, fee, cost, costFailed: step === 'unpriced', total: cost === null ? null : BigInt(fee) + cost,
    wallets: way === 'wallet' ? [sample('Phantom', WALLET_APPS.Phantom), sample('Solflare', WALLET_APPS.Solflare), sample('Backpack', WALLET_APPS.Phantom), sample('MetaMask', WALLET_APPS.Solflare)].slice(0, Number(query.get('wallets') ?? 1)) : [], app: way === 'app' ? sample(SolanaMobileWalletAdapterWalletName, WALLET_APPS.Solflare) : undefined,
    way, scan: way === 'scan' && vault && step !== 'pricing' ? `${window.location.origin}/pay?id=sample&ref=${vault}` : null,
    ready: vault !== null, via: null, busy: ({ approving: way === 'app' ? 'Approve in your wallet app' : 'Approve in Phantom', confirming: 'Confirming on Solana', finding: FINDING } as Record<string, string>)[step] ?? null,
    error: ({ cancelled: 'Cancelled. Nothing was taken.', failed: 'It didn’t land, and nothing was taken. Try again.' } as Record<string, string>)[step] ?? null,
    payWith: async () => undefined, payPage: null, mobile: way === 'open' || way === 'app', scanning: way === 'scan' && vault !== null, phone: false, setPhone: () => undefined,
    send: { available: vault !== null && feeDue, open: step === 'send', step: (['buying', 'paying'].includes(sendStep) ? sendStep : 'waiting') as 'waiting' | 'buying' | 'paying', problem: null,
      ask: withHotbot ? 144_000_000n : 560_000_000n, withHotbot, setWithHotbot, stakeMissing: null, received: null, activated: false, arrived: sendStep !== 'waiting', vault,
      start: async () => undefined, close: () => undefined },
  };
}
