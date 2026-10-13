"use client";

import { useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { AtSign, Eye, EyeOff, Mail, UserRound, Wallet } from 'lucide-react';
import { userStateAtom } from '@/store/user/atoms';
import { WalletControls } from '@/components/account/WalletControls';
import { Button } from '@/components/ui/button';
import { emailRevealedAtom } from '@/components/team/state';
import s from '@/components/team/team.module.css';

const METHODS: Record<string, { label: string; icon: typeof Mail }> = {
  solana: { label: 'Solana wallet', icon: Wallet },
  'email-code': { label: 'Email', icon: Mail },
  google: { label: 'Google', icon: Mail },
  apple: { label: 'Apple', icon: Mail },
  twitter: { label: 'X', icon: AtSign },
};

/** Account controls portalled into the Account page by AccountRuntime: how you sign in, then wallet and display settings. The email hides again when the page closes. */
export function UserProfilePopoverContent() {
  const signIn = useAtomValue(userStateAtom).profileData?.signIn ?? null;
  const [revealed, setRevealed] = useAtom(emailRevealedAtom);
  useEffect(() => () => setRevealed(false), [setRevealed]);
  const method = signIn ? METHODS[signIn.provider] ?? { label: signIn.provider, icon: Wallet } : null;
  // Email, Google and Apple show the address, hidden until asked.
  const isEmail = signIn?.provider === 'email-code' || signIn?.provider === 'google' || signIn?.provider === 'apple';
  const shown = !signIn ? '' : signIn.provider === 'solana' ? `${signIn.id.slice(0, 6)}…${signIn.id.slice(-6)}` : isEmail && !revealed ? '****' : signIn.id;
  return <>
    <section className={`${s.surface} ${s.accountCard}`} aria-labelledby="sign-in-title">
      <div className={s.accountCardHead}>
        <span className={s.accountIcon}>{method ? <method.icon size={18}/> : <UserRound size={18}/>}</span>
        <div className={s.grow}><h2 id="sign-in-title">{method ? `Signed in with ${method.label}` : 'Signed in'}</h2>{shown && <small title={signIn?.provider === 'solana' ? signIn.id : undefined}>{shown}</small>}</div>
        {isEmail && <Button variant="ghost" size="icon" aria-label={revealed ? 'Hide email' : 'Show email'} aria-pressed={revealed} onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff/> : <Eye/>}</Button>}
      </div>
    </section>
    <WalletControls/>
  </>;
}
