"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { useAtomValue } from 'jotai';
import { api } from '@/lib/convex';
import { store } from '@/store/store';
import { authTokenAtom } from '@/store/user/atoms';
import type { CoinAnswer, CoinHit, CoinRequest, LabMeta, LabReply, LabRequest, Tip, TipRow } from '../../../../types/lab';
import type { OwnTrade } from './labModel';
import { viewAsAtom } from './state';

const headers = () => ({ 'content-type': 'application/json', Authorization: `Bearer ${store.get(authTokenAtom) ?? ''}` });
/** One request to the server Lab: its JSON, or its error message. */
async function ask<T>(init: RequestInit & { search?: string } = {}): Promise<T> {
  const response = await fetch(init.search === undefined ? '/api/lab' : `/api/lab?search=${encodeURIComponent(init.search)}`, { ...init, headers: headers() });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'The Lab didn’t answer.');
  return response.json() as Promise<T>;
}
const post = <T>(body: unknown, signal?: AbortSignal) => ask<T>({ method: 'POST', body: JSON.stringify(body), signal });

let loading: Promise<LabMeta> | null = null;
/** What the Lab's data covers, fetched once a page load and kept for every page that asks. */
export function useLabData() {
  const [state, setState] = useState<{ data?: LabMeta; error?: string }>({});
  useEffect(() => {
    let live = true;
    loading ??= ask<LabMeta>();
    loading.then(data => live && setState({ data }), (cause: Error) => { loading = null; if (live) setState({ error: cause.message }); });
    return () => { live = false; };
  }, []);
  return state;
}

const NONE: OwnTrade[] = [];
/** Sold coins, read once a visit: the portfolio's latest 500, or one strategy's latest `limit` (50 unless asked, at most 500; by index, so a busy
 *  sibling never crowds it out). `null`: no strategy to read (a blank one in the Lab), so none. */
export function useOwnTrades(strategyId?: string | null, limit?: number) {
  const convex = useConvex(), as = useAtomValue(viewAsAtom), [trades, setTrades] = useState<{ key: string; rows: OwnTrade[] }>();
  const key = JSON.stringify([as, strategyId, limit]);
  useEffect(() => {
    if (strategyId === null) return;
    let live = true;
    convex.query(api.team.trades, { ...as, ...(strategyId ? { strategyId, ...(limit ? { limit } : {}) } : {}) }).then(rows => live && setTrades({ key, rows: rows as OwnTrade[] }), () => live && setTrades({ key, rows: [] }));
    return () => { live = false; };
  }, [convex, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return strategyId === null ? NONE : trades?.key === key ? trades.rows : undefined;
}

/** The server Lab's answer to the draft, 150 ms after the last change: the main answer, then the tips (`tips` rows). Only the newest request's
 *  answers are kept, and the previous answer stays while a new one computes (`pending`). */
export function useLab(data: LabMeta | undefined, request: (LabRequest & { tips?: TipRow[] }) | null) {
  const id = useRef(0);
  const [main, setMain] = useState<(Extract<LabReply, { kind: 'main' }> & { id: number }) | null>(null), [tips, setTips] = useState<{ id: number; tips: Tip[] } | null>(null), [asked, setAsked] = useState(0);
  const key = request && data ? JSON.stringify(request) : null;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const n = ++id.current, { tips: rows, ...body } = JSON.parse(key) as LabRequest & { tips?: TipRow[] };
      setAsked(n);
      post<Extract<LabReply, { kind: 'main' }>>({ kind: 'main', ...body }, controller.signal).then(reply => {
        if (n !== id.current) return;
        setMain({ ...reply, id: n });
        if (rows?.length) post<Extract<LabReply, { kind: 'tips' }>>({ kind: 'tips', strategyId: body.strategyId, since: body.since, draft: body.draft, tips: rows }, controller.signal)
          .then(answer => { if (n === id.current) setTips({ id: n, tips: answer.tips }); }, () => {});
      }, (cause: Error) => { if (cause.name !== 'AbortError') console.error('Lab:', cause.message); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key]);
  const tipMap = useMemo(() => new Map<string, Tip>((tips?.id === main?.id ? tips?.tips ?? [] : []).map(tip => [tip.key, tip])), [tips, main]);
  return { main, tips: tipMap, pending: !main || main.id !== asked };
}

export const replayOnLab = (request: CoinRequest, signal?: AbortSignal) => post<CoinAnswer>({ kind: 'coin', ...request }, signal);
/** Coins the Lab's data holds that match a name, ticker or address. */
export const searchLab = (text: string, signal?: AbortSignal) => ask<CoinHit[]>({ search: text, signal });
