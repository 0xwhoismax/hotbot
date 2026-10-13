"use client";
import { createElement, Fragment, useLayoutEffect } from 'react';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage, createJSONStorage, RESET } from 'jotai/utils';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api, convex, type Id } from '@/lib/convex';
import { store } from '@/store/store';
import { authStateAtom, currentUserIdAtom, isAdminAtom } from '@/store/user/atoms';
import type { Command, Draft, Failure, StrategyPatch } from '../../../../types/team';
import type { TeamRules } from '../../../../types/hotbot';
import type { ReportKind, ReportTarget } from '../../../../types/report';

export type OnboardingStep = 'intro' | 'beta' | 'style' | 'plan' | 'signin';
/** Onboarding's step. Shared so the sidebar's Log in opens the sign-in step, and a remount after signing in keeps it. */
export const onboardingStepAtom = atom<OnboardingStep>('intro');
/** Keep a chosen plan across sign-in redirects; onboarding stays open until it starts. */
type PendingPlan = { draft: Draft; budget: number } | null;
export const pendingPlanAtom = atomWithStorage<PendingPlan>('hotbot-pending-plan', null,
  createJSONStorage<PendingPlan>(() => { try { return sessionStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** True from the moment the first team starts until "Go to my team": the gate keeps onboarding on its launch step meanwhile, and the
 *  team panel, composer, phone bar and full sidebar stay away. Set before `team.start`, since its data can reach `useHome` before the call returns. */
export const launchingAtom = atom(false);
/** The invite code from an invite link or typed in, kept in localStorage until it is taken, so the link keeps working after a sign-in or a later visit. */
export const inviteAtom = atomWithStorage<string | null>('hotbot-invite', null,
  createJSONStorage<string | null>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** The first-use tips this device has put away (`FirstTip`). In localStorage, so another device shows each tip once more. */
export const seenTipsAtom = atomWithStorage<string[]>('hotbot-tips', [],
  createJSONStorage<string[]>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** A phone's strategy settings hold unsaved changes: the tab bar slides away and their Reset/Save bar takes its place. */
export const settingsEditingAtom = atom(false);
/** Whether strategy settings open on Easy or Advanced. Both edit the same rules; this device remembers the last one used. */
export type SettingsView = 'easy' | 'advanced';
export const settingsViewAtom = atomWithStorage<SettingsView>('hotbot-settings-view', 'easy',
  createJSONStorage<SettingsView>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** Invite codes as the backend keeps them: uppercase letters and digits. */
export const inviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
/** Puts the invite in the address (`?invite=CODE`), or takes it out. */
export function addressInvite(code: string | null) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('invite') === code) return;
  if (code) url.searchParams.set('invite', code); else url.searchParams.delete('invite');
  window.history.replaceState(null, '', url);
}
/** The invite in hand. It also rides in the address (`/app?invite=CODE`) until its seat is taken, so the page opened fresh in another browser
 *  (Phantom's from the sign-in step, Safari from a chat app's) still has it: on mount the address fills storage (or a stored code fills the address), and every change writes both. */
export function useInvite() {
  const [invite, setStored] = useAtom(inviteAtom);
  useLayoutEffect(() => {
    const linked = inviteCode(new URLSearchParams(window.location.search).get('invite') ?? '');
    if (linked) setStored(linked); else if (invite) addressInvite(invite);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setInvite = (code: string | null) => { setStored(code ?? RESET); addressInvite(code); };
  return [invite, setInvite] as const;
}
/** The team an admin is viewing in this tab (sessionStorage, so a reload keeps it and a new tab starts on the admin's own team). */
export type Viewing = { userId: string; name: string; avatar: string | null };
export const viewingAtom = atomWithStorage<Viewing | null>('hotbot-viewing', null,
  createJSONStorage<Viewing | null>(() => { try { return sessionStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** Whose team this tab shows: someone else's only for an admin viewing them. Viewing is read-only: commands, HOTBOT and proposals are refused while it is set. */
export const viewedAtom = atom(get => get(isAdminAtom) && get(viewingAtom)?.userId !== get(currentUserIdAtom) ? get(viewingAtom) : null);
/** The `as` every team read takes (`convex/team.ts`): the viewed person's account, or nothing for one's own team. */
export const viewAsAtom = atom<{ as?: Id<'users'> }>(get => { const viewed = get(viewedAtom); return viewed ? { as: viewed.userId as Id<'users'> } : {}; });
export const readOnly = (viewed: Viewing) => `You’re viewing ${viewed.name}’s team. Viewing is read-only: stop viewing to act on your own team.`;
/** Convex Auth sign-in action, installed by AccountRuntime. */
export const signInAtom = atom<{ run: (provider: string, params?: Record<string, string>) => Promise<{ signingIn: boolean }> } | null>(null);
/** Set by the account runtime: ends the Convex Auth session and detaches push. */
export const logoutAtom = atom<{ run: () => Promise<void> } | null>(null);
/** The Account page's profile slot; the account runtime portals the sign-in and wallet cards into it. */
export const profileTargetAtom = atom<HTMLElement | null>(null);
/** The sign-in email shows on Account (UserProfilePopover's eye): the profile card's crew shuts its eyes while it does. */
export const emailRevealedAtom = atom(false);
/** HOTBOT's composer is open: the corner disc on desktop, the bottom bar's Ask button on phones (the bar steps aside while it is). */
export const dockOpenAtom = atom(false);

export function useSession() {
  const auth = useAtomValue(authStateAtom), userId = useAtomValue(currentUserIdAtom), setStep = useSetAtom(onboardingStepAtom);
  const pathname = usePathname(), router = useRouter();
  // Signed-out /app routes render onboarding, so opening its sign-in step is enough; elsewhere go to /app first.
  const login = () => { setStep('signin'); if (!pathname.startsWith('/app')) router.push('/app'); };
  return { ready: auth.ready, signedIn: auth.authenticated, connected: Boolean(userId), login };
}
/** A failed call as the person reads it. Only admin accounts' calls carry the detail, which gains the function and request; `call` (the same
 *  function and request, to find in the Convex logs) is there for everyone. `fault`: HOTBOT's side broke, so a copy of it is also reported. */
export function failure(cause: unknown): { message: string; detail: string | null; fault: boolean; call: string | null } {
  const found = cause instanceof Error ? cause.message.match(/\[CONVEX \w\(([^)]+)\)\] \[Request ID: ([^\]]+)\]/) : null, call = found ? `${found[1]} · request ${found[2]}` : null;
  const data = cause instanceof ConvexError ? cause.data as Partial<Failure> | string : null;
  if (typeof data === 'string') return { message: data, detail: null, fault: false, call };
  if (typeof data?.message !== 'string') return { message: 'That did not go through.', detail: null, fault: true, call };
  return { message: data.message, detail: typeof data.detail === 'string' ? data.detail + (call ? `\n${call}` : '') : null, fault: data.fault === true, call };
}
/** An error toast with a Copy button (`copyError`). `context` is what the caller was doing, such as the command it sent. */
export const failToast = (cause: unknown, context?: Record<string, unknown>) => {
  const { message, detail, fault, call } = failure(cause), raw = cause instanceof Error && !(cause instanceof ConvexError) ? cause.message : null;
  const copy = () => copyError({ title: message, error: detail ?? raw ?? undefined, key: call ?? `${location.pathname}:${message}`, report: fault, context: { call, ...context } });
  // Long enough to reach the button; sonner's default is 1.5 s.
  toast.error(message, { duration: detail ? 15_000 : 10_000, ...(detail ? { description: detail, classNames: { description: 'whitespace-pre-wrap break-words font-mono text-[0.7rem]' } } : {}),
    action: { label: createElement(Fragment, null, createElement(Copy, { 'aria-hidden': true, className: 'size-3.5' }), 'Copy'), onClick: copy } });
};

/** An error on screen: the line it showed (`title`), its technical text, and what it was about. `key` names it, so pressing Copy on the same error
 *  again copies without filing a second report. `report`: a fault, filed as a report; a message about the person's own input is only copied. */
export type ShownError = { title: string; error?: string; key: string; report: boolean; target?: ReportTarget; context?: Record<string, unknown> };
const reportedErrors = new Set<string>();
/** Copies an error with its context and, for a fault, files it as an `error` report in the same press. The copy starts before any await: Safari
 *  lets a click write the clipboard only while it runs. A report that fails is said in a plain toast, never one with its own Copy button. */
export function copyError(shown: ShownError) {
  const facts: Record<string, string> = { copied: new Date().toISOString() };
  for (const [key, value] of Object.entries(shown.context ?? {})) if (value != null && value !== '') facts[key] = typeof value === 'string' ? value : JSON.stringify(value);
  Object.assign(facts, { page: location.href, screen: `${innerWidth}×${innerHeight}`, browser: navigator.userAgent });
  const text = ['HOTBOT error', shown.title, ...(shown.error && shown.error !== shown.title ? [shown.error] : []), '', ...Object.entries(facts).map(([key, value]) => `${key}: ${value}`)].join('\n');
  const copied = navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false);
  // Why it wasn't reported, or null once it was (or when it isn't one to report).
  const sent = (async (): Promise<string | null> => {
    if (!shown.report) return null;
    if (reportedErrors.has(shown.key)) return 'Already reported.';
    if (!convex) return 'Reports need a connection.';
    reportedErrors.add(shown.key);
    try {
      await convex.mutation(api.reports.file, { kind: 'error', comment: shown.error ?? shown.title, element: shown.title, route: location.pathname, viewport: facts.screen,
        shown: JSON.stringify({ error: shown.title, detail: shown.error, ...facts }), ...(shown.target ? { target: shown.target } : {}), ...store.get(viewAsAtom) });
      return null;
    } catch (cause) { reportedErrors.delete(shown.key); return failure(cause).message; }
  })();
  void Promise.all([copied, sent]).then(([ok, unsent]) => {
    const reported = shown.report && unsent === null;
    if (!ok && !reported) toast.error('Couldn’t copy this error', unsent ? { description: unsent } : undefined);
    else toast.success(ok ? reported ? 'Error copied and reported' : 'Error copied' : 'Error reported', { description: reported ? ok ? 'We’ll let you know when it’s fixed.' : 'Couldn’t copy it on this device.' : unsent ?? undefined });
  });
}
/** Every button runs through the one command mutation. Resolves to the id the command created (a researched coin, a new strategy) or null, and false when it failed. */
export function useCommand() {
  const run = useMutation(api.team.command), viewed = useAtomValue(viewedAtom);
  return async (command: Command): Promise<string | null | false> => {
    // Commands act on the admin's own team, never the one on screen; the price unit is the viewer's own preference.
    if (viewed && command.type !== 'priceDisplay') { toast.error(readOnly(viewed)); return false; }
    try { return await run({ command: JSON.stringify(command) }); } catch (cause) { failToast(cause, { command }); return false; }
  };
}
export type DraftBridge = { page: 'lab' | 'settings'; name: string; rules: TeamRules; dip: number; patch: StrategyPatch; context: () => string | null;
  apply: (patch: StrategyPatch) => void; drop: (keys: (keyof StrategyPatch)[]) => void; show: (ids: string[]) => void;
  replayed: { key: string; sol: number; picks: number; mean: number; base: { sol: number; picks: number; mean: number } } | null };
export const draftBridgeAtom = atom<DraftBridge | null>(null);
export const draftProposalAtom = atom<StrategyPatch | null>(null);
/** Settings rows HOTBOT points at, by `data-setting` id: `SettingRow` and the other marked parts glow until it clears (`useSettingSpot`). */
export const settingSpotAtom = atom<{ ids: string[]; at: number } | null>(null);
/** The "Check a coin" dialog: open with an optional search and the strategy to check it against. */
export const checkCoinAtom = atom<{ query?: string; strategyId?: string } | null>(null);
/** A report being made (`Report.tsx`): picking something on screen, or writing about it. `shown` is the data the screen composed for its target, as JSON. */
export type ReportDraft = { stage: 'pick' | 'write'; target?: ReportTarget; element?: string; shown?: string; kind?: ReportKind; comment?: string };
export const reportAtom = atom<ReportDraft | null>(null);
