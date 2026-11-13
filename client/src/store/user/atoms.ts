import { useSyncExternalStore } from 'react';
import { atom, useAtomValue } from 'jotai';
import type { UserProfileData } from './types';
import { telegramHandle, xHandle } from '../../../../types/application';
/** The Convex Auth session; `sessionId` is the signed-in user id from the session token. */
export const authStateAtom = atom({ authenticated: false, ready: false, sessionId: null as string | null });
const SIGNED_IN_KEY = 'hotbot-signed-in';
/** Written by the account runtime once the session is known, so the next page load lays out for this browser's last state. */
export function rememberSignedIn(signedIn: boolean) {
  try { if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1'); else localStorage.removeItem(SIGNED_IN_KEY); } catch { /* Layout hint only. */ }
}
const readSignedIn = () => { try { return localStorage.getItem(SIGNED_IN_KEY) === '1'; } catch { return false; } };
/** The row this browser last signed in with (SignInStep): a wallet's name, an OAuth provider or `email`. It stays through sign-out, so it also
 *  tells a returning visitor from a new one. */
export const LAST_SIGN_IN_KEY = 'hotbot-last-sign-in';
export const signedInBefore = () => { try { return localStorage.getItem(LAST_SIGN_IN_KEY) !== null; } catch { return false; } };
/** Where /join keeps the application's answers in this browser, sent or not. */
export const APPLICATION_KEY = 'hotbot-application';
/** The handles of the application this browser sent, or null when it sent none. */
export function sentApplication(): { x: string; telegram: string } | null {
  try {
    const row = JSON.parse(localStorage.getItem(APPLICATION_KEY) ?? 'null') as { sent?: boolean; x?: string; telegram?: string } | null;
    return row?.sent ? { x: xHandle(row.x ?? ''), telegram: telegramHandle(row.telegram ?? '') } : null;
  } catch { return null; }
}
/** What this browser did before, the newest first: the landing's and the signed-out /app's first key follow it. */
export type Visitor = 'signedIn' | 'returning' | 'applied' | 'new';
export const visitorNow = (): Visitor => readSignedIn() ? 'signedIn' : signedInBefore() ? 'returning' : sentApplication() ? 'applied' : 'new';
/** `visitorNow` for a render; the server render reads `new`. */
export const useVisitor = () => useSyncExternalStore(unchanging, visitorNow, () => 'new' as Visitor);
const unchanging = () => () => {};
/** Signed-out layout (compact rail, no navigation): the session once it is known; while a page load resolves it, this browser's last state. */
export function useSignedOut() {
  const auth = useAtomValue(authStateAtom), remembered = useSyncExternalStore(unchanging, readSignedIn, () => false);
  return auth.ready ? !auth.authenticated : !remembered;
}
/** The Convex Auth session token, sent as a bearer token to the app's own API routes. */
export const authTokenAtom = atom<string | null>(null);
export interface UserState { sessionId: string | null; ready: boolean; loading: boolean; profileData: UserProfileData | null }
export const EMPTY_USER: UserState = { sessionId: null, ready: false, loading: true, profileData: null };
export const userStateAtom = atom<UserState>(EMPTY_USER);
export const priceDisplayAtom = atom(get => get(currentUserIdAtom) ? get(userStateAtom).profileData?.priceDisplay ?? 'price' : 'price');
export const useUser = () => useAtomValue(userStateAtom);
export const currentUserIdAtom = atom(get => {
  const auth = get(authStateAtom), state = get(userStateAtom);
  return auth.ready && auth.authenticated && auth.sessionId === state.sessionId ? state.profileData?.id ?? null : null;
});
export const isAdminAtom = atom(get => Boolean(get(currentUserIdAtom)) && get(userStateAtom).profileData?.role === 'admin');
/** The Lab page: every admin, and the people an admin gave it (`admin.lab`). */
export const labAtom = atom(get => get(isAdminAtom) || (Boolean(get(currentUserIdAtom)) && get(userStateAtom).profileData?.labAccessAt != null));
export const bannedAtom = atom(get => Boolean(get(currentUserIdAtom)) && get(userStateAtom).profileData?.banned === true);
