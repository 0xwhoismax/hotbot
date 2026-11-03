"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { ConvexError } from 'convex/values';
import { CrossmintProvider, CrossmintWalletProvider, useCrossmint, useWallet, useWalletOtpSigner } from '@crossmint/client-sdk-react-ui';
import { toast } from 'sonner';
import { CodeEntry, StepButton } from './Parts';
import { api } from '@/lib/convex';

/** The withdrawal that the email signer approves: prepared once the signer is ready, or earlier. */
export type Prepared = { requestId: string; transactionId: string };
type Props = { prepare: () => Promise<Prepared>; onApproved: (requestId: string) => void; onFailed: (cause: unknown, trail: string) => void };

/** How long each step may take before the approval ends with a message that names it. The code waits for the person and has no limit. */
const STALLS = {
  token: [20_000, 'HOTBOT did not answer when the approval started. Check your connection and try again.'],
  wallet: [30_000, 'Crossmint did not answer when asked for your HOTBOT wallet. Something in this browser may block it: try again, or use another browser.'],
  signer: [30_000, 'Crossmint’s signing frame (signers.crossmint.com) did not open, so no code was sent. A shield or extension may block it: turn it off for this site, or use another browser.'],
  prepare: [45_000, 'HOTBOT could not prepare the withdrawal in time. Try again.'],
  approve: [45_000, 'Crossmint has not confirmed the approval yet. Check your withdrawals before you try again.'],
} as const;
/** Each step the trail names; `code`, `sent` and `confirm` wait for the person and have no limit. */
type Step = keyof typeof STALLS | 'code' | 'sent' | 'confirm';
/** What the main button says from each step on; the wallet and the signer frame stay "Connecting…". */
const WORKING: Partial<Record<Step, string>> = { token: 'Connecting…', confirm: 'Checking the code…', prepare: 'Preparing…', approve: 'Approving…' };
/** Crossmint's own words for a refused code step, with its error code when it gives one. */
function crossmintReason(cause: unknown) {
  if (!(cause instanceof Error)) return String(cause);
  const code = 'code' in cause && typeof cause.code === 'string' ? ` (${cause.code})` : '';
  return `${cause.message}${code}`;
}

/** Crossmint's email signer approves one withdrawal. HOTBOT's token names the person to Crossmint; when this device's signer needs it,
 *  Crossmint emails a code, which `Code` takes inside the Withdraw dialog (Crossmint's own prompt opens outside the dialog's focus trap,
 *  where nothing can be typed). Only then does `prepare` have Crossmint prepare the withdrawal, and the signer approves it at once: the
 *  prepared transaction's blockhash expires within a minute. Loaded only when an email-recovered wallet approves (`Withdraw.tsx`). */
export default function EmailApproval(props: Props) {
  return <CrossmintProvider apiKey={process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ?? ''}>
    <CrossmintWalletProvider showPasskeyHelpers={false} showOtpSignerPrompt={false}><Approve {...props}/></CrossmintWalletProvider>
  </CrossmintProvider>;
}

/** Crossmint's reason for a wallet it did not open: the SDK passes on the API's JSON answer as the message. */
function refusal({ code, message }: { code: string; message: string }) {
  if (code === 'region-blocked') return 'Crossmint does not serve your region.';
  try {
    const answer: unknown = JSON.parse(message);
    if (answer && typeof answer === 'object' && 'message' in answer && typeof answer.message === 'string') message = answer.message;
  } catch { /* not JSON: the message as it came */ }
  return `Crossmint did not open your HOTBOT wallet: ${message}`;
}

/** The token goes in first; the wallet is read once the provider carries it. Runs once per mount and ends once: a failure can come from the
 *  token, the wallet, the code or the approval. */
function Approve({ prepare, onApproved, onFailed }: Props) {
  const token = useAction(api.withdraw.crossmintToken), { crossmint, setJwt } = useCrossmint(), { getWallet, error } = useWallet(), { needsAuth } = useWalletOtpSigner();
  const email = useRef<string | null>(null), started = useRef(false), ended = useRef(false), done = useRef({ prepare, onApproved, onFailed });
  const trail = useRef<string[]>([]), timer = useRef<ReturnType<typeof setTimeout>>(undefined), began = useRef(0), [working, setWorking] = useState(WORKING.token!);
  done.current = { prepare, onApproved, onFailed };
  const fail = useCallback((cause: unknown) => {
    if (ended.current) return;
    ended.current = true;
    clearTimeout(timer.current);
    done.current.onFailed(cause, trail.current.join(' > '));
  }, []);
  /** The approval reached `step`: the one before it is over, and this one must end within its limit. The trail names each step reached and when. */
  const reach = useCallback((step: Step) => {
    if (ended.current) return;
    clearTimeout(timer.current);
    began.current ||= performance.now();
    trail.current.push(`${step} ${Math.round(performance.now() - began.current)}ms`);
    if (WORKING[step]) setWorking(WORKING[step]);
    if (!(step in STALLS)) return;
    const [limit, message] = STALLS[step as keyof typeof STALLS];
    timer.current = setTimeout(() => { console.warn('[email-approval] stalled', trail.current.join(' > ')); fail(new ConvexError(message)); }, limit);
  }, [fail]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (needsAuth) reach('code'); }, [needsAuth, reach]);
  useEffect(() => {
    reach('token');
    token({}).then(answer => { email.current = answer.email; setJwt(answer.jwt); }, fail);
  }, [token, setJwt, fail, reach]);
  // getWallet answers nothing when Crossmint refuses; the provider keeps Crossmint's reason.
  useEffect(() => { if (error) fail(new ConvexError(refusal(error))); }, [error, fail]);
  useEffect(() => {
    if (!crossmint.jwt || !email.current || started.current) return;
    started.current = true;
    reach('wallet');
    (async () => {
      const wallet = await getWallet({ chain: 'solana' });
      // A refusal ends through the provider's reason (above); a wallet missing with no reason ends here once the provider had its turn.
      if (!wallet) { setTimeout(() => fail(new ConvexError('Crossmint did not open your HOTBOT wallet.')), 1_000); return; }
      reach('signer');
      await wallet.useSigner({ type: 'email', email: email.current! });
      // The code now: `approve` would ask for it only after the transaction was prepared.
      const signer = wallet.signer;
      if (signer && 'ensureAuthenticated' in signer && typeof signer.ensureAuthenticated === 'function') await signer.ensureAuthenticated();
      reach('prepare');
      const { requestId, transactionId } = await done.current.prepare();
      if (ended.current) return;
      reach('approve');
      await wallet.approve({ transactionId });
      if (!ended.current) { ended.current = true; clearTimeout(timer.current); setWorking('Sending…'); done.current.onApproved(requestId); }
    })().catch(fail);
  }, [crossmint.jwt, getWallet, fail, reach]);
  return <Code onFailed={fail} onStep={reach} working={working}/>;
}

/** Crossmint's emailed code while this device's signer needs one, in the main button's place: sent at once, then Confirm, Resend or
 *  Cancel; the button shows the step at work otherwise (`working`). A refused code ends the approval, since Crossmint's signer drops it; a
 *  code that outlived its session is sent again. Crossmint's reason is shown as it gives it: one error type covers a code it could not send
 *  and a code it did not take. */
function Code({ onFailed, onStep, working }: { onFailed: (cause: unknown) => void; onStep: (step: Step) => void; working: string }) {
  const { needsAuth, sendOtp, verifyOtp, reject } = useWalletOtpSigner(), [code, setCode] = useState(''), [busy, setBusy] = useState<'confirm' | 'resend' | null>(null);
  const sent = useRef(false), [sending, setSending] = useState(true);
  const send = useCallback(() => { setSending(true); return sendOtp().then(() => { onStep('sent'); setSending(false); },
    cause => onFailed(new ConvexError(`Crossmint could not send the code: ${crossmintReason(cause)}`))); }, [sendOtp, onFailed, onStep]);
  useEffect(() => { if (needsAuth && !sent.current) { sent.current = true; void send(); } }, [needsAuth, send]);
  async function confirm() {
    setBusy('confirm');
    onStep('confirm');
    try { await verifyOtp(code.trim()); }
    catch (cause) {
      if (cause instanceof Error && cause.name === 'OnboardingSessionExpiredError') { setCode(''); toast.message(cause.message); }
      else onFailed(new ConvexError(`Crossmint did not take the code: ${crossmintReason(cause)}. Try again for a new one.`));
    } finally { setBusy(null); }
  }
  async function resend() {
    setBusy('resend');
    try { await send(); } finally { setBusy(null); }
  }
  if (!needsAuth) return <StepButton label={working}/>;
  return <CodeEntry label="Code from your email" code={code} onCode={setCode} onConfirm={() => void confirm()} onResend={() => void resend()}
    onCancel={() => reject(new Error('Cancelled'))} busy={busy} sending={sending}/>;
}
