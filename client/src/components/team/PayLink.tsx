"use client";
import { useEffect, useState } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { Wallet } from '@wallet-standard/base';
import { Check, LoaderCircle } from 'lucide-react';
import { api, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { AppFlame } from '@/components/hotbot/AppFlame';
import { WALLET_APPS, openInWallet, payingAccount, sendInstructions, sentStatus, usePayingWallets, type WalletApp } from '@/lib/solanaWallets';
import { holdingsOf } from '@/lib/solanaTx';
import { payInstructions, stakeCost } from '@/lib/passPay';
import type { Id } from '@/lib/convex';
import { HOTBOT_DECIMALS } from '../../../../types/access';
import { failure } from './state';
import { tokens } from './AccessGate';
import { CONFIRM_TRIES, money, retryMs } from './PassPay';
import o from './onboarding.module.css';
import s from './team.module.css';

/** How often a sent payment's status is read until it lands. */
const LOOK_MS = 3_000;
const wait = (ms: number) => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, ms); return promise; };
const said = (cause: unknown) => cause instanceof Error && /reject|cancel|denied|declined/i.test(cause.message) ? 'Cancelled. Nothing was taken.' : failure(cause).message;

export function PayLink() {
  const [link, setLink] = useState<{ id: Id<'accessPayments'>; reference: string } | null | undefined>(undefined);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search), id = query.get('id'), reference = query.get('ref');
    setLink(id && reference ? { id: id as Id<'accessPayments'>, reference } : null);
  }, []);
  const quote = useQuery(api.access.payRequest, link ? link : 'skip'), confirm = useAction(api.accessChain.confirmRequest), wallets = usePayingWallets();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [done, setDone] = useState(false), [landed, setLanded] = useState(false);
  const [short, setShort] = useState<bigint | null>(null), [cost, setCost] = useState<bigint | null>(null);
  // What the HOTBOT wallet still needs of the stake, and what buying it costs now.
  useEffect(() => {
    if (!quote) return;
    let live = true;
    const stakeRaw = BigInt(quote.stake) * 10n ** BigInt(HOTBOT_DECIMALS);
    void holdingsOf(quote.vault).then(async vault => {
      const need = (vault.hotbot?.raw ?? 0n) >= stakeRaw ? 0n : stakeRaw - (vault.hotbot?.raw ?? 0n);
      if (!live) return;
      setShort(need);
      setCost(need ? BigInt((await stakeCost(quote.currency, need)).inAmount) : 0n);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payWith(wallet: Wallet) {
    if (!quote || !link || short === null) return;
    setBusy(`Approve in ${wallet.name}`); setError(null);
    try {
      const account = await payingAccount(wallet);
      const built = await payInstructions(await holdingsOf(account.address), quote, { stakeRaw: short, fee: true });
      const sent = await sendInstructions(wallet, account, built.instructions, built.tables);
      setBusy('Confirming on Solana');
      for (let status = 'pending'; status !== 'landed';) {
        await wait(LOOK_MS);
        status = await sentStatus(sent.signature, sent.lastValidBlockHeight);
        if (status === 'failed') throw new ConvexError('It failed on chain, and nothing was taken but the network fee. Try again.');
        if (status === 'gone') throw new ConvexError('It didn’t land, and nothing was taken. Try again.');
      }
      // Recorded once Convex's node holds the transaction, while the quote runs; Pay stays off from here, so it is never paid twice.
      setLanded(true);
      for (let tries = 0; ; tries++) {
        const answer = await confirm({ ...link, signature: sent.signature }).catch(() => false);
        if (answer) break;
        if (Date.now() > quote.expiresAt) throw new ConvexError('Your payment landed. Open HOTBOT: it finds it there, so don’t pay again.');
        if (tries === CONFIRM_TRIES) setBusy('Recording your payment');
        await wait(retryMs(tries));
      }
      setDone(true);
    } catch (cause) { setError(said(cause)); } finally { setBusy(null); }
  }

  const solanaPay = link && typeof window !== 'undefined' ? `solana:${encodeURIComponent(`${window.location.origin}/api/pay?id=${link.id}&ref=${encodeURIComponent(link.reference)}`)}` : null;
  if (done) return <div className={o.step} data-pay>
    <div className={o.crew}><AppFlame size={136}/></div>
    <h1 className={o.payTitle}>Paid<small>Go back to HOTBOT</small></h1>
    <span className={o.holding}><Check size={14} aria-hidden/>Your pass is on</span>
  </div>;
  if (link === null || quote === null) return <div className={o.step} data-pay>
    <div className={o.crew}><AppFlame size={96}/></div>
    <h1 className={o.payTitle}>This link has ended<small>Open HOTBOT for a new one</small></h1>
    <div className={o.actions}><Button size="lg" className={o.cta} asChild><a href="/app">Open HOTBOT</a></Button></div>
  </div>;
  if (!quote) return <div className={o.step} data-pay><LoaderCircle className={o.spin} aria-label="Loading"/></div>;
  const pricing = <LoaderCircle size={16} className="animate-spin text-muted-foreground" aria-label="Pricing"/>, currency = quote.currency;
  const apps = (Object.keys(WALLET_APPS) as WalletApp[]).map((name, index) => <Button key={name} asChild size="lg" variant={index ? 'outline' : 'default'} className={o.cta}>
    <a href={openInWallet(name)}><img src={WALLET_APPS[name]} alt="" width={20} height={20}/>{index ? name : `Pay with ${name}`}</a></Button>);
  return <div className={o.step} data-pay>
    <div className={o.crew}><AppFlame size={88}/></div>
    <h1 className={o.payTitle}>{cost === null ? pricing : money(currency, BigInt(quote.amount) + cost)}</h1>
    <div className={s.bill}><div className={s.billRows}><dl>
      {short !== 0n && <div><dt>{tokens(quote.stake)} $HOTBOT</dt><dd>{cost === null ? pricing : money(currency, cost)}</dd></div>}
      <div><dt>30-day pass</dt><dd>{money(currency, quote.amount)}</dd></div>
    </dl></div></div>
    <div className={o.actions}>
      {error && !busy && <p className={o.inviteError} role="alert">{error}</p>}
      {wallets.length ? wallets.map((wallet, index) => <Button key={wallet.name} size="lg" variant={index ? 'outline' : 'default'} className={o.cta} disabled={busy !== null || short === null || landed} onClick={() => void payWith(wallet)}>
          {busy && index === 0 ? <LoaderCircle className="animate-spin"/> : <img src={wallet.icon} alt="" width={20} height={20}/>}{busy && index === 0 ? busy : `Pay with ${wallet.name}`}</Button>)
        : <>{apps[0]}<div className={o.ctaRow}>{apps.slice(1)}{solanaPay && <Button asChild size="lg" variant="outline" className={o.cta}><a href={solanaPay}>Other wallet</a></Button>}</div></>}
    </div>
  </div>;
}
