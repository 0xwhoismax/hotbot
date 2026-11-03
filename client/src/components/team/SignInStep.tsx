"use client";
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useAtomValue } from 'jotai';
import { ConvexError } from 'convex/values';
import type { Wallet } from '@wallet-standard/base';
import type { FunctionReturnType } from 'convex/server';
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle, Wallet as WalletIcon } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import { requestEmailCode } from '@/lib/emailCode';
import { onWalletsChange, openInWallet, solanaWallets, walletCredentials } from '@/lib/solanaWallets';
import { Button } from '@/components/ui/button';
import { AppFlame } from '@/components/hotbot/AppFlame';
import { Input } from '@/components/ui/input';
import { LAST_SIGN_IN_KEY, currentUserIdAtom } from '@/store/user/atoms';
import { signInAtom } from './state';
import o from './onboarding.module.css';
import { EMAIL_CODE_DIGITS } from '../../../../types/signIn';

type Row = string;
export type Oauth = FunctionReturnType<typeof api.auth.oauthProviders>[number];

const GoogleMark = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"/></svg>;
const AppleMark = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.3 3-2.5a10 10 0 0 0 1.4-2.8 4.3 4.3 0 0 1-2.3-4.2ZM13.9 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg>;
const TelegramMark = () => <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="12" fill="#2AABEE"/><path fill="#fff" d="M5.4 11.8l11.3-4.4c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9Z"/></svg>;
export const OAUTH: Record<Oauth, { name: string; mark: typeof GoogleMark }> = { google: { name: 'Google', mark: GoogleMark }, apple: { name: 'Apple', mark: AppleMark }, telegram: { name: 'Telegram', mark: TelegramMark } };
/** The address of this browser's last email sign-in, kept through sign-out to fill the field. */
const LAST_EMAIL_KEY = 'hotbot-last-email';
type Email = { stage: 'address' | 'code'; address: string; code: string };

/** What went wrong, in the person's words: wallet cancels, expired requests and wrong codes read plainly. */
export function reason(cause: unknown, fallback: string) {
  if (cause instanceof ConvexError && typeof cause.data === 'string') return cause.data;
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/reject|cancel|denied|declined/i.test(message)) return 'Cancelled in your wallet.';
  if (/ERROR_WALLET_NOT_FOUND|wallet not found/i.test(message)) return 'No wallet app found on this phone. Install Phantom or Solflare.';
  return fallback;
}

/** Onboarding's sign-in: one row of Google, Apple and Telegram (each once configured on the deployment), an email code, then detected Solana wallets behind a link (open at once for a browser that last signed in with one).
 *  `check`: Check status's sign-in, under the check's flame: Google, Apple and an email code, with no Telegram and no wallets. `handle`: the X
 *  handle of the application that this browser sent, shown as in before the sign-in. */
export function SignInStep({ title, lead, busy: launching, onBack, check = false, handle }: { title: string; lead: string; busy: boolean; onBack: () => void; check?: boolean; handle?: string }) {
  // A page built before a provider existed skips the server's new provider instead of failing on its missing row.
  const signIn = useAtomValue(signInAtom), challenge = useMutation(api.siws.challenge), oauth = (useQuery(api.auth.oauthProviders, {}) ?? []).filter(provider => Object.hasOwn(OAUTH, provider) && (!check || provider !== 'telegram'));
  const [wallets, setWallets] = useState<readonly Wallet[]>([]), [mobile, setMobile] = useState(false), [walletsOpen, setWalletsOpen] = useState(false);
  const [busy, setBusy] = useState<Row | null>(null), [error, setError] = useState<{ row: Row; text: string } | null>(null);
  const [email, setEmail] = useState<Email>({ stage: 'address', address: '', code: '' }), codeField = useRef<HTMLInputElement>(null), [last, setLast] = useState<Row | null>(null);
  // Wallet extensions register themselves with the page, sometimes after it loads.
  useEffect(() => {
    const update = () => setWallets(solanaWallets());
    update(); setMobile(/iphone|ipad|ipod|android/i.test(navigator.userAgent));
    try {
      const row = localStorage.getItem(LAST_SIGN_IN_KEY); setLast(row);
      if (row === 'email') setEmail(previous => ({ ...previous, address: localStorage.getItem(LAST_EMAIL_KEY) ?? '' }));
      else if (row && !Object.hasOwn(OAUTH, row)) setWalletsOpen(true);
    } catch { /* Storage blocked: no row is marked. */ }
    return onWalletsChange(update);
  }, []);
  const signedIn = Boolean(useAtomValue(currentUserIdAtom)), locked = !signIn || Boolean(busy) || launching || signedIn, walletBusy = wallets.find(wallet => wallet.name === busy);
  const oauthBusy = oauth.find(provider => provider === busy), oauthError = oauth.find(provider => provider === error?.row);

  async function run(row: Row, task: () => Promise<unknown>, fallback: string) {
    if (locked) return;
    setBusy(row); setError(null);
    try {
      await task();
      // An OAuth task ends once the browser is leaving for the provider.
      try {
        localStorage.setItem(LAST_SIGN_IN_KEY, row);
        if (row === 'email') localStorage.setItem(LAST_EMAIL_KEY, email.address.trim().toLowerCase());
      } catch { /* Storage blocked: the next visit marks no row. */ }
    } catch (cause) {
      setError({ row, text: reason(cause, fallback) }); setBusy(null);
      // A wrong code clears so the next one can be typed straight in.
      if (row === 'email') { setEmail(previous => previous.stage === 'code' ? { ...previous, code: '' } : previous); requestAnimationFrame(() => codeField.current?.focus()); }
    }
  }
  const withWallet = (wallet: Wallet) => run(wallet.name, async () => {
    const { signingIn } = await signIn!.run('solana', await walletCredentials(wallet, challenge));
    if (!signingIn) throw new Error('Not signed in');
  }, `Could not sign in with ${wallet.name}. Try again.`);
  // Google, Apple and Telegram leave the page and come back here with a one-time code; the row stays busy until the browser navigates.
  const withOauth = (provider: Oauth) => run(provider, async () => {
    await signIn!.run(provider, { redirectTo: window.location.pathname + window.location.search });
  }, `Could not open ${OAUTH[provider].name}. Try again.`);
  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    const address = email.address.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError({ row: 'email', text: 'Enter a valid email address.' }); return; }
    void run('email', async () => { await requestEmailCode(address); setEmail({ stage: 'code', address, code: '' }); setBusy(null); }, 'Could not send the code. Try again.');
  };
  const verify = (code: string) => run('email', async () => {
    const { signingIn } = await signIn!.run('email-code', { email: email.address.trim().toLowerCase(), code });
    if (!signingIn) throw new Error('Not signed in');
  }, 'That code didn’t work. Check it or send a new one.');
  const typeCode = (value: string) => {
    const code = value.replace(/\D/g, '').slice(0, EMAIL_CODE_DIGITS);
    setEmail(previous => ({ ...previous, code }));
    if (code.length === EMAIL_CODE_DIGITS) void verify(code);
  };
  const failure = (row?: Row) => row && error?.row === row && <p className={o.inviteError} role="alert">{error.text}</p>;
  const lastUsed = (row: Row) => last === row && <span className={o.lastUsed}>Last used</span>;
  return <div className={o.step} data-pay={check || undefined} key={check ? 'check' : 'signin'}>
    <button type="button" className={o.back} onClick={onBack} disabled={Boolean(busy) || launching}><ArrowLeft size={15}/>Back</button>
    {check ? <>
      <div className={o.crew}><AppFlame size={136}/></div>
      {handle && <span className={o.livePill} data-on><Check size={14} aria-hidden/>@{handle}</span>}
      <h1 className={o.payTitle}>{title}<small role="status">{oauthBusy ? `Opening ${OAUTH[oauthBusy].name}…` : lead}</small></h1>
    </> : <>
      <h1 className={o.title}>{title}</h1>
      <p className={o.lead} role="status">{launching ? 'Starting your team…' : walletBusy ? `Approve the message in ${walletBusy.name}.` : oauthBusy ? `Opening ${OAUTH[oauthBusy].name}…` : lead}</p>
    </>}

    <div className={`${o.signinRows} ${o.group}`}>
      {oauth.length > 0 && <div className={o.social} role="group" aria-label="Account">
        {oauth.map(provider => { const { name, mark: Mark } = OAUTH[provider]; return <Button key={provider} variant="outline" size="lg" className={o.socialButton} disabled={locked && busy !== provider} aria-busy={busy === provider} onClick={() => void withOauth(provider)}>
          {busy === provider ? <LoaderCircle className={o.spin} aria-hidden/> : <Mark/>}<span className={o.socialName}>{name}</span>
          {lastUsed(provider)}
        </Button>; })}
      </div>}
      {failure(oauthError)}

      {(oauth.length > 0 || !check) && <div className={o.or}>or</div>}
      {email.stage === 'address'
        ? <form className={o.inline} onSubmit={sendCode}>
          <span className={o.fieldSlot}>
            <Input className={o.field} type="email" autoComplete="email" required placeholder="you@example.com" aria-label="Email address" value={email.address} disabled={busy === 'email'} onChange={event => setEmail(previous => ({ ...previous, address: event.target.value }))}/>
            {lastUsed('email')}
          </span>
          <Button type="submit" variant="secondary" size="lg" className={o.inlineButton} disabled={locked}>{busy === 'email' ? 'Sending…' : 'Send code'}</Button>
        </form>
        : <div className={o.emailBox}>
          <p className={o.note}>Enter the code we sent to <b>{email.address}</b>.</p>
          <Input ref={codeField} className={`${o.field} ${o.code}`} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={'0'.repeat(EMAIL_CODE_DIGITS)} aria-label={`${EMAIL_CODE_DIGITS}-digit code`} value={email.code} disabled={busy === 'email'} onChange={event => typeCode(event.target.value)}/>
          <div className={o.codeLinks}>
            <button type="button" className={o.link} disabled={locked} onClick={() => sendCode()}>Send a new code</button>
            <button type="button" className={o.link} disabled={Boolean(busy)} onClick={() => { setError(null); setEmail({ stage: 'address', address: email.address, code: '' }); }}>Use another email</button>
          </div>
        </div>}
      {failure('email')}
      {!check && (walletsOpen
        ? <>
          <div className={o.signinRows} role="group" aria-label="Solana wallet">
            {wallets.map(wallet => <Fragment key={wallet.name}>
              <Button variant="outline" size="lg" className={o.inlineButton} disabled={locked && busy !== wallet.name} aria-busy={busy === wallet.name} onClick={() => void withWallet(wallet)}>
                {busy === wallet.name ? <LoaderCircle className={o.spin} aria-hidden/> : <img className={o.walletMark} src={wallet.icon} alt=""/>}{wallet.name}
                {lastUsed(wallet.name)}
              </Button>
              {failure(wallet.name)}
            </Fragment>)}
            {!wallets.length && <Button asChild variant="outline" size="lg" className={o.inlineButton}><a href={mobile ? openInWallet('Phantom') : 'https://phantom.com/download'} target={mobile ? undefined : '_blank'} rel="noreferrer">
              <WalletIcon aria-hidden/>{mobile ? 'Open HOTBOT in Phantom' : <>No Solana wallet found<span className={o.optionAside}>Get Phantom</span></>}<ArrowUpRight aria-hidden/>
            </a></Button>}
          </div>
        </>
        : <button type="button" className={`${o.link} ${o.walletLink}`} disabled={locked} onClick={() => setWalletsOpen(true)}>Use a Solana wallet</button>)}
    </div>
    <p className={o.legalLinks}><a href="/terms" target="_blank" rel="noreferrer">Terms</a><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p>
  </div>;
}
