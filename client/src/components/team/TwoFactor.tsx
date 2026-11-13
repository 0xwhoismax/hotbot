"use client";
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { Copy, KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { isAdminAtom } from '@/store/user/atoms';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { api, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BACKUP_CODES, TOTP } from '../../../../types/twoFactor';
import { failToast, freshCodeAtom } from './state';
import s from './team.module.css';

type Answer = { ok: true } | { ok: false; error: string };

/** A code field that sends a TOTP, or a backup code when `backup` is on, and shows a wrong code's answer under it. */
function CodeForm({ submit, label, backup = false, onDone }: { submit: (code: string) => Promise<Answer>; label: string; backup?: boolean; onDone?: () => void }) {
  const id = useId(), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);
  const valid = useBackup ? code.replace(/[^a-z0-9]/gi, '').length === BACKUP_CODES.length : new RegExp(`^\\d{${TOTP.digits}}$`).test(code);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const answer = await submit(code);
      if (answer.ok) onDone?.(); else { setError(answer.error); setCode(''); }
    } catch (cause) { failToast(cause, { call: 'twoFactor' }); }
    setBusy(false);
  }
  return <form className={s.inviteField} onSubmit={event => void send(event)}>
    <label htmlFor={id} className={s.inviteFieldLabel}>{useBackup ? 'Backup code' : `${TOTP.digits}-digit code`}</label>
    <div className={s.twoFactorCode}>
      <Input id={id} autoFocus value={code} autoComplete="one-time-code" inputMode={useBackup ? 'text' : 'numeric'} maxLength={useBackup ? BACKUP_CODES.length + 1 : TOTP.digits}
        placeholder={useBackup ? 'XXXX-XXXX' : '000000'} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setError(null); setCode(useBackup ? event.target.value.toUpperCase() : event.target.value.replace(/\D/g, '')); }}/>
      <Button type="submit" disabled={!valid || busy}>{busy ? <LoaderCircle className="animate-spin"/> : <ShieldCheck/>}{label}</Button>
    </div>
    {error && <small id={`${id}-error`} role="alert" className={s.warnText}>{error}</small>}
    {backup && <button type="button" className={s.walletReset} onClick={() => { setUseBackup(on => !on); setCode(''); setError(null); }}>
      <KeyRound size={14}/>{useBackup ? 'Use the app' : 'Use a backup code'}</button>}
  </form>;
}

/** After sign-in on a two-factor account: the session acts only after a code. Nothing else closes it but Sign out. */
export function TwoFactorChallenge({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const verify = useMutation(api.twoFactor.verify);
  return <Dialog open>
    <DialogContent className="sm:max-w-[24rem]" showCloseButton={false} aria-describedby={undefined} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ShieldCheck size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Two-factor code</b></DialogTitle></span></div>
        <CodeForm submit={code => verify({ code })} label="Continue" backup/>
        <Button variant="ghost" onClick={() => void onSignOut()}><LogOut/>Sign out</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Asks for a fresh code when a Real SOL step needs one (`useCommand`), then lets the step run again. */
export function FreshCodeDialog() {
  const [waiting, setWaiting] = useAtom(freshCodeAtom), confirm = useMutation(api.twoFactor.confirm);
  const finish = (entered: boolean) => { waiting?.(entered); setWaiting(null); };
  return <Dialog open={Boolean(waiting)} onOpenChange={open => { if (!open) finish(false); }}>
    <DialogContent className="sm:max-w-[24rem]" aria-describedby={undefined}>
      <div className={s.decision}>
        <div className={s.decisionHead}><span className={s.accountIcon}><ShieldCheck size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Confirm Real SOL</b></DialogTitle></span></div>
        <CodeForm submit={code => confirm({ code })} label="Confirm" backup onDone={() => finish(true)}/>
      </div>
    </DialogContent>
  </Dialog>;
}

/** The Sign-in card's 2FA button, green while two-factor is on. It opens turning on (QR, secret, a code, then the backup codes once) or
 *  turning off with a code. Admins first: everyone else sees nothing until it opens to all. */
export function TwoFactorButton() {
  const status = useQuery(api.twoFactor.status, {}), admin = useAtomValue(isAdminAtom), [dialog, setDialog] = useState<'on' | 'off' | null>(null), close = useCallback(() => setDialog(null), []);
  const on = Boolean(status?.enabledAt);
  if (!status || (!admin && !on)) return null;
  return <>
    <Button variant="outline" size="sm" className={on ? s.twoFactorOn : undefined} title={on ? `Two-factor on since ${new Date(status.enabledAt!).toLocaleDateString()}` : 'Turn on two-factor'}
      onClick={() => setDialog(on ? 'off' : 'on')}><ShieldCheck/>{on ? '2FA on' : '2FA'}</Button>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
      <DialogContent className="sm:max-w-[26rem]" aria-describedby={undefined}>
        {dialog === 'on' && <Enroll onClose={close}/>}
        {dialog === 'off' && <TurnOff left={status.backupLeft} onClose={close}/>}
      </DialogContent>
    </Dialog>
  </>;
}

function Enroll({ onClose }: { onClose: () => void }) {
  const begin = useMutation(api.twoFactor.begin), enable = useMutation(api.twoFactor.enable);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null), [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    let current = true;
    begin({}).then(async ({ secret, uri }) => { const qr = await QRCode.toDataURL(uri, { margin: 1, width: 400 }); if (current) setSetup({ secret, qr }); })
      .catch(cause => { failToast(cause, { call: 'twoFactor.begin' }); onClose(); });
    return () => { current = false; };
  }, [begin, onClose]);
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error(`Could not copy ${what.toLowerCase()}`); }
  }
  async function submit(code: string): Promise<Answer> {
    const answer = await enable({ code });
    if (answer.ok) setCodes(answer.backupCodes);
    return answer.ok ? { ok: true } : answer;
  }
  if (codes) return <div className={s.decision}>
    <div className={s.decisionHead}><span className={s.accountIcon}><KeyRound size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Backup codes</b></DialogTitle><small>Each works once · shown only now</small></span></div>
    <ol className={s.backupCodes}>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ol>
    <div className={s.accountActions}>
      <Button variant="secondary" onClick={() => void copy(codes.join('\n'), 'Codes')}><Copy/>Copy all</Button>
      <DialogClose asChild><Button>Done</Button></DialogClose>
    </div>
  </div>;
  return <div className={s.decision}>
    <div className={s.decisionHead}><span className={s.accountIcon}><ShieldCheck size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Turn on two-factor</b></DialogTitle><small>Scan with an authenticator app</small></span></div>
    {setup ? <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn here */}
      <img className={s.twoFactorQr} src={setup.qr} alt="QR code for your authenticator app" width={200} height={200}/>
      <button type="button" className={s.walletAddress} onClick={() => void copy(setup.secret, 'Key')} aria-label="Copy setup key"><code className={s.fullAddress}>{setup.secret.match(/.{1,4}/g)!.join(' ')}</code><Copy size={14}/></button>
      <CodeForm submit={submit} label="Turn on"/>
    </> : <p className={s.empty}><LoaderCircle className="inline size-4 animate-spin"/></p>}
  </div>;
}

function TurnOff({ left, onClose }: { left: number; onClose: () => void }) {
  const disable = useMutation(api.twoFactor.disable);
  return <div className={s.decision}>
    <div className={s.decisionHead}><span className={s.accountIcon}><ShieldCheck size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Turn off two-factor</b></DialogTitle><small className={left <= 2 ? s.warnText : undefined}>{left} of {BACKUP_CODES.count} backup codes left</small></span></div>
    <CodeForm submit={code => disable({ code })} label="Turn off" backup onDone={() => { toast.success('Two-factor is off'); onClose(); }}/>
  </div>;
}
