import { useCallback, useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { MARKET_BATCH, MARKET_CANDLES, MARKET_PERIODS, MARKET_WS_SUBS, type CandlesAnswer, type CoinAnswer, type CoinsAnswer, type MarketBar, type MarketClientMessage, type MarketPeriod, type MarketServerMessage, type SolAnswer } from '../../../types/marketFeed';
import { TEAM_REAUTH_MS, teamTokenWs } from '../../../types/teamFeed';

const MARKET_URL = (process.env.NEXT_PUBLIC_MARKET_URL ?? '').replace(/\/+$/, ''), SOCKET_URL = MARKET_URL.replace(/^http/, 'ws') + '/ws';
const TIMEOUT_MS = 10_000;
const flying = new Map<string, Promise<unknown>>();

/** One GET on the gateway, null for a 404. Equal requests in flight share one fetch, so a caller's abort ends only its own wait. */
function get<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T | null> {
  const query = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => value === undefined ? [] : [[key, String(value)]])).toString();
  const url = `${MARKET_URL}${path}${query ? '?' + query : ''}`;
  let request = flying.get(url) as Promise<T | null> | undefined;
  if (!request) {
    request = fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(response => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Market data is unavailable (${response.status}).`);
      return response.json() as Promise<T>;
    }).finally(() => flying.delete(url));
    flying.set(url, request);
  }
  if (!signal) return request;
  const shared = request;
  return new Promise<T | null>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** A coin's details, or null for a coin the indexer never stored. `holders`: the token page's read, with the gateway's holder figures. */
export const marketCoin = (mint: string, signal?: AbortSignal, holders = false) => get<CoinAnswer>('/coin', { mint, holders: holders ? 1 : undefined }, signal);
/** The coins the gateway knows among `mints`, MARKET_BATCH to a request. */
export async function marketCoins(mints: readonly string[], signal?: AbortSignal) {
  const unique = [...new Set(mints)].sort(), pages: Promise<CoinsAnswer | null>[] = [];
  for (let index = 0; index < unique.length; index += MARKET_BATCH) pages.push(get<CoinsAnswer>('/coins', { mints: unique.slice(index, index + MARKET_BATCH).join(',') }, signal));
  return (await Promise.all(pages)).flatMap(answer => answer?.data ?? []);
}
/** The coins that match `q`, best first. */
export const marketSearch = async (q: string, signal?: AbortSignal) => (await get<CoinsAnswer>('/search', { q }, signal))?.data ?? [];
/** SOL's price in USD. */
export const marketSol = (signal?: AbortSignal) => get<SolAnswer>('/sol', {}, signal);
/** The start of the period that `t` falls in (ms). */
export const bucketOf = (t: number, step: number) => Math.floor(t / step) * step;
/** A coin's candles, oldest first: those with from ≤ t < to, or with `limit` the latest `limit` before `to`, `from` then only bounding the
 *  search. A range of more than MARKET_CANDLES candles is read in pieces: the first piece's `from`, and the newest `through`. */
export async function marketCandles(mint: string, period: MarketPeriod, from: number, to: number, limit?: number, signal?: AbortSignal): Promise<CandlesAnswer> {
  const read = (from: number, to: number) => get<CandlesAnswer>('/candles', { mint, period, from, to, limit }, signal).then(answer => answer ?? { rows: [], from });
  if (limit) return read(from, to);
  const span = MARKET_PERIODS[period] * MARKET_CANDLES, pieces: Promise<CandlesAnswer>[] = [];
  for (let at = from; at < to; at += span) pieces.push(read(at, Math.min(to, at + span)));
  const answers = await Promise.all(pieces), through = Math.max(...answers.map(answer => answer.through ?? -Infinity)), first = answers.find(answer => answer.first !== undefined)?.first;
  return { rows: answers.flatMap(answer => answer.rows), from: answers[0]?.from ?? from, ...(Number.isFinite(through) && { through }), ...(first !== undefined && { first }) };
}

/** A coin's newest price tick (`p` in MarketServerMessage), and `at`, when it arrived on this clock. */
export type MarketTick = { p: number; c: number | null; l: number | null; t: number; at: number };
type Kind = 'prices' | 'bars';
/** The socket closes LINGER_MS after nothing watches it. A dropped socket reconnects after RETRY_MS, doubling to RETRY_MAX_MS, each wait ±50%. */
const LINGER_MS = 10_000, RETRY_MS = 500, RETRY_MAX_MS = 30_000;
/** How many components want each coin's prices and bars, in the order they first did; `sent`: what the gateway holds for this socket. */
const wants: Record<Kind, Map<string, number>> = { prices: new Map(), bars: new Map() };
let sent: Record<Kind, Set<string>> = { prices: new Set(), bars: new Set() };
const tickListeners = new Map<string, Set<() => void>>(), barListeners = new Map<string, Set<(bars: MarketBar[]) => void>>();
const solListeners = new Set<(usd: number) => void>(), socketListeners = new Set<() => void>();
const ticks = new Map<string, MarketTick>(), marks = new Map<string, { priceUsd: number; supply: number | null; at: number }>();
/** `seenAt`: when the gateway last read the indexer, from its latest `hello` or `sol`, the earlier of its clock and this one. */
let socket: WebSocket | null = null, openedAt = 0, seenAt = 0, sol: number | null = null, failures = 0, queued = false;
let retry: ReturnType<typeof setTimeout> | undefined, linger: ReturnType<typeof setTimeout> | undefined;

const watched = () => wants.prices.size + wants.bars.size + solListeners.size > 0 || team !== null;
const notify = (mint: string) => { for (const listener of tickListeners.get(mint) ?? []) listener(); };
function listen<T>(map: Map<string, Set<T>>, mint: string, listener: T) {
  const set = map.get(mint) ?? new Set<T>();
  map.set(mint, set.add(listener));
  return () => { set.delete(listener); if (!set.size) map.delete(mint); };
}

/** Opens the socket while anything watches it, and closes it LINGER_MS after nothing does. */
function settle() {
  if (watched()) {
    clearTimeout(linger); linger = undefined;
    if (!socket && retry === undefined) connect();
  } else if (socket) linger ??= setTimeout(() => { linger = undefined; if (!watched()) drop(); }, LINGER_MS);
  else { clearTimeout(retry); retry = undefined; }
}
function connect() {
  let ws: WebSocket;
  try { ws = new WebSocket(SOCKET_URL); } catch { return reconnect(); }
  socket = ws;
  ws.onopen = () => { failures = 0; openedAt = Date.now(); sent = { prices: new Set(), bars: new Set() }; flush(); teamAuth(); for (const listener of socketListeners) listener(); };
  ws.onmessage = event => { if (typeof event.data === 'string') receive(JSON.parse(event.data) as MarketServerMessage); };
  ws.onclose = () => { if (socket !== ws) return; drop(); reconnect(); };
}
/** Forgets the socket and the ticks it brought, since a price without its socket may be stale. */
function drop() {
  const ws = socket;
  socket = null; openedAt = 0; seenAt = 0; teamHeard = false;
  ws?.close();
  const stale = [...ticks.keys()];
  ticks.clear();
  stale.forEach(notify);
  for (const listener of socketListeners) listener();
  team?.listener(null);
}
function reconnect() {
  if (!watched() || retry !== undefined) return;
  retry = setTimeout(() => { retry = undefined; if (watched() && !socket) connect(); }, Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** failures++) * (0.5 + Math.random()));
}
function receive(message: MarketServerMessage) {
  if (message.k === 'p') {
    if (!sent.prices.has(message.a)) return;
    ticks.set(message.a, { p: message.p, c: message.c, l: message.l, t: message.t, at: Date.now() });
    marks.set(message.a, { priceUsd: message.p, supply: message.c != null && message.c > 0 && message.p > 0 ? message.c / message.p : null, at: message.t });
    notify(message.a);
  } else if (message.k === 'b') for (const listener of barListeners.get(message.a) ?? []) listener(message.bars);
  // A feed of another team (one this tab watched before, or a refusal of an older token) is not this watch's.
  else if (message.k === 't') {
    if (!team?.ws || message.ws !== team.ws) return;
    team.listener('stale' in message ? { stale: message.stale } : { view: message.view, at: message.at });
    // The first feed says the gateway joined the team: every coin page waiting asks now; later views ask again for the pages the worker holds.
    const first = !teamHeard;
    teamHeard = true;
    for (const [ref, watch] of coinWatches) if (first || (watch.answer && 'coin' in watch.answer && watch.answer.coin !== null)) askCoin(ref);
  } else if (message.k === 'c') answerCoin(message.id, 'stale' in message ? { stale: message.stale } : { coin: message.coin });
  else {
    const usd = message.k === 'hello' ? message.sol : message.usd;
    seenAt = Math.min(message.at, Date.now());
    if (typeof usd === 'number' && usd > 0) { sol = usd; for (const listener of solListeners) listener(usd); }
    for (const listener of socketListeners) listener();
  }
}
/** Sends what changed since the last flush as one `unsub` and one `sub`. Past MARKET_WS_SUBS, bars come first, then prices in the order
 *  they were first wanted. */
function flush() {
  const ws = socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const bars = [...wants.bars.keys()].slice(0, MARKET_WS_SUBS);
  const next: Record<Kind, Set<string>> = { bars: new Set(bars), prices: new Set([...wants.prices.keys()].slice(0, MARKET_WS_SUBS - bars.length)) };
  const sub: MarketClientMessage = { op: 'sub' }, unsub: MarketClientMessage = { op: 'unsub' };
  for (const kind of ['prices', 'bars'] as const) {
    const added = [...next[kind]].filter(mint => !sent[kind].has(mint)), removed = [...sent[kind]].filter(mint => !next[kind].has(mint));
    if (added.length) sub[kind] = added;
    if (removed.length) unsub[kind] = removed;
  }
  sent = next;
  for (const mint of unsub.prices ?? []) if (ticks.delete(mint)) notify(mint);
  if (unsub.prices || unsub.bars) ws.send(JSON.stringify(unsub));
  if (sub.prices || sub.bars) ws.send(JSON.stringify(sub));
}
/** Counts one more component that wants `mint`'s prices or bars; the call it returns counts it out. Changes go out together a microtask later. */
function want(kind: Kind, mint: string) {
  const changed = () => {
    settle();
    if (!queued) { queued = true; queueMicrotask(() => { queued = false; flush(); }); }
  };
  wants[kind].set(mint, (wants[kind].get(mint) ?? 0) + 1);
  changed();
  return () => {
    const left = (wants[kind].get(mint) ?? 1) - 1;
    if (left > 0) wants[kind].set(mint, left); else wants[kind].delete(mint);
    changed();
  };
}
function watchPrice(mint: string, listener: () => void) {
  const stop = listen(tickListeners, mint, listener), release = want('prices', mint);
  return () => { stop(); release(); };
}
/** Watches these coins' prices outside React: `listener` runs on each of their ticks, and `marketTick` reads the newest. The call it returns stops. */
export function watchPrices(mints: string[], listener: () => void) {
  const stops = mints.map(mint => watchPrice(mint, listener));
  return () => { for (const stop of stops) stop(); };
}
/** The coin's last price, the supply its market cap implies and its latest trade (`at`). It stays while the socket reconnects, as a held
 *  coin's mark should. */
export const lastMark = (mint: string) => marks.get(mint);
/** `lastMark` while mounted, renewed by each of the coin's ticks. */
export function useMarketMark(mint: string | null | undefined) {
  const subscribe = useCallback((listener: () => void) => mint ? watchPrice(mint, listener) : () => {}, [mint]);
  return useSyncExternalStore(subscribe, () => mint ? marks.get(mint) : undefined, () => undefined);
}
const watchSocket = (listener: () => void) => { socketListeners.add(listener); return () => { socketListeners.delete(listener); }; };

/** Hands SOL's price to `listener` now when it is known, then on each `hello` and `sol`. It holds the socket open until the call it returns. */
export function watchSol(listener: (usd: number) => void) {
  solListeners.add(listener);
  if (sol != null) listener(sol);
  settle();
  return () => { solListeners.delete(listener); settle(); };
}
/** The coin's newest tick while mounted: undefined before the first one and while the socket is down. */
export function useMarketPrice(mint: string | null | undefined) {
  const subscribe = useCallback((listener: () => void) => mint ? watchPrice(mint, listener) : () => {}, [mint]);
  return useSyncExternalStore(subscribe, () => mint ? ticks.get(mint) : undefined, () => undefined);
}
/** Hands each batch of the coin's closed 1-second bars to `onBars`, oldest first, while mounted. A null mint watches nothing. */
export function useMarketBars(mint: string | null, onBars: (bars: MarketBar[]) => void) {
  const take = useEffectEvent(onBars);
  useEffect(() => {
    if (!mint) return;
    const stop = listen(barListeners, mint, (bars: MarketBar[]) => take(bars)), release = want('bars', mint);
    return () => { stop(); release(); };
  }, [mint]);
}
/** When the socket last opened, on this clock; 0 while it is down. A read from before then can miss the bars of the time it was down. */
export function useMarketOpenedAt() {
  return useSyncExternalStore(watchSocket, () => openedAt, () => 0);
}
/** When the gateway last read the indexer, renewed by each `hello` and `sol` (the earlier of its clock and this one); 0 while the socket is down. */
export function useMarketSeenAt() {
  return useSyncExternalStore(watchSocket, () => seenAt, () => 0);
}

/** The team topic as the gateway last sent it: the view the team's worker pushed (`at`: when), or `stale` with the reason none comes now;
 *  null while the socket is down. */
export type TeamFeed = { view: unknown; at: number } | { stale: string } | null;
/** The one team this tab watches: where its token comes from, the team its last token named (`ws`), who hears its feed, and the timer
 *  that sends a new token. */
let team: { token: () => Promise<string>; ws?: string; listener: (feed: TeamFeed) => void; renew?: ReturnType<typeof setInterval> } | null = null;
/** Sends the team's token on the open socket now and every TEAM_REAUTH_MS, so the gateway never sees it end; a token that cannot be had
 *  reads as a stale topic. */
function teamAuth() {
  const watching = team;
  if (!watching || !socket || socket.readyState !== WebSocket.OPEN) return;
  const ws = socket, send = () => watching.token().then(token => {
    if (team !== watching || socket !== ws || ws.readyState !== WebSocket.OPEN) return;
    watching.ws = teamTokenWs(token);
    ws.send(JSON.stringify({ op: 'team', token } satisfies MarketClientMessage));
  }, (error: unknown) => { if (team === watching) watching.listener({ stale: error instanceof Error ? error.message : String(error) }); });
  clearInterval(watching.renew);
  watching.renew = setInterval(send, TEAM_REAUTH_MS);
  void send();
}
/** Watches the team that `token`'s passes name on the gateway's socket, handing each feed to `listener`; the call it returns stops. */
export function watchTeam(token: () => Promise<string>, listener: (feed: TeamFeed) => void) {
  const watching = { token, listener };
  team = watching; teamHeard = false;
  settle();
  teamAuth();
  return () => {
    if (team !== watching) return;
    clearInterval(team.renew);
    team = null; teamHeard = false;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'unteam' } satisfies MarketClientMessage));
    settle();
  };
}

export type WorkerCoin = { coin: unknown } | { stale: string };
/** How long an ask waits for its answer before it reads as stale (the gateway answers within TEAM_PULL_MS; a refused token never). */
const COIN_ASK_MS = 5_000;
/** The coin pages watched, by reference: their listeners, the last answer, the ask out (its id) and whether another is due after it.
 *  `teamHeard`: the gateway sent the watched team's feed on this socket, so it has joined the team and takes coin asks. */
const coinWatches = new Map<string, { listeners: Set<(answer: WorkerCoin) => void>; answer?: WorkerCoin; out?: number; again: boolean }>();
let coinAskId = 0, teamHeard = false;
function askCoin(ref: string) {
  const watch = coinWatches.get(ref);
  if (!watch) return;
  if (watch.out !== undefined) { watch.again = true; return; }
  if (!team || !teamHeard || socket?.readyState !== WebSocket.OPEN) { if (!team) deliver(ref, { stale: 'The team topic is off' }); return; }
  const id = watch.out = ++coinAskId;
  socket.send(JSON.stringify({ op: 'coin', id, ref } satisfies MarketClientMessage));
  setTimeout(() => answerCoin(id, { stale: 'The team’s worker did not answer in time' }), COIN_ASK_MS);
}
function answerCoin(id: number, value: WorkerCoin) {
  const [ref, watch] = [...coinWatches].find(([, row]) => row.out === id) ?? [];
  if (!ref || !watch) return;
  watch.out = undefined;
  deliver(ref, value);
  if (watch.again) { watch.again = false; askCoin(ref); }
}
function deliver(ref: string, value: WorkerCoin) {
  const watch = coinWatches.get(ref);
  if (!watch) return;
  watch.answer = value;
  for (const listener of watch.listeners) listener(value);
}
/** Watches a coin's page as the watched team's worker holds it: asked now, again at each view the worker pushes while it holds the coin,
 *  and at the next join of the team topic; the call it returns stops. */
export function watchWorkerCoin(ref: string, listener: (answer: WorkerCoin) => void) {
  let watch = coinWatches.get(ref);
  if (!watch) { coinWatches.set(ref, watch = { listeners: new Set(), again: false }); askCoin(ref); }
  watch.listeners.add(listener);
  if (watch.answer) listener(watch.answer);
  return () => { watch.listeners.delete(listener); if (!watch.listeners.size && coinWatches.get(ref) === watch) coinWatches.delete(ref); };
}
