"use client";
import { useEffect, type MouseEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { toast } from 'sonner';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQuery } from 'convex/react';
import { Slot } from 'radix-ui';
import { api } from '@/lib/convex';
import { isAdminAtom } from '@/store/user/atoms';
import { STRATEGY_LIMIT, countsTowardLimit } from '../../../../types/team';
import { PORTFOLIO_LIMIT } from '../../../../types/portfolio';
import { useHome } from './useHome';
import { viewAsAtom } from './state';
import s from './team.module.css';

/** What HOTBOT says when a limit stops an add: every slot is in use, said as the team being busy. */
export type Limit = { title: string; detail: string };
const capacity = (what: string): Limit => ({ title: 'At capacity', detail: `Your ${what} are all hard at work. Archive one to make room.` });
/** Slots in use and the limit, which is null for an admin (who has none); null while the list loads. */
export type Count = { kept: number; limit: number | null };

/** The strategies that count toward STRATEGY_LIMIT, Paper and Real SOL together. The server counts the same way (`refuseOverLimit`). */
export function useStrategyCount(): Count | null {
  const admin = useAtomValue(isAdminAtom), data = useHome();
  return data ? { kept: data.strategies.filter(countsTowardLimit).length, limit: admin ? null : STRATEGY_LIMIT } : null;
}

/** The limit that stops `adding` more strategies, or null. Short of slots but not full, it names the slots free and needed. */
export function useStrategyLimit(adding = 1): Limit | null {
  const count = useStrategyCount();
  if (!count || count.limit === null || count.kept + adding <= count.limit) return null;
  const free = count.limit - count.kept, more = adding - free;
  return free > 0 ? { title: 'At capacity', detail: `Only ${free} of ${count.limit} slots free. Archive ${more === 1 ? 'one' : more} to make room.` } : capacity(`${count.limit} strategies`);
}

/** The portfolios kept: the same list the sidebar and the Portfolios page watch, so it adds no subscription. */
export function usePortfolioCount(): Count | null {
  const admin = useAtomValue(isAdminAtom), rows = useQuery(api.portfolios.list, { ...useAtomValue(viewAsAtom) });
  return rows ? { kept: rows.length, limit: admin ? null : PORTFOLIO_LIMIT } : null;
}

/** The limit that stops a new portfolio, or null. */
export function usePortfolioLimit(): Limit | null {
  const count = usePortfolioCount();
  return count && count.limit !== null && count.kept >= count.limit ? capacity(`${count.limit} portfolios`) : null;
}

/** How long HOTBOT shows a capacity notice. */
const CAPACITY_MS = 1600;
/** HOTBOT shakes its head once on this device; later, a capacity notice is a toast. */
const SEEN_KEY = 'hotbot:capacity-seen';
const capacityAtom = atom<(Limit & { at: number }) | null>(null);
/** The HOTBOT buttons that can act out a capacity notice: the desktop disc and the phone bar's middle button. Only a shown one plays it. */
const stages = new Set<HTMLElement>();

/** An add control past its limit: greyed out. The first hover (a tap on touch) has HOTBOT shake its head; later taps show a toast. The
 *  click is stopped in its capture phase, so the control's own action (a link, a command, a dialog trigger) never runs. */
export function AtLimit({ limit, children }: { limit: Limit | null; children: ReactElement }) {
  const show = useSetAtom(capacityAtom);
  if (!limit) return children;
  const raise = (clicked: boolean) => {
    const seen = localStorage.getItem(SEEN_KEY) !== null, stage = [...stages].some(element => element.getClientRects().length > 0);
    if (!seen && stage) { localStorage.setItem(SEEN_KEY, '1'); show({ ...limit, at: Date.now() }); }
    else if (clicked) toast(limit.title, { id: 'capacity', description: limit.detail });
  };
  return <Slot.Root className={s.atLimit} aria-disabled data-limit=""
    onPointerEnter={(event: PointerEvent) => { if (event.pointerType === 'mouse') raise(false); }}
    onClickCapture={(event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); raise(true); }}>{children}</Slot.Root>;
}

/** The capacity notice a HOTBOT button acts out while it shows, for `button`, which joins the stages while mounted. */
export function useCapacity(button: RefObject<HTMLElement | null>) {
  const [notice, setNotice] = useAtom(capacityAtom);
  useEffect(() => {
    const element = button.current;
    if (!element) return;
    stages.add(element);
    return () => { stages.delete(element); };
  }, [button]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(shown => shown?.at === notice.at ? null : shown), CAPACITY_MS);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);
  return notice;
}
