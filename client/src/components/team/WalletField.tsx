"use client";
import { useEffect, useState } from 'react';
import { ClipboardPaste, LoaderCircle, Wallet } from 'lucide-react';
import { formatNumber } from '@/utils/formatterUtils';
import { isSolanaAddress } from '../../../../types/application';
import o from './onboarding.module.css';

/** Reads the clipboard into the field; where the browser won't, the field takes focus for a normal paste. */
export function Paste({ onPaste }: { onPaste: (text: string) => void }) {
  return <button type="button" className={o.paste} onClick={async event => {
    const field = event.currentTarget.parentElement?.querySelector('input');
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) onPaste(text); else field?.focus(); } catch { field?.focus(); }
  }}><ClipboardPaste aria-hidden/>Paste</button>;
}

/** Reads a wallet through the website (src/app/api/wallet-balance/route.ts), which limits reads per network. */
async function readBalances(address: string) {
  const response = await fetch('/api/wallet-balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Couldn’t read this wallet right now. Try again.');
  return await response.json() as { hotbot: number; sol: number };
}

type Read = { address: string } & ({ state: 'reading' } | { state: 'read'; hotbot: number; sol: number } | { state: 'failed'; message: string });
/** A wallet that holds $HOTBOT, as the application and the pass's pay step ask it. A full address is read at once and its $HOTBOT shown,
 *  the one given at first too, unless HOTBOT read it already (`seed`); it shows as holding from `need` tokens (any by default). `onRead`
 *  hears each wallet read (null while none is). */
export function WalletField({ value, onChange, invalid, errorId, onRead, need = Number.MIN_VALUE, seed }: { value: string; onChange: (value: string) => void; invalid: boolean; errorId?: string;
  onRead?: (read: { address: string; hotbot: number } | null) => void; need?: number; seed?: { address: string; hotbot: number } }) {
  const [read, setRead] = useState<Read | null>(seed ? { ...seed, state: 'read', sol: 0 } : null);
  const take = (text: string) => {
    onChange(text);
    const address = text.trim();
    if (!isSolanaAddress(address) || (read?.address === address && read.state !== 'failed')) return;
    setRead({ address, state: 'reading' });
    const settle = (next: Read) => setRead(current => current?.address === address ? next : current);
    readBalances(address).then(balances => settle({ address, state: 'read', ...balances }), error => settle({ address, state: 'failed', message: error instanceof Error ? error.message : 'Couldn’t read this wallet right now. Try again.' }));
  };
  useEffect(() => { if (value) take(value); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = read?.address === value.trim() ? read : null, holds = shown?.state === 'read' && shown.hotbot >= need;
  useEffect(() => { onRead?.(shown?.state === 'read' ? { address: shown.address, hotbot: shown.hotbot } : null); }, [shown?.state, shown?.address]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <div className={o.handle} data-invalid={invalid || undefined} data-filled={value ? true : undefined} data-found={holds || undefined}>
      <Wallet aria-hidden/>
      <input data-autofocus className={o.address} value={value} onChange={event => take(event.target.value)} placeholder="Paste your wallet" aria-label="Your wallet address" aria-invalid={invalid || undefined} aria-describedby={errorId}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" maxLength={60}/>
      {!value && <Paste onPaste={take}/>}
    </div>
    {shown ? <span className={o.holding} data-tone={holds ? 'positive' : undefined} role="status">
      {shown.state === 'reading' ? <><LoaderCircle className={o.spin} aria-hidden/>Reading wallet</>
        : shown.state === 'failed' ? shown.message
        : shown.hotbot > 0 ? <span>My wallet holds <b>{formatNumber(shown.hotbot, { compact: true })} $HOTBOT</b></span> : 'No $HOTBOT in this wallet'}
    </span> : <small className={o.holding}>Solana only</small>}
  </>;
}
