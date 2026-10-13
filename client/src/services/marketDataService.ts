import type { TokenData, OHLCVData } from '@/types/dataApiTypes';
import { queryClient } from '@/lib/queryClient';
import { isSolanaMint, normalizeSolanaToken, resolveSolanaToken } from './solanaTokenSearch';
const BASE = '/api-mobula';
const TTL = 60_000;
function toQueryString(params: Record<string, unknown> = {}): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => usp.append(key, String(v)));
      return;
    }
    usp.set(key, String(value));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const FETCH_TIMEOUT_MS = 12_000;

function isRetriableStatus(status: number) {
  // Don't retry 429 — our own proxy rate-limits and retrying just burns more quota
  return status >= 500 && status < 600;
}

function retryDelayFromHeaders(res: Response, attempt: number) {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  const backoffs = [250, 500, 1000, 1500];
  return backoffs[attempt - 1] ?? 1000;
}

const inflightRequests = new Map<string, Promise<unknown>>();

async function deduplicatedFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetchFn().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, promise);
  return promise;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Mobula API timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = `${BASE}${path}${toQueryString(params)}`;

  return deduplicatedFetch(url, async () => {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetchWithTimeout(url, { method: 'GET' }).catch((netErr) => {
        // Network error (offline, DNS, etc.) — retry
        if (attempt < attempts) return null;
        throw netErr instanceof Error ? netErr : new Error(String(netErr));
      });
      if (!res) { await wait(150 * Math.pow(2, attempt - 1)); continue; }
      if (res.ok) return res.json() as Promise<T>;
      if (isRetriableStatus(res.status) && attempt < attempts) {
        await wait(retryDelayFromHeaders(res, attempt));
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Mobula API ${res.status} ${text || res.statusText}`);
    }
    throw new Error('Mobula API request failed');
  });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const key = `POST:${url}:${JSON.stringify(body)}`;

  return deduplicatedFetch(key, async () => {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((netErr) => {
        if (attempt < attempts) return null;
        throw netErr instanceof Error ? netErr : new Error(String(netErr));
      });
      if (!res) { await wait(150 * Math.pow(2, attempt - 1)); continue; }
      if (res.ok) return res.json() as Promise<T>;
      if (isRetriableStatus(res.status) && attempt < attempts) {
        await wait(retryDelayFromHeaders(res, attempt));
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Mobula API ${res.status} ${text || res.statusText}`);
    }
    throw new Error('Mobula API request failed');
  });
}


export async function fetchTokenData(address: string, blockchain: string = 'solana', staleTime = TTL): Promise<TokenData | null> {
  if (blockchain !== 'solana') throw new Error('Only Solana is supported');
  return queryClient.fetchQuery({ queryKey: ['tokenDetails', address], staleTime, queryFn: ({ signal }) => resolveSolanaToken(address, signal) });
}
export function getCachedMultipleTokenDetails(addresses: string[]): Record<string, TokenData> {
  return queryClient.getQueryData(['mobula', 'multi', [...new Set(addresses)].sort()]) ?? {};
}
export async function getMultipleTokenDetails(addresses: string[]): Promise<Record<string, TokenData>> {
  const unique = [...new Set(addresses)].sort();
  if (unique.some(address => !isSolanaMint(address))) throw new Error('Invalid Solana mint');
  return queryClient.fetchQuery({ queryKey: ['mobula', 'multi', unique], staleTime: TTL, queryFn: async () => {
    const results: Record<string, TokenData> = {};
    const chunks: string[][] = [];
    for (let index = 0; index < unique.length; index += 20) chunks.push(unique.slice(index, index + 20));
    await Promise.all(chunks.map(async chunk => {
      const response = await postJson<{ payload?: unknown[] }>('/2/token/details', chunk.map(address => ({ address, blockchain: 'solana' })));
      if (!Array.isArray(response.payload)) throw new Error('Invalid token details response');
      for (const item of response.payload) {
        const token = normalizeSolanaToken(item);
        if (token && chunk.includes(token.address)) results[token.address] = token;
      }
    }));
    return results;
  } });
}

/* ------------- OHLCV endpoints ------------------ */
function mapTimeframeToPeriod(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '240': '4h', 'D': '1d', 'W': '1w',
  };
  return tf === '1M' ? '1M' : map[tf] ?? tf.toLowerCase();
}

function normalizeOhlcvRows(rows: Array<{ t?: number; o?: number; h?: number; l?: number; c?: number; v?: number }>): OHLCVData[] {
  return rows
    .map((item) => ({
      timestamp: (item.t ?? 0) > 0 && (item.t ?? 0) < 10_000_000_000 ? (item.t ?? 0) * 1000 : (item.t ?? 0),
      open: item.o ?? 0,
      high: item.h ?? 0,
      low: item.l ?? 0,
      close: item.c ?? 0,
      volume: item.v ?? 0,
    }))
    .filter((item) => item.open > 0 && item.close > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function stripLeadingOhlcvAnchor(rows: OHLCVData[], periodMs: number): OHLCVData[] {
  if (rows.length < 2) return rows;

  const first = rows[0];
  const second = rows[1];
  const gapMs = second.timestamp - first.timestamp;
  const samePrice = Math.abs(second.open - first.close) <= first.close * 0.000001;
  if (gapMs > periodMs * 12 && samePrice) {
    return rows.slice(1);
  }
  return rows;
}

function periodToMs(period: string): number {
  const value = Number(period.slice(0, -1));
  if (!Number.isFinite(value) || value <= 0) return 24 * 60 * 60_000;
  if (period.endsWith('s')) return value * 1000;
  if (period.endsWith('m')) return value * 60_000;
  if (period.endsWith('h')) return value * 60 * 60_000;
  if (period.endsWith('w')) return value * 7 * 24 * 60 * 60_000;
  if (period.endsWith('M')) return value * 30 * 24 * 60 * 60_000;
  return value * 24 * 60 * 60_000;
}

type RawOhlcvRow = { t?: number; o?: number; h?: number; l?: number; c?: number; v?: number };

async function fetchOhlcvHistoryPage(
  address: string,
  chainId: string,
  period: string,
  timeFromMs: number,
  timeToMs: number,
  amount?: number,
): Promise<OHLCVData[]> {
  const chartData = await fetchJson<{ data?: RawOhlcvRow[] }>(
    '/2/token/ohlcv-history',
    {
      address,
      chainId,
      period,
      from: timeFromMs,
      to: timeToMs,
      ...(amount ? { amount } : {}),
    },
  );
  const rows = normalizeOhlcvRows(chartData.data ?? []);
  if (amount) {
    return rows.filter((bar) => bar.timestamp <= timeToMs);
  }
  return rows.filter((bar) => bar.timestamp >= timeFromMs && bar.timestamp <= timeToMs);
}

async function fetchOhlcvHistory(
  address: string,
  chainId: string,
  period: string,
  timeFromMs: number,
  timeToMs: number,
  amount?: number,
): Promise<OHLCVData[]> {
  const periodMs = periodToMs(period);
  const maxCandles = period.endsWith('s') ? 100_000 : 1200;
  const chunkSpanMs = periodMs * (maxCandles - 1);
  if (amount || timeToMs - timeFromMs <= chunkSpanMs) {
    return fetchOhlcvHistoryPage(address, chainId, period, timeFromMs, timeToMs, amount);
  }

  const pages: Array<Promise<OHLCVData[]>> = [];
  for (let cursorMs = timeFromMs; cursorMs <= timeToMs; cursorMs += periodMs * maxCandles) {
    const chunkToMs = Math.min(timeToMs, cursorMs + chunkSpanMs);
    pages.push(fetchOhlcvHistoryPage(address, chainId, period, cursorMs, chunkToMs));
  }
  return dedupeOhlcvRows((await Promise.all(pages)).flat());
}

function dedupeOhlcvRows(rows: OHLCVData[]): OHLCVData[] {
  return Array.from(
    rows.reduce((map, bar) => map.set(bar.timestamp, bar), new Map<number, OHLCVData>()).values(),
  ).sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchOHLCVRange(
  tokenAddress: string,
  timeframe: string,
  timeFromMs: number,
  timeToMs: number,
  blockchain?: string,
  amount?: number,
): Promise<OHLCVData[]> {
  if (blockchain && blockchain !== 'solana') throw new Error('Only Solana is supported');
  if (!isSolanaMint(tokenAddress)) throw new Error('Invalid Solana mint');
  const mint = tokenAddress;
  const period = mapTimeframeToPeriod(timeframe);
  try {
    if (timeFromMs >= timeToMs) return [];
    // Token history is scoped to the requested asset. Mobula resolves its largest
    // pool and includes pre-bonding data, while market history can return a pool's
    // quote leg when the requested token is not the pool base asset.
    const rows = await fetchOhlcvHistory(mint, 'solana', period, timeFromMs, timeToMs, amount);
    return stripLeadingOhlcvAnchor(dedupeOhlcvRows(rows), periodToMs(period));
  } catch (err) {
    throw err;
  }
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns?: {
    [key: string]: {
      buys: number;
      sells: number;
    };
  };
  volume?: {
    [key: string]: number;
  };
  priceChange?: {
    [key: string]: number;
  };
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ url: string; label?: string }>;
    socials?: Array<{
      url?: string;
      type?: string;
      platform?: string;
      handle?: string;
    }>;
  };
  boosts?: {
    active?: number;
  };
}

const DEXSCREENER_TTL = 15_000;
/** Token logo URLs are effectively immutable; image consumers ride any recent price fetch. */
export const DEXSCREENER_IMAGE_TTL = 60 * 60 * 1_000; // 1 hour

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);


const isDexScreenerPair = (value: unknown): value is DexScreenerPair => {
  if (!isRecord(value)) return false;
  if (value.chainId !== "solana") return false;
  if (typeof value.dexId !== "string") return false;
  if (typeof value.url !== "string") return false;
  if (typeof value.pairAddress !== "string") return false;
  if (!isRecord(value.baseToken) || typeof value.baseToken.address !== "string") return false;
  if (!isRecord(value.quoteToken) || typeof value.quoteToken.address !== "string") return false;
  if (typeof value.priceUsd !== "string") return false;
  return true;
};

// ---------------------------------------------------------------------------
// DexScreener batch-queue coordinator
//
// Every client-side tokens/v1 lookup funnels through getDexPair/getDexPairs.
// Requests are buffered for a short window, deduped against an in-memory cache,
// chunked into groups of 30 (the DexScreener per-request address limit), and
// each waiting promise is resolved with that token's best-liquidity pair.
// Positive cache entries expire per the caller's maxAgeMs; misses expire after
// a short negative TTL so a transient failure (e.g. 429) self-heals.
// ---------------------------------------------------------------------------

const DEX_BATCH_MAX = 30;
const DEX_COALESCE_WINDOW_MS = 40;
const DEX_NEGATIVE_TTL_MS = 30_000;
const DEX_PAIR_CACHE_MAX_ENTRIES = 500;

type DexCacheEntry = { pair: DexScreenerPair | null; fetchedAt: number };

const dexPairCache = new Map<string, DexCacheEntry>();
const dexPending = new Map<string, Promise<DexScreenerPair | null>>();
const dexResolvers = new Map<string, (pair: DexScreenerPair | null) => void>();
const dexBuffers = new Map<string, Map<string, string>>();
let dexFlushTimer: ReturnType<typeof setTimeout> | null = null;

function dexCacheKey(chainId: string, address: string) {
  return `${chainId}:${address}`;
}

function dexEntryIsFresh(entry: DexCacheEntry, maxAgeMs: number) {
  const age = Date.now() - entry.fetchedAt;
  if (entry.pair === null) return age < DEX_NEGATIVE_TTL_MS;
  return age < maxAgeMs;
}

function scheduleDexFlush() {
  if (dexFlushTimer !== null) return;
  dexFlushTimer = setTimeout(() => {
    dexFlushTimer = null;
    void flushDexBuffers();
  }, DEX_COALESCE_WINDOW_MS);
}

async function flushDexBuffers() {
  const chains = Array.from(dexBuffers.entries());
  dexBuffers.clear();
  await Promise.all(chains.map(([chainId, addresses]) => flushDexChain(chainId, addresses)));
}

async function flushDexChain(chainId: string, addressToKey: Map<string, string>) {
  const entries = Array.from(addressToKey.entries());
  const rawAddresses = entries.map(([address]) => address);
  const chunks: string[][] = [];
  for (let i = 0; i < rawAddresses.length; i += DEX_BATCH_MAX) {
    chunks.push(rawAddresses.slice(i, i + DEX_BATCH_MAX));
  }

  const collected: DexScreenerPair[] = [];
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = `https://api.dexscreener.com/tokens/v1/${chainId}/${chunk.join(",")}?_=${Date.now()}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          console.warn("[dexscreener] batch request failed", res.status);
          return;
        }
        const data: unknown = await res.json();
        const pairs = Array.isArray(data)
          ? data
          : isRecord(data) && Array.isArray(data.pairs)
            ? data.pairs
            : [];
        for (const pair of pairs) {
          if (isDexScreenerPair(pair)) collected.push(pair);
        }
      } catch (err) {
        console.warn("[dexscreener] batch request error", err);
      }
    })
  );

  const best = bestPairsByMint(collected);
  const now = Date.now();
  for (const [rawAddress, cacheKey] of entries) {
    const pair = best[rawAddress] ?? null;
    if (!dexPairCache.has(cacheKey) && dexPairCache.size >= DEX_PAIR_CACHE_MAX_ENTRIES) {
      const oldestKey = dexPairCache.keys().next().value;
      if (oldestKey !== undefined) dexPairCache.delete(oldestKey);
    }
    dexPairCache.set(cacheKey, { pair, fetchedAt: now });
    const resolve = dexResolvers.get(cacheKey);
    dexResolvers.delete(cacheKey);
    dexPending.delete(cacheKey);
    resolve?.(pair);
  }
}

/** Single-token lookup, coalesced into the shared batch queue. */
export function getDexPair(
  address: string,
  chainId = "solana",
  maxAgeMs = DEXSCREENER_TTL,
): Promise<DexScreenerPair | null> {
  const mint = address;
  if (!isSolanaMint(mint) || chainId !== "solana") return Promise.resolve(null);

  const key = dexCacheKey(chainId, mint);
  const cached = dexPairCache.get(key);
  if (cached && dexEntryIsFresh(cached, maxAgeMs)) return Promise.resolve(cached.pair);

  const inflight = dexPending.get(key);
  if (inflight) return inflight;

  const promise = new Promise<DexScreenerPair | null>((resolve) => {
    dexResolvers.set(key, resolve);
  });
  dexPending.set(key, promise);

  let buffer = dexBuffers.get(chainId);
  if (!buffer) {
    buffer = new Map();
    dexBuffers.set(chainId, buffer);
  }
  buffer.set(mint, key);

  scheduleDexFlush();
  return promise;
}

/** Multi-token convenience wrapper; each address still flows through the shared queue. */
export async function getDexPairs(
  chainId: string,
  addresses: string[],
  maxAgeMs = DEXSCREENER_TTL,
): Promise<DexScreenerPair[]> {
  if (chainId !== "solana") throw new Error("Only Solana is supported");
  const unique = Array.from(new Set(addresses.filter(isSolanaMint))).sort();
  if (unique.length === 0) return [];
  const pairs = await Promise.all(unique.map((address) => getDexPair(address, chainId, maxAgeMs)));
  return pairs.filter((pair): pair is DexScreenerPair => pair !== null);
}

export function bestPairsByMint(pairs: DexScreenerPair[]): Record<string, DexScreenerPair> {
  const map: Record<string, DexScreenerPair> = {};
  for (const pair of pairs) {
    const raw = pair.baseToken?.address;
    if (!raw) continue;
    // Solana mint identity is case-sensitive.
    const mint = raw;
    const current = map[mint];
    const currentLiq = current?.liquidity?.usd;
    const nextLiq = pair.liquidity?.usd;
    if (!current) map[mint] = pair;
    else if (typeof nextLiq === "number" && typeof currentLiq === "number" && nextLiq > currentLiq) map[mint] = pair;
    else if (typeof nextLiq === "number" && typeof currentLiq !== "number") map[mint] = pair;
  }
  return map;
}

export async function fetchDexScreenerData(tokenAddress: string, chainId = 'solana', staleTime = DEXSCREENER_TTL): Promise<DexScreenerPair | null> {
  return getDexPair(tokenAddress, chainId, staleTime);
}
