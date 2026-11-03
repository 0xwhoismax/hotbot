"use client";
import { usePathname } from 'next/navigation';
import { useDeferredValue, useEffect, useState, useSyncExternalStore, type ComponentProps, type MouseEvent } from 'react';

/** The app is one static page for every /app address (public/_redirects). A move inside it changes the address with the History API, and
 *  Next.js updates its pathname, so no request reaches the Worker. A move to or from any other page loads that page. */
const inApp = (pathname: string) => pathname === '/app' || pathname.startsWith('/app/');

let scrollPending = false;
/** True once after a move to another page, for the commit that shows it. */
export function takeNavigationScroll() {
  const pending = scrollPending;
  scrollPending = false;
  return pending;
}

/** Where the page on screen sits: its name as its header shows it, and the strategy it belongs to (a coin's, a bot page's filter). Pages
 *  publish it with `usePlace`; the sidebar lights that strategy, and a move records the name of the page it leaves for Back. */
export type Place = { label: string; strategyId?: string | null };
let place: Place | null = null;
const placeListeners = new Set<() => void>();
const setPlace = (next: Place | null) => { place = next; placeListeners.forEach(listener => listener()); };
const watchPlace = (listener: () => void) => { placeListeners.add(listener); return () => { placeListeners.delete(listener); }; };
export const useCurrentPlace = () => useSyncExternalStore(watchPlace, () => place, () => null);
export function usePlace(label: string | null | undefined, strategyId?: string | null) {
  useEffect(() => {
    if (!label) return;
    const mine = { label, strategyId };
    setPlace(mine);
    return () => { if (place === mine) setPlace(null); };
  }, [label, strategyId]);
}

/** The name of a page that publishes no place, by its path (or its section's). */
const PAGE_NAMES: Record<string, string> = { '/app': 'Home', '/app/strategies': 'Strategies', '/app/portfolios': 'Portfolios', '/app/lab': 'Lab', '/app/account': 'Account', '/app/new': 'New strategy' };

/** What an app move keeps in its history entry: the page it came from (path and query), that page's name, and how many entries back it is.
 *  A move that changes only the query (a filter) stays on the same page, so it keeps the entry's page before, one step further back. */
type Trail = { from: string; label: string; back: number };
const trailOf = (state: unknown): Trail | null => {
  const value = state as Partial<Trail> | null;
  return value && typeof value.from === 'string' && typeof value.label === 'string' && typeof value.back === 'number' ? { from: value.from, label: value.label, back: value.back } : null;
};
const trailListeners = new Set<() => void>();
const watchTrail = (listener: () => void) => {
  trailListeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => { trailListeners.delete(listener); window.removeEventListener('popstate', listener); };
};

/** False when Next.js must load the page: another origin or a page outside the app. */
function move(url: URL, replace: boolean) {
  if (url.origin !== location.origin || !inApp(url.pathname) || !inApp(location.pathname)) return false;
  scrollPending = url.pathname !== location.pathname;
  const held = trailOf(history.state);
  const trail = replace ? held : url.pathname === location.pathname ? held && { ...held, back: held.back + 1 }
    : { from: location.pathname + location.search, label: place?.label ?? PAGE_NAMES[location.pathname] ?? PAGE_NAMES[location.pathname.split('/').slice(0, 3).join('/')] ?? 'Back', back: 1 };
  if (replace) history.replaceState(trail, '', url); else history.pushState(trail, '', url);
  trailListeners.forEach(listener => listener());
  return true;
}

/** A history entry for a view inside the page on screen (Settings over its strategy): `state` beside the entry's own, its page before one
 *  step further back, so Back from a move made there still reaches that page. */
export function pushOnPage(state: Record<string, unknown>) {
  const held = trailOf(history.state);
  history.pushState({ ...history.state, ...state, ...(held && { back: held.back + 1 }) }, '');
  trailListeners.forEach(listener => listener());
}

/** Back on a page: to the app page it was opened from, named as that page names itself. Going back walks the history, so the browser's Back
 *  and Forward stay in step. A page opened with no app page before it goes to `fallback` in its place, so that page's own Back never leads here. */
export type BackLink = { href: string; label: string; onClick: (event: MouseEvent) => void };
export function useBack(fallback: { href: string; label: string }): BackLink {
  // The history entry and its address change at once, the page on screen with the deferred pathname: until that page is drawn, the page
  // being left keeps the trail of its own entry.
  const pathname = useShellPathname(), entry = useSyncExternalStore(watchTrail, () => JSON.stringify([location.pathname, trailOf(history.state)]), () => JSON.stringify(['', null]));
  const [drawn, setDrawn] = useState(entry);
  if (drawn !== entry && (JSON.parse(entry) as [string, Trail | null])[0] === pathname) setDrawn(entry);
  const trail = (JSON.parse(drawn) as [string, Trail | null])[1];
  return { ...(trail ? { href: trail.from, label: trail.label } : fallback), onClick: event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (trail) history.go(-trail.back); else go(fallback.href, true);
  } };
}

/** The address as a web page, or null: `location` runs a `javascript:` address as script in this page. */
function webUrl(href: string) {
  try { const url = new URL(href, location.href); return url.protocol === 'http:' || url.protocol === 'https:' ? url : null; } catch { return null; }
}

function go(href: string, replace: boolean) {
  const url = webUrl(href);
  if (!url || move(url, replace)) return;
  if (replace) location.replace(url.href); else location.assign(url.href);
}

const router = { push: (href: string) => go(href, false), replace: (href: string) => go(href, true) };
export const useRouter = () => router;

/** A path on this site from any page, also while the server draws it: one leading slash, and no backslash, tab or newline, which a browser
 *  reads as a slash or drops. */
const sitePath = (href: string) => /^\/(?![/\\])[^\\\t\n\r]*$/.test(href);

/** A link to a page on this site: a plain left click inside the app moves without a request. Every other page is a page load, so nothing is
 *  prefetched (Next.js's RSC request for a static page gets its HTML). Any other address gets no href, so it never reaches the page. */
export function Link({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  const local = sitePath(href);
  return <a {...props} href={local ? href : undefined} onClick={event => {
    onClick?.(event);
    if (!local || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self')) return;
    const url = webUrl(href);
    if (url && move(url, false)) event.preventDefault();
  }}/>;
}

const never = () => () => {};
/** The pathname, or '' until hydration ends: one static page serves every /app address, so the server drew it for none of them. The value is
 *  deferred because Next.js applies a History API move as an urgent update, and React runs a view transition (the page swap) only for a
 *  transition or a deferred value. */
export function useShellPathname() {
  const pathname = useDeferredValue(usePathname()), hydrated = useSyncExternalStore(never, () => true, () => false);
  return hydrated ? pathname : '';
}
