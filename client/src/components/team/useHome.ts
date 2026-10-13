"use client";
import { atom, useAtomValue } from 'jotai';
import type { Watch } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api, convex } from '@/lib/convex';
import { currentUserIdAtom } from '@/store/user/atoms';
import { composeHome, homeAddresses, type Live } from '../../../../types/home';
import type { HomeData } from './data';
import { viewAsAtom } from './state';

type HomeResult = HomeData | null | undefined | Error;
const empty = atom<HomeResult>(undefined);

/** One live home per signed-in account (or the team an admin is viewing): `team.board` (a coin changes there only when something happens to it) and `team.prices` for the mints
 *  it shows (a price tick re-reads only those small rows), composed exactly as `team.home`. Closing/covering the tab releases both; returning
 *  keeps the last portfolio visible while Convex reconnects. Trading runs in the worker and does not depend on these UI subscriptions. */
const subscription = atom(get => {
  if (!get(currentUserIdAtom) || !convex) return empty;
  const client = convex, result = atom<HomeResult>(undefined), as = get(viewAsAtom);
  result.onMount = setResult => {
    const board = client.watchQuery(api.team.board, as);
    let prices: Watch<FunctionReturnType<typeof api.team.prices>> | undefined, key: string | undefined, last: Live | undefined;
    let stopBoard: (() => void) | undefined, stopPrices: (() => void) | undefined;
    const update = () => {
      try {
        const value = board.localQueryResult();
        if (value === undefined) return;
        if (value === null) { setResult(null); return; }
        // A new bag or ask changes the mints to watch; until their prices arrive the page shows the board with the prices it had.
        const addresses = homeAddresses(value), next = addresses.join(',');
        if (next !== key) { key = next; stopPrices?.(); prices = client.watchQuery(api.team.prices, { addresses }); stopPrices = prices.onUpdate(update); }
        last = prices?.localQueryResult() ?? last;
        if (last) setResult(composeHome(value, last));
      } catch (error) { setResult(error instanceof Error ? error : new Error(String(error))); }
    };
    const visible = () => {
      if (document.visibilityState === 'hidden') { stopBoard?.(); stopPrices?.(); stopBoard = stopPrices = key = undefined; }
      else if (!stopBoard) { stopBoard = board.onUpdate(update); update(); }
    };
    visible();
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); stopBoard?.(); stopPrices?.(); };
  };
  return result;
});
const home = atom(get => get(get(subscription)));

export function useHome(enabled = true) {
  const result = useAtomValue(enabled ? home : empty);
  if (result instanceof Error) throw result;
  return result;
}
