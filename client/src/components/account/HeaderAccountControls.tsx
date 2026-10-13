"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { LogIn } from 'lucide-react';
import { currentUserIdAtom, userStateAtom } from '@/store/user/atoms';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { AppearancePicker } from '@/components/AppearancePicker';
import { NotificationInbox } from '@/components/notifications/NotificationInbox';

type Props = {
  appearanceControls?: ReactNode; ready?: boolean; authenticated?: boolean; accountConnected?: boolean; status?: string;
  onSignIn?: () => void; onSignOut?: () => Promise<void>;
};

/** Sidebar footer: one row with who you are (opens the Account page), notifications and appearance. Phones show none of it when signed in:
 *  the tab bar opens Account and the menu's bottom carries Theme. Sign in waits until the session is known. */
export function HeaderAccountControls({ ready = true, authenticated = false, accountConnected = false, onSignIn, appearanceControls }: Props) {
  const { state, isMobile, setOpenMobile } = useSidebar(), pathname = usePathname();
  const compact = state === 'collapsed' && !isMobile;
  const userId = useAtomValue(currentUserIdAtom), profile = useAtomValue(userStateAtom).profileData;
  const available = authenticated && accountConnected && Boolean(userId);
  const name = profile?.username || 'Your account';
  const theme = appearanceControls ?? <AppearancePicker iconOnly/>;
  if (!authenticated) return <div className="hotbot-account">
    {ready && onSignIn && <Button size={compact ? 'icon' : 'default'} className={compact ? undefined : 'w-full'} onClick={onSignIn} aria-label="Sign in">{compact ? <LogIn/> : 'Sign in'}</Button>}
    <div className="hotbot-account-icons">{theme}</div>
  </div>;
  if (isMobile) return null;
  return <div className="hotbot-account">
    <Link href="/app/account" onClick={() => setOpenMobile(false)} className="hotbot-account-row" data-active={pathname === '/app/account' || undefined} aria-label={`Account, ${name}`}>
      <Avatar className="size-8"><AvatarImage src={userId ? profile?.avatar ?? undefined : undefined} alt=""/><AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
      {!compact && <span className="hotbot-account-name"><strong>{name}</strong><small>Account and wallets</small></span>}
    </Link>
    <div className="hotbot-account-icons">{available && <NotificationInbox/>}{theme}</div>
  </div>;
}
