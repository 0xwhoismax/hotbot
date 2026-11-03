"use client";
import { createElement, Fragment, useEffect, useState } from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { usePathname } from 'next/navigation';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api, convex, type Id } from '@/lib/convex';
import { store } from '@/store/store';
import { authStateAtom, currentUserIdAtom, isAdminAtom } from '@/store/user/atoms';
import type { Command, Failure, StrategyPatch } from '../../../../types/team';
import type { LegalKind } from '../../../../types/legal';
import { COMMAND_WAIT_MS, type CommandAnswer } from '../../../../types/commands';
import type { TeamRules } from '../../../../types/hotbot';
import { FRESH_CODE_ERROR } from '../../../../types/twoFactor';
import type { ReportKind, ReportTarget } from '../../../../types/report';
import type { MarketPeriod } from '../../../../types/marketFeed';
import { useRouter } from '@/lib/appNavigation';

/** `check`: Check status's sign-in with Google, Apple or an email code. */
export type OnboardingStep = 'check' | 'intro' | 'pay' | 'beta' | 'easy' | 'signin';
/** Onboarding's step. Shared so the sidebar's Log in opens the sign-in step, and a remount after signing in keeps it. */
export const onboardingStepAtom = atom<OnboardingStep>('intro');
/** Keep the first strategy as `team.start` takes it across sign-in redirects; onboarding stays open until it starts. */
export type PendingPlan = { name: string; budgetSol: number; askFirst: boolean; patch: StrategyPatch } | null;
export const pendingPlanAtom = atomWithStorage<PendingPlan>('hotbot-pending-start', null,
  createJSONStorage<PendingPlan>(() => { try { return sessionStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** True from the moment the first team starts until "Go to my team": the gate keeps onboarding on its launch step meanwhile, and the
 *  team panel, composer, phone bar and full sidebar stay away. Set before `team.start`, since its data can reach `useHome` before the call returns. */
export const launchingAtom = atom(false);
/** The first-use tips this device has put away (`FirstTip`). In localStorage, so another device shows each tip once more. */
export const seenTipsAtom = atomWithStorage<string[]>('hotbot-tips', [],
  createJSONStorage<string[]>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** A phone's strategy settings are open: the tab bar slides away and their Reset/Save bar takes its place. */
export const settingsEditingAtom = atom(false);
/** Whether strategy settings open on Easy or Advanced. Both edit the same rules; this device remembers the last one used. */
export type SettingsView = 'easy' | 'advanced';
export const settingsViewAtom = atomWithStorage<SettingsView>('hotbot-settings-view', 'easy',
  createJSONStorage<SettingsView>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** The Account money cards (Wallet, Practice) folded to their balance. This device remembers them. */
export const foldedCardsAtom = atomWithStorage<string[]>('hotbot-folded-cards', [],
  createJSONStorage<string[]>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** Whether the profit card shows the line or the calendar. This device remembers it. */
export type ProfitView = 'chart' | 'calendar';
export const profitViewAtom = atomWithStorage<ProfitView>('hotbot-profit-view', 'chart',
  createJSONStorage<ProfitView>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** Whether the person collapsed the team column to the rail. This device remembers it. */
export const teamCollapsedAtom = atomWithStorage<boolean>('hotbot-team-collapsed', false,
  createJSONStorage<boolean>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** The candle size picked on live coin charts, or Auto (sized to each coin's age). This device remembers it from coin to coin. */
export const chartPeriodAtom = atomWithStorage<'auto' | MarketPeriod>('hotbot-chart-period', 'auto',
  createJSONStorage<'auto' | MarketPeriod>(() => { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** The team an admin is viewing in this tab (sessionStorage, so a reload keeps it and a new tab starts on the admin's own team). */
export type Viewing = { userId: string; name: string; avatar: string | null };
export const viewingAtom = atomWithStorage<Viewing | null>('hotbot-viewing', null,
  createJSONStorage<Viewing | null>(() => { try { return sessionStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });
/** Whose team this tab shows: someone else's only for an admin viewing them. Viewing is read-only: commands, HOTBOT and proposals are refused while it is set. */
export const viewedAtom = atom(get => get(isAdminAtom) && get(viewingAtom)?.userId !== get(currentUserIdAtom) ? get(viewingAtom) : null);
export const viewAsAtom = atom<{ as?: Id<'users'> }>(get => { const viewed = get(viewedAtom); return viewed ? { as: viewed.userId as Id<'users'> } : {}; });
export const readOnly = (viewed: Viewing) => `You’re viewing ${viewed.name}’s team. Viewing is read-only: stop viewing to act on your own team.`;
/** Convex Auth sign-in action, installed by AccountRuntime. */
export const signInAtom = atom<{ run: (provider: string, params?: Record<string, string>) => Promise<{ signingIn: boolean }> } | null>(null);
/** Set by the account runtime: ends the Convex Auth session and detaches push. */
export const logoutAtom = atom<{ run: () => Promise<void> } | null>(null);
/** The Account page's profile slot; the account runtime portals the sign-in and wallet cards into it. */
export const profileTargetAtom = atom<HTMLElement | null>(null);
/** A Real SOL step waiting for a fresh two-factor code (`FreshCodeDialog`): called with whether one was entered. */
export const freshCodeAtom = atom<((entered: boolean) => void) | null>(null);
/** Opens FreshCodeDialog; resolves with whether a code was entered. */
export const askFreshCode = () => new Promise<boolean>(resolve => { store.get(freshCodeAtom)?.(false); store.set(freshCodeAtom, () => resolve); });
/** The sign-in email shows on Account (UserProfilePopover's eye): the profile card's crew shuts its eyes while it does. */
export const emailRevealedAtom = atom(false);
/** HOTBOT's composer is open: the corner disc on desktop, the bottom bar's Ask button on phones (the bar steps aside while it is). */
export const dockOpenAtom = atom(false);
/** Development only: `?check` or `?pay=<state>` in the address shows the check step, or the pay step on sample data (PassPay.tsx), to anyone, with a team or without, to look at it. */
export function useStepPreview() {
  const [preview, setPreview] = useState<'check' | 'pay' | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const read = () => { const query = new URLSearchParams(window.location.search); setPreview(query.has('check') ? 'check' : query.has('pay') ? 'pay' : null); };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  return preview;
}

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
  // A gate that waits for an acceptance opens its Accept dialog instead.
  const terms = cause instanceof ConvexError ? (cause.data as Partial<Failure> | null)?.terms : undefined;
  if (terms) { store.set(legalAskAtom, terms); return; }
  // A Real SOL step that needs a fresh two-factor code opens the code dialog; the person then taps the step again.
  if (failure(cause).message === FRESH_CODE_ERROR) { void askFreshCode(); return; }
  const { message, detail, fault, call } = failure(cause), raw = cause instanceof Error && !(cause instanceof ConvexError) ? cause.message : null;
  const copy = () => copyError({ title: message, error: detail ?? raw ?? undefined, key: call ?? `${location.pathname}:${message}`, report: fault, context: { call, ...context } });
  // Long enough to reach the button; sonner's default is 1.5 s.
  toast.error(message, { duration: detail ? 15_000 : 10_000, ...(detail ? { description: detail, classNames: { description: 'whitespace-pre-wrap break-words font-mono text-[0.7rem]' } } : {}),
    action: { label: createElement(Fragment, null, createElement(Copy, { 'aria-hidden': true, className: 'size-3.5' }), 'Copy'), onClick: copy } });
};

/** The Accept dialog a refusal asked for (`Failure.terms`), or null (LegalDialog.tsx `LegalGate`). */
export const legalAskAtom = atom<LegalKind | null>(null);

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
/** Every button runs through the one command mutation. Resolves to the id the command created (a researched coin, a new strategy) or null, and
 *  false when it failed. A command HOTBOT's worker carries out (`cmd`) resolves when it answers: a refusal fails as any other, a research names
 *  its coin (types/coinKey.ts `coinLink`), and with no answer within COMMAND_WAIT_MS it shows as queued and resolves null. */
export function useCommand() {
  const run = useMutation(api.team.command), viewed = useAtomValue(viewedAtom);
  const send = async (command: Command, retry: boolean): Promise<string | null | false> => {
    try {
      const result = await run({ command: JSON.stringify(command) });
      if (result === null || typeof result === 'string') return result;
      const answer = await answered(result.cmd);
      if (!answer) { toast('Queued'); return null; }
      if (!answer.ok) throw new ConvexError({ message: answer.text ?? 'That did not go through.' });
      return answer.coin;
    } catch (cause) {
      // A Real SOL step on a two-factor account asks for a code, then runs again.
      if (retry && failure(cause).message === FRESH_CODE_ERROR) {
        if (await askFreshCode()) return await send(command, false);
        return false;
      }
      failToast(cause, { command }); return false;
    }
  };
  return async (command: Command): Promise<string | null | false> => {
    // Commands act on the admin's own team, never the one on screen; the price unit is the viewer's own preference.
    if (viewed && command.type !== 'priceDisplay') { toast.error(readOnly(viewed)); return false; }
    return await send(command, true);
  };
}
/** A queued command's answer as Convex pushes it (`team.commandAnswer`), or null when none came within COMMAND_WAIT_MS. */
function answered(cmd: string): Promise<CommandAnswer | null> {
  if (!convex) return Promise.resolve(null);
  const watch = convex.watchQuery(api.team.commandAnswer, { cmd });
  return new Promise(resolve => {
    let stop = () => {};
    const done = (answer: CommandAnswer | null) => { clearTimeout(timer); stop(); resolve(answer); };
    const timer = setTimeout(() => done(null), COMMAND_WAIT_MS);
    const look = () => { const answer = watch.localQueryResult(); if (answer) done(answer); };
    stop = watch.onUpdate(look);
    look();
  });
}
export type DraftBridge = { page: 'lab' | 'settings'; name: string; rules: TeamRules; dip: number; patch: StrategyPatch; context: () => string | null;
  apply: (patch: StrategyPatch) => void; drop: (keys: (keyof StrategyPatch)[]) => void; show: (ids: string[]) => void;
  replayed: { key: string; sol: number; picks: number; mean: number; base: { sol: number; picks: number; mean: number } } | null };
export const draftBridgeAtom = atom<DraftBridge | null>(null);
/** The proposal HOTBOT's card shows, for the page on screen to replay against its draft. */
export const draftProposalAtom = atom<StrategyPatch | null>(null);
/** Settings rows HOTBOT points at, by `data-setting` id: `SettingRow` and the other marked parts glow until it clears (`useSettingSpot`). */
export const settingSpotAtom = atom<{ ids: string[]; at: number } | null>(null);
/** The "Check a coin" dialog: open with an optional search and the strategy to check it against. */
export const checkCoinAtom = atom<{ query?: string; strategyId?: string } | null>(null);
/** The coin open in the quick look (CoinLook): its chart, decisions, trade and Rate, over any screen. */
export const coinLookAtom = atom<string | null>(null);
/** A report being made (`Report.tsx`): picking something on screen, or writing about it. `shown` is the data the screen composed for its target, as JSON. */
export type ReportDraft = { stage: 'pick' | 'write'; target?: ReportTarget; element?: string; shown?: string; kind?: ReportKind; comment?: string };
export const reportAtom = atom<ReportDraft | null>(null);
