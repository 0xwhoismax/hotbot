import { useSyncExternalStore } from 'react';
import { atom, useAtomValue } from 'jotai';
import type { UserProfileData } from './types';
/** The Convex Auth session; `sessionId` is the signed-in user id from the session token. */
export const authStateAtom = atom({ authenticated: false, ready: false, sessionId: null as string | null });
const SIGNED_IN_KEY = 'hotbot-signed-in';
/** Written by the account runtime once the session is known, so the next page load lays out for this browser's last state. */
export function rememberSignedIn(signedIn: boolean) {
  try { if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1'); else localStorage.removeItem(SIGNED_IN_KEY); } catch { /* Layout hint only. */ }
}
const readSignedIn = () => { try { return localStorage.getItem(SIGNED_IN_KEY) === '1'; } catch { return false; } };
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
/** The person's HOTBOT trading wallet. Phase 2 points this at their Crossmint wallet; until then there is none. */
export const currentWalletAddressAtom = atom<string | null>(null);
