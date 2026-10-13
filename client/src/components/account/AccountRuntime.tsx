"use client";
import { Component, type PropsWithChildren, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConvexAuthProvider, useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { useConvexAuth, useConvexConnectionState, useQuery } from 'convex/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { api, convex } from '@/lib/convex';
import { EMPTY_USER, authStateAtom, authTokenAtom, currentUserIdAtom, rememberSignedIn, userStateAtom } from '@/store/user/atoms';
import { SolBalanceWsSync } from '@/store/user/SolBalanceWsSync';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { detachBrowserPush } from '@/lib/browserPush';
import dynamic from 'next/dynamic';
import { HeaderAccountControls } from './HeaderAccountControls';
import { SavedAppearancePicker } from './SavedAppearancePicker';
import { logoutAtom, onboardingStepAtom, profileTargetAtom, signInAtom, useSession } from '@/components/team/state';
const UserProfilePopoverContent = dynamic(() => import('@/components/auth/UserProfilePopover').then(module => module.UserProfilePopoverContent), { loading: () => <p role="status">Loading profile…</p> });

export type AccountRuntimeProps = { accountTarget: HTMLElement | null; contentTarget: HTMLElement | null };

class AccountBoundary extends Component<PropsWithChildren<AccountRuntimeProps>, { failed: boolean; revision: number }> {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <>
      {this.props.accountTarget && createPortal(<>
        <HeaderAccountControls status="Account services are unavailable." />
        <Alert variant="destructive"><AlertDescription>Account services are unavailable.<Button variant="outline" onClick={() => this.setState(value => ({ failed: false, revision: value.revision + 1 }))}>Retry connection</Button></AlertDescription></Alert>
      </>, this.props.accountTarget)}
    </>;
    return <div key={this.state.revision}>{this.props.children}</div>;
  }
}
export function AccountRuntime(props: AccountRuntimeProps) {
  if (!convex) return <>
    {props.accountTarget && createPortal(<HeaderAccountControls status="Account services are not configured. Token search remains available." />, props.accountTarget)}
  </>;
  return <AccountBoundary {...props}><ConvexAuthProvider client={convex}><Session {...props} /></ConvexAuthProvider></AccountBoundary>;
}
/** The signed-in user id from a Convex Auth token (`sub` is `userId|sessionId`); only keys client state, the server verifies the token. */
function tokenUserId(token: string | null | undefined) {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try { return String(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).sub ?? '').split('|')[0] || null; } catch { return null; }
}
function Session({ accountTarget, contentTarget }: AccountRuntimeProps) {
  const auth = useConvexAuth(), token = useAuthToken(), { signIn, signOut: endSession } = useAuthActions(), { login } = useSession();
  const userId = useAtomValue(currentUserIdAtom);
  const connection = useConvexConnectionState();
  const [connectionDelayed, setConnectionDelayed] = useState(false);
  if (auth.isAuthenticated && connectionDelayed) setConnectionDelayed(false);
  useEffect(() => {
    if (auth.isAuthenticated) return;
    const timer = setTimeout(() => setConnectionDelayed(true), 10_000);
    return () => clearTimeout(timer);
  }, [auth.isAuthenticated]);
  const setLogout = useSetAtom(logoutAtom), setSignIn = useSetAtom(signInAtom), setStep = useSetAtom(onboardingStepAtom), profileTarget = useAtomValue(profileTargetAtom);
  const setAuth = useSetAtom(authStateAtom), setToken = useSetAtom(authTokenAtom), setUser = useSetAtom(userStateAtom);
  const ready = !auth.isLoading, authenticated = auth.isAuthenticated;
  const sessionId = authenticated ? tokenUserId(token) : null;
  useLayoutEffect(() => {
    setToken(null); setUser(EMPTY_USER);
    return () => { setToken(null); setUser(EMPTY_USER); };
  }, [sessionId, setToken, setUser]);
  // Convex Auth refreshes the token itself; API routes read the current one.
  useLayoutEffect(() => { setToken(sessionId ? token ?? null : null); }, [sessionId, token, setToken]);
  useLayoutEffect(() => { setAuth({ ready, authenticated, sessionId }); }, [ready, authenticated, sessionId, setAuth]);
  useEffect(() => {
    if (ready) rememberSignedIn(authenticated);
    if (ready && !authenticated) void detachBrowserPush().catch(() => {});
  }, [ready, authenticated]);
  async function signOut() {
    try { await detachBrowserPush(true); } catch { /* Browser delivery is retried on anonymous session. */ }
    await endSession();
    setStep('intro');
  }
  useLayoutEffect(() => { setLogout({ run: signOut }); return () => setLogout(null); });
  useLayoutEffect(() => { setSignIn({ run: signIn }); return () => setSignIn(null); }, [signIn, setSignIn]);
  const accountStatus = !ready ? 'Loading account services…' : connectionDelayed || !connection.isWebSocketConnected
    ? 'Account connection unavailable. Reconnecting automatically; token search remains available.' : 'Connecting to your account…';
  return <>
    {accountTarget && createPortal(<HeaderAccountControls appearanceControls={authenticated && userId ? <SavedAppearancePicker key={userId} /> : undefined} ready={ready} authenticated={authenticated} accountConnected={authenticated}
      status={accountStatus} onSignIn={login} onSignOut={signOut} />, accountTarget)}
    {contentTarget && createPortal(<>
    {authenticated && <SolBalanceWsSync />}
    {profileTarget && authenticated && userId && createPortal(<UserProfilePopoverContent/>, profileTarget)}
    {authenticated && (sessionId ? <Bootstrap key={sessionId} sessionId={sessionId} onSignOut={signOut} /> : <p role="status">{accountStatus}</p>)}
    </>, contentTarget)}
  </>;
}
/** Loads the signed-in person's profile into the user atoms. */
function Bootstrap({ sessionId, onSignOut }: { sessionId: string; onSignOut: () => Promise<void> }) {
  const current = useQuery(api.users.getCurrent, {});
  const setUser = useSetAtom(userStateAtom);
  useLayoutEffect(() => {
    setUser(previous => current === undefined ? { ...previous, sessionId, ready: true, loading: true } : {
      sessionId, ready: true, loading: false,
      profileData: current ? { id: current._id, creationTime: current._creationTime, email: current.email, username: current.username, avatar: current.avatar, role: current.role, priceDisplay: current.priceDisplay, invited: Boolean(current.inviteId), signIn: current.signIn } : null,
    });
  }, [current, sessionId, setUser]);
  useLayoutEffect(() => () => setUser(EMPTY_USER), [setUser]);
  if (current === undefined) return <p role="status">Loading account…</p>;
  if (current === null) return <p role="alert">This account is unavailable. <Button variant="outline" onClick={() => void onSignOut()}>Sign out</Button></p>;
  return <AccountContent />;
}
/** Name, picture and look are asked on onboarding's launch step, never in a dialog over the app. */
function AccountContent() {
  const userId = useAtomValue(currentUserIdAtom);
  if (!userId) return <p role="status">Verifying account…</p>;
  return null;
}
