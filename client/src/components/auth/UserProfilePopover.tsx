"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAction, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useAtom, useAtomValue } from 'jotai';
import type { Wallet as WalletApp } from '@wallet-standard/base';
import { ArrowUpRight, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, useQuery, type Id } from '@/lib/convex';
import { requestEmailCode } from '@/lib/emailCode';
import { onWalletsChange, solanaWallets, walletCredentials } from '@/lib/solanaWallets';
import { userStateAtom } from '@/store/user/atoms';
import { PriceDisplaySettings } from '@/components/account/PriceDisplaySettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emailRevealedAtom, failToast, logoutAtom, signInAtom } from '@/components/team/state';
import { OAUTH, reason, type Oauth } from '@/components/team/SignInStep';
import { Hint } from '@/components/team/Parts';
import { TwoFactorButton } from '@/components/team/TwoFactor';
import s from '@/components/team/team.module.css';
import { EMAIL_CODE_DIGITS, RECENT_SIGN_IN_MS } from '../../../../types/signIn';

const NAME: Record<string, string> = { solana: 'Solana wallet', 'email-code': 'Email', google: 'Google', apple: 'Apple', telegram: 'Telegram' };
/** Email, Google and Apple show an address, hidden until asked. */
const SHOWS_EMAIL = ['email-code', 'google', 'apple'];
/** The OAuth add that left for the provider: its verifier, which the return's code must match (`signInMethods.claimOAuth`). Local storage, so a return in
 *  another tab of this browser still finds it. */
const LINK_KEY = 'hotbot-link';
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;
const needsConfirm = (cause: unknown) => /Confirm it’s you/.test(cause instanceof ConvexError ? JSON.stringify(cause.data) : String(cause));

/** Account controls portalled into the Account page by AccountRuntime: how you sign in, then wallet and display settings. The email hides again when the page closes. */
export function UserProfilePopoverContent() {
  const [, setRevealed] = useAtom(emailRevealedAtom);
  useEffect(() => () => setRevealed(false), [setRevealed]);
  return <>
    <SignInMethods/>
    <PriceDisplaySettings/>
  </>;
}

function MethodIcon({ provider }: { provider: string }) {
  const oauth = OAUTH[provider as Oauth];
  return <span className={s.signInIcon}>{oauth ? <oauth.mark/> : provider === 'solana' ? <Wallet/> : <Mail/>}</span>;
}

function SignInMethods() {
  const profile = useAtomValue(userStateAtom).profileData, methods = profile?.methods ?? [], signIn = useAtomValue(signInAtom), logout = useAtomValue(logoutAtom);
  const [revealed, setRevealed] = useAtom(emailRevealedAtom), [now, setNow] = useState(() => Date.now());
  // The session's age as the server read it, counted on from when it arrived, so a wrong device clock doesn't matter.
  const [since, setSince] = useState<{ age: number; at: number } | null>(null);
  useEffect(() => { setSince(profile?.signedInFor == null ? null : { age: profile.signedInFor, at: Date.now() }); }, [profile?.signedInFor]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const recent = since !== null && RECENT_SIGN_IN_MS - since.age - (now - since.at) > 0;
  // A remove outside the recent window waits here while the person confirms.
  const [confirming, setConfirming] = useState<{ accountId: string; provider: string } | null>(null), confirm = confirming !== null && !recent;
  const remove = useMutation(api.signInMethods.remove), claim = useMutation(api.signInMethods.claimOAuth), start = useAction(api.auth.signIn);
  const oauth = (useQuery(api.auth.oauthProviders, {}) ?? []).filter(provider => Object.hasOwn(OAUTH, provider) && !methods.some(method => method.provider === provider));
  const [adding, setAdding] = useState<'wallet' | 'email' | null>(null), [busy, setBusy] = useState<string | null>(null);
  const email = methods.find(method => method.provider === 'email-code')?.id, wallets = methods.filter(method => method.provider === 'solana').map(method => method.id);
  const run = async (row: string, task: () => Promise<unknown>) => { setBusy(row); try { await task(); } catch (cause) { failToast(cause); } finally { setBusy(null); } };
  const claimed = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), code = params.get('code');
    if (!params.has('link') || claimed.current) return;
    claimed.current = true;
    let left: { provider: Oauth; verifier: string } | null = null;
    try { left = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null'); localStorage.removeItem(LINK_KEY); } catch { /* storage blocked: nothing to match */ }
    window.history.replaceState(null, '', window.location.pathname);
    if (!code || !left) { toast.error('That sign-in didn’t finish. Add it again.'); return; }
    const name = OAUTH[left.provider]?.name ?? 'Sign-in';
    void claim({ code, verifier: left.verifier }).then(() => toast.success(`${name} added`), failToast);
  }, [claim]); // eslint-disable-line react-hooks/exhaustive-deps
  const addOauth = (provider: Oauth) => run(provider, async () => {
    const left = await start({ provider, params: { redirectTo: '/app/account?link' } });
    if (!left.redirect || !left.verifier) throw new Error(`Could not open ${OAUTH[provider].name}. Try again.`);
    localStorage.setItem(LINK_KEY, JSON.stringify({ provider, verifier: left.verifier }));
    window.location.href = left.redirect;
    // The row stays busy until the browser leaves.
    await new Promise(() => {});
  });
  const askConfirm = (accountId: string, provider: string) => { setAdding(null); setConfirming({ accountId, provider }); };
  const drop = (accountId: string, provider: string) => run(accountId, async () => {
    if (!recent) { askConfirm(accountId, provider); return; }
    try { await remove({ accountId: accountId as Id<'authAccounts'> }); } catch (cause) {
      if (!needsConfirm(cause)) throw cause;
      // The server's refusal wins over the card's count.
      setSince({ age: RECENT_SIGN_IN_MS, at: Date.now() }); askConfirm(accountId, provider); return;
    }
    toast.success(`${NAME[provider] ?? 'Sign-in'} removed`);
  });
  useEffect(() => {
    if (!recent || !confirming) return;
    setConfirming(null);
    void drop(confirming.accountId, confirming.provider);
  }, [recent, confirming]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasEmail = methods.some(method => SHOWS_EMAIL.includes(method.provider));
  return <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="sign-in-title">
    <div className={s.accountCardHead}>
      <span className={s.accountIcon}><KeyRound size={18}/></span>
      <div className={s.grow}><h2 id="sign-in-title">Sign-in methods</h2></div>
      <span className={s.twoFactorHead}><TwoFactorButton/></span>
      {hasEmail && <Button variant="ghost" size="icon" aria-label={revealed ? 'Hide email' : 'Show email'} aria-pressed={revealed} onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff/> : <Eye/>}</Button>}
    </div>
    <div className={s.rows}>{methods.map(method => <div className={`${s.row} ${s.signInRow}`} key={method.accountId}>
      <MethodIcon provider={method.provider}/>
      <span className={s.grow}><b>{NAME[method.provider] ?? method.provider}</b>
        <small title={method.provider === 'solana' ? method.id : undefined}>{method.provider === 'solana' ? short(method.id) : SHOWS_EMAIL.includes(method.provider) && !revealed ? '****' : method.id}</small></span>
      {methods.length > 1 && <Button size="icon-sm" variant="ghost" disabled={Boolean(busy)} aria-label={`Remove ${NAME[method.provider] ?? method.provider}`} onClick={() => void drop(method.accountId, method.provider)}>
        {busy === method.accountId ? <LoaderCircle className="animate-spin"/> : <X/>}
      </Button>}
    </div>)}</div>
    {confirm ? <div className={s.signInAdd} role="group" aria-labelledby="sign-in-confirm">
      <span className={s.signInConfirm}><Hint text="Removing a way to sign in needs a recent sign-in, so a session left open can’t take one off your account. Confirm with a way you already use."><span id="sign-in-confirm">Confirm it’s you</span></Hint></span>
      {wallets.length > 0 && <Button size="sm" variant="outline" aria-pressed={adding === 'wallet'} disabled={!signIn} onClick={() => setAdding(adding === 'wallet' ? null : 'wallet')}><Wallet/>Wallet</Button>}
      {email && <Button size="sm" variant="outline" aria-pressed={adding === 'email'} disabled={!signIn} onClick={() => setAdding(adding === 'email' ? null : 'email')}><Mail/>Email</Button>}
      {!wallets.length && !email && logout && <Button size="sm" variant="outline" onClick={() => void logout.run()}>Sign in again</Button>}
      <Button size="sm" variant="ghost" onClick={() => { setAdding(null); setConfirming(null); }}>Cancel</Button>
      <span className={s.twoFactorFoot}><TwoFactorButton/></span>
    </div> : <div className={s.signInAdd} role="group" aria-label="Add a way to sign in">
      {!email && <Button size="sm" variant="outline" aria-pressed={adding === 'email'} disabled={!signIn} onClick={() => setAdding(adding === 'email' ? null : 'email')}><Mail/>Email</Button>}
      {oauth.map(provider => { const { name, mark: Mark } = OAUTH[provider]; return <Button key={provider} size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void addOauth(provider)}>
        {busy === provider ? <LoaderCircle className="animate-spin"/> : <Mark/>}{name}
      </Button>; })}
      <span className={s.twoFactorFoot}><TwoFactorButton/></span>
    </div>}
    {confirm && adding === 'wallet' && <ConfirmWallet known={wallets} onDone={() => setAdding(null)}/>}
    {adding === 'email' && <AddEmail email={confirm ? email : undefined} onDone={() => setAdding(null)}/>}
  </section>;
}

/** The wallets this browser has; signing the message with one already on the account confirms it's you. */
function ConfirmWallet({ known, onDone }: { known: string[]; onDone: () => void }) {
  const signIn = useAtomValue(signInAtom), challenge = useMutation(api.siws.challenge);
  const [wallets, setWallets] = useState<readonly WalletApp[]>([]), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { const update = () => setWallets(solanaWallets()); update(); return onWalletsChange(update); }, []);
  const confirmWith = async (wallet: WalletApp) => {
    if (!signIn || busy) return;
    setBusy(wallet.name); setError(null);
    try {
      const credentials = await walletCredentials(wallet, challenge, known), { signingIn } = await signIn.run('solana', credentials);
      if (!signingIn) throw new Error('Not signed in');
      toast.success('Confirmed'); onDone();
    } catch (cause) { setError(reason(cause, `Could not confirm with ${wallet.name}. Try again.`)); } finally { setBusy(null); }
  };
  return <div className={s.rows}>
    {wallets.map(wallet => <button type="button" key={wallet.name} className={s.row} disabled={Boolean(busy)} onClick={() => void confirmWith(wallet)}>
      <span className={s.signInIcon}><img src={wallet.icon} alt=""/></span>
      <span className={s.grow}><b>{wallet.name}</b>{busy === wallet.name && <small>Approve the message in {wallet.name}</small>}</span>
      {busy === wallet.name && <LoaderCircle className="animate-spin" size={16}/>}
    </button>)}
    {!wallets.length && <a className={s.row} href="https://phantom.com/download" target="_blank" rel="noreferrer">
      <span className={s.signInIcon}><Wallet/></span><span className={s.grow}><b>No Solana wallet found</b></span><ArrowUpRight size={16}/>
    </a>}
    {error && <p className={s.warnText} role="alert">{error}</p>}
  </div>;
}

/** An address, then the code sent to it; the code adds the email. With the account's own `email`, the code confirms it's you. */
function AddEmail({ email: own, onDone }: { email?: string; onDone: () => void }) {
  const signIn = useAtomValue(signInAtom), revealed = useAtomValue(emailRevealedAtom);
  const [address, setAddress] = useState(own ?? ''), [code, setCode] = useState(''), [sent, setSent] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const email = address.trim().toLowerCase();
    if (!signIn || busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (!busy) setError('Enter a valid email address.'); return; }
    setBusy(true); setError(null);
    try { await requestEmailCode(email); setSent(email); setCode(''); }
    catch (cause) { setError(reason(cause, 'Could not send the code. Try again.')); } finally { setBusy(false); }
  };
  const verify = async (value: string) => {
    if (!signIn || !sent) return;
    setBusy(true); setError(null);
    try {
      const { signingIn } = await signIn.run('email-code', { email: sent, code: value });
      if (!signingIn) throw new Error('Not signed in');
      toast.success(own ? 'Confirmed' : 'Email added'); onDone();
    } catch (cause) { setCode(''); setError(reason(cause, 'That code didn’t work. Check it or send a new one.')); } finally { setBusy(false); }
  };
  return <div className={s.signInEmail}>
    {sent ? <form className={s.signInEmailRow} onSubmit={event => { event.preventDefault(); if (code.length === EMAIL_CODE_DIGITS) void verify(code); }}>
      <Input inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={`${EMAIL_CODE_DIGITS}-digit code`} aria-label={`Code sent to ${sent}`} value={code} disabled={busy}
        onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, EMAIL_CODE_DIGITS))}/>
      <Button type="submit" size="sm" disabled={busy || code.length !== EMAIL_CODE_DIGITS}>{busy ? <LoaderCircle className="animate-spin"/> : null}Confirm</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void send()}>New code</Button>
    </form> : <form className={s.signInEmailRow} onSubmit={send}>
      {own ? <span className={s.signInOwnEmail}>{revealed ? own : '****'}</span>
        : <Input type="email" autoComplete="email" autoFocus placeholder="you@example.com" aria-label="Email address" value={address} disabled={busy} onChange={event => setAddress(event.target.value)}/>}
      <Button type="submit" size="sm" disabled={busy}>{busy ? <LoaderCircle className="animate-spin"/> : null}Send code</Button>
    </form>}
    {error && <p className={s.warnText} role="alert">{error}</p>}
  </div>;
}
