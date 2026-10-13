"use client";
import { useRef, useState, type ComponentProps } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@/lib/convex';
import { isSolanaMint } from '@/services/solanaTokenSearch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
interface Props { open: boolean; onOpenChange: (open: boolean) => void; balance: number | null; solPrice: number | null; onSuccess?: () => void; onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus']; }
export function SendSolModal({ open, onOpenChange, balance, solPrice, onSuccess, onCloseAutoFocus }: Props) {
  const transfer = useAction(api.actions.trading.transferSol);
  const [recipient, setRecipient] = useState(''), [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false), locked = useRef(false);
  const [result, setResult] = useState<{ signature: string; status: 'pending' | 'confirmed' | 'failed' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount), max = balance === null ? null : Math.max(0, balance - 0.005);
  const valid = max !== null && Number.isFinite(value) && value >= 0.0001 && value <= max && isSolanaMint(recipient);
  const disabled = sending;
  async function send() {
    if (!valid || locked.current || disabled) return;
    locked.current = true; setSending(true); setError(null);
    try { const sent = await transfer({ recipientAddress: recipient, amountSol: value }); setResult(sent); onSuccess?.(); }
    catch (cause) {
      if (cause instanceof ConvexError && typeof cause.data === 'string') setError(cause.data);
      else { setError('Transfer status is unknown. Check wallet activity before sending again.'); }
    } finally { locked.current = false; setSending(false); }
  }
  const close = () => { if (sending) return; setRecipient(''); setAmount(''); setResult(null); setError(null); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={next => next ? onOpenChange(true) : close()}>
    <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader><DialogTitle>Send SOL</DialogTitle><DialogDescription>Withdraw from your Solana execution wallet. Leave 0.005 SOL for network fees.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor="send-recipient">Recipient address</Label><Input id="send-recipient" autoComplete="off" spellCheck={false} value={recipient} disabled={disabled} onChange={event => setRecipient(event.target.value.trim())} /></div>
      <div className="space-y-2"><Label htmlFor="send-amount">Amount in SOL</Label><Input id="send-amount" type="number" min="0.0001" step="0.0001" value={amount} disabled={disabled} onChange={event => setAmount(event.target.value)} />
        <Button variant="outline" disabled={disabled || max === null} onClick={() => setAmount((Math.floor(max! * 1e6) / 1e6).toFixed(6))}>Max</Button></div>
      {solPrice !== null && value > 0 && Number.isFinite(value) && <p>Estimated value: ${(value * solPrice).toFixed(2)}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {result && <p role="status">Transfer {result.status}. <a href={`https://solana.fm/tx/${result.signature}`} target="_blank" rel="noreferrer">View transaction</a></p>}
      {result && <Button variant="outline" onClick={() => { setResult(null); setAmount(''); setRecipient(''); setError(null); }}>New transfer</Button>}
      <DialogFooter><Button variant="outline" disabled={sending} onClick={close}>Close</Button><Button disabled={disabled || !valid} onClick={() => void send()}>{sending ? 'Submitting…' : 'Send SOL'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
