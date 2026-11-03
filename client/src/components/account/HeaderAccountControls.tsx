"use client";

import type { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { LogIn, LogOut } from 'lucide-react';
import { currentUserIdAtom, userStateAtom } from '@/store/user/atoms';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { AppearancePicker } from '@/components/AppearancePicker';
import { NotificationInbox } from '@/components/notifications/NotificationInbox';
import { Link, useShellPathname } from '@/lib/appNavigation';

type Props = {
  appearanceControls?: ReactNode; ready?: boolean; authenticated?: boolean; accountConnected?: boolean; status?: string;
  onSignIn?: () => void; onSignOut?: () => Promise<void>;
};

/** Sidebar footer: one row with who you are (opens the Account page), then notifications, appearance and Log out as icons. Phones show none of it
 *  when signed in: the tab bar opens Account and the menu's bottom carries Theme and Log out. Sign in waits until the session is known. */
export function HeaderAccountControls({ ready = true, authenticated = false, accountConnected = false, onSignIn, onSignOut, appearanceControls }: Props) {
  const { state, isMobile, setOpenMobile } = useSidebar(), pathname = useShellPathname();
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
      {!compact && <span className="hotbot-account-name"><strong>{name}</strong></span>}
    </Link>
    <div className="hotbot-account-icons">{available && !profile?.banned && <NotificationInbox/>}{theme}{onSignOut && <Button variant="ghost" size="icon" aria-label="Log out" title="Log out" onClick={() => void onSignOut()}><LogOut/></Button>}</div>
  </div>;
}
