"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { useAtomValue } from 'jotai';
import { ConvexError } from 'convex/values';
import type { Wallet } from '@wallet-standard/base';
import { ArrowLeft, ArrowRight, ArrowUpRight, LoaderCircle, Mail, Wallet as WalletIcon } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import { onWalletsChange, solanaWallets, walletCredentials } from '@/lib/solanaWallets';
import { Button } from '@/components/ui/button';
import { signInAtom } from './state';
import o from './onboarding.module.css';

type Row = string;
type Oauth = 'google' | 'apple';

const GoogleMark = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"/></svg>;
const AppleMark = () => <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.3 3-2.5a10 10 0 0 0 1.4-2.8 4.3 4.3 0 0 1-2.3-4.2ZM13.9 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg>;
const OAUTH: Record<Oauth, { name: string; mark: typeof GoogleMark }> = { google: { name: 'Google', mark: GoogleMark }, apple: { name: 'Apple', mark: AppleMark } };
type Email = { stage: 'closed' | 'address' | 'code'; address: string; code: string };

/** What went wrong, in the person's words: wallet cancels, expired requests and wrong codes read plainly. */
function reason(cause: unknown, fallback: string) {
  if (cause instanceof ConvexError && typeof cause.data === 'string') return cause.data;
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/reject|cancel|denied|declined/i.test(message)) return 'Cancelled in your wallet.';
  if (/ERROR_WALLET_NOT_FOUND|wallet not found/i.test(message)) return 'No wallet app found on this phone. Install Phantom or Solflare.';
  return fallback;
}

/** Onboarding's sign-in: detected Solana wallets, Google or Apple (once configured on the deployment) or a 6-digit email code (X comes later). Same column and rows as the other steps. */
export function SignInStep({ title, lead, busy: launching, onBack }: { title: string; lead: string; busy: boolean; onBack: () => void }) {
  const signIn = useAtomValue(signInAtom), challenge = useMutation(api.siws.challenge), oauth = useQuery(api.auth.oauthProviders, {}) ?? [];
  const [wallets, setWallets] = useState<readonly Wallet[]>([]), [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState<Row | null>(null), [error, setError] = useState<{ row: Row; text: string } | null>(null);
  const [email, setEmail] = useState<Email>({ stage: 'closed', address: '', code: '' }), codeField = useRef<HTMLInputElement>(null);
  // Wallet extensions register themselves with the page, sometimes after it loads.
  useEffect(() => {
    const update = () => setWallets(solanaWallets());
    update(); setMobile(/iphone|ipad|ipod|android/i.test(navigator.userAgent));
    return onWalletsChange(update);
  }, []);
  const locked = !signIn || Boolean(busy) || launching, walletBusy = wallets.find(wallet => wallet.name === busy);

  async function run(row: Row, task: () => Promise<unknown>, fallback: string) {
    if (locked) return;
    setBusy(row); setError(null);
    try { await task(); }
    catch (cause) {
      setError({ row, text: reason(cause, fallback) }); setBusy(null);
      // A wrong code clears so the next one can be typed straight in.
      if (row === 'email') { setEmail(previous => previous.stage === 'code' ? { ...previous, code: '' } : previous); requestAnimationFrame(() => codeField.current?.focus()); }
    }
  }
  const withWallet = (wallet: Wallet) => run(wallet.name, async () => {
    const { signingIn } = await signIn!.run('solana', await walletCredentials(wallet, challenge));
    if (!signingIn) throw new Error('Not signed in');
  }, `Could not sign in with ${wallet.name}. Try again.`);
  // Google and Apple leave the page and come back here with a one-time code; the row stays busy until the browser navigates.
  const withOauth = (provider: Oauth) => run(provider, async () => {
    await signIn!.run(provider, { redirectTo: window.location.pathname + window.location.search });
  }, `Could not open ${OAUTH[provider].name}. Try again.`);
  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    const address = email.address.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError({ row: 'email', text: 'Enter a valid email address.' }); return; }
    void run('email', async () => { await signIn!.run('email-code', { email: address }); setEmail({ stage: 'code', address, code: '' }); setBusy(null); }, 'Could not send the code. Try again.');
  };
  const verify = (code: string) => run('email', async () => {
    const { signingIn } = await signIn!.run('email-code', { email: email.address.trim().toLowerCase(), code });
    if (!signingIn) throw new Error('Not signed in');
  }, 'That code didn’t work. Check it or send a new one.');
  const typeCode = (value: string) => {
    const code = value.replace(/\D/g, '').slice(0, 6);
    setEmail(previous => ({ ...previous, code }));
    if (code.length === 6) void verify(code);
  };
  const failure = (row: Row) => error?.row === row && <p className={o.warn} role="alert">{error.text}</p>;
  const spinner = (row: Row) => busy === row ? <LoaderCircle className={o.spin} aria-hidden/> : <ArrowRight className={o.go} aria-hidden/>;
  const openIn = typeof window === 'undefined' ? '' : `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;

  return <div className={o.step} key="signin">
    <button type="button" className={o.back} onClick={onBack} disabled={Boolean(busy) || launching}><ArrowLeft size={15}/>Back</button>
    <h1 className={o.title}>{title}</h1>
    <p className={o.lead} role="status">{launching ? 'Starting your team…' : walletBusy ? `Approve the message in ${walletBusy.name}.` : lead}</p>

    <div className={`${o.label} ${o.group}`} id="signin-wallets">Solana wallet</div>
    <div className={o.signinRows} role="group" aria-labelledby="signin-wallets">
      {wallets.map(wallet => <div key={wallet.name}>
        <button type="button" className={o.option} disabled={locked && busy !== wallet.name} aria-busy={busy === wallet.name} onClick={() => void withWallet(wallet)}>
          <span className={`${o.icon} ${o.brand}`}><img src={wallet.icon} alt=""/></span>
          <span className={o.optionText}><strong>{wallet.name}</strong><span>{busy === wallet.name ? 'Waiting for your wallet…' : 'Sign a message to prove it’s yours'}</span></span>
          {spinner(wallet.name)}
        </button>
        {failure(wallet.name)}
      </div>)}
      {!wallets.length && <a className={o.option} href={mobile ? openIn : 'https://phantom.com/download'} target={mobile ? undefined : '_blank'} rel="noreferrer">
        <span className={`${o.icon} ${o.neutral}`}><WalletIcon/></span>
        <span className={o.optionText}><strong>{mobile ? 'Open HOTBOT in Phantom' : 'No Solana wallet found'}</strong><span>{mobile ? 'Sign in from your wallet’s browser' : 'Get Phantom, then come back to this page'}</span></span>
        <ArrowUpRight className={o.go} aria-hidden/>
      </a>}
    </div>

    <div className={`${o.label} ${o.group}`} id="signin-email">{oauth.length ? 'Account' : 'Email'}</div>
    <div className={o.signinRows} role="group" aria-labelledby="signin-email">
      {oauth.map(provider => { const { name, mark: Mark } = OAUTH[provider]; return <div key={provider}>
        <button type="button" className={o.option} disabled={locked && busy !== provider} aria-busy={busy === provider} onClick={() => void withOauth(provider)}>
          <span className={`${o.icon} ${o.neutral}`}><Mark/></span>
          <span className={o.optionText}><strong>Continue with {name}</strong><span>{busy === provider ? `Opening ${name}…` : `Use your ${name} account`}</span></span>
          {spinner(provider)}
        </button>
        {failure(provider)}
      </div>; })}
      <div>
        {email.stage === 'closed'
          ? <button type="button" className={o.option} disabled={locked} onClick={() => setEmail(previous => ({ ...previous, stage: 'address' }))}>
            <span className={`${o.icon} ${o.neutral}`}><Mail/></span>
            <span className={o.optionText}><strong>Continue with email</strong><span>We’ll send you a 6-digit code</span></span>
            <ArrowRight className={o.go} aria-hidden/>
          </button>
          : <div className={o.emailBox}>
            {email.stage === 'address'
              ? <form className={o.inline} onSubmit={sendCode}>
                <input className={o.field} type="email" autoComplete="email" autoFocus required placeholder="you@example.com" aria-label="Email address" value={email.address} disabled={busy === 'email'} onChange={event => setEmail(previous => ({ ...previous, address: event.target.value }))}/>
                <Button type="submit" size="lg" className={o.inlineButton} disabled={locked}>{busy === 'email' ? 'Sending…' : 'Send code'}</Button>
              </form>
              : <>
                <p className={o.note}>Enter the code we sent to <b>{email.address}</b>.</p>
                <input ref={codeField} className={`${o.field} ${o.code}`} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" aria-label="6-digit code" maxLength={6} value={email.code} disabled={busy === 'email'} onChange={event => typeCode(event.target.value)}/>
                <div className={o.codeLinks}>
                  <button type="button" className={o.link} disabled={locked} onClick={() => sendCode()}>Send a new code</button>
                  <button type="button" className={o.link} disabled={Boolean(busy)} onClick={() => { setError(null); setEmail({ stage: 'address', address: email.address, code: '' }); }}>Use another email</button>
                </div>
              </>}
          </div>}
        {failure('email')}
      </div>
    </div>
  </div>;
}
