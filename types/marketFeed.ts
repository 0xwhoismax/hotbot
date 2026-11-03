
/** The candle sizes the gateway answers, as their length in ms. */
export const MARKET_PERIODS = {
  '1s': 1_000, '5s': 5_000, '15s': 15_000, '30s': 30_000, '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
} as const;
export type MarketPeriod = keyof typeof MARKET_PERIODS;

/** One candle. `t` is the bucket's start. A bucket without a priced trade has no candle. Buckets fold their seconds as first open, highest
 *  high, lowest low, last close and summed volume (`foldBar`). The gateway then opens each candle at the close of the candle before it and
 *  widens its high and low to that open (`chainBars`), so the candles join; only a coin's first candle keeps its own open. */
export type MarketBar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type MarketCoin = Record<string, unknown> & {
  address: string; name?: string; symbol?: string; decimals?: number; createdAt?: string;
  priceUSD?: number; marketCapUSD?: number; athUSD?: number; volume24hUSD?: number;
  /** Liquidity as people read it: both sides of the main pool (types/market.ts BOTH_SIDES), real and virtual quote. */
  liquidityUSD?: number;
  priceChange1hPercentage?: number; priceChange24hPercentage?: number; buys24h?: number; sells24h?: number;
  holdersCount?: number; holdersAtLeast?: number; top10HoldingsPercentage?: number; devHoldingsPercentage?: number; bundlersHoldingsPercentage?: number; snipersHoldingsPercentage?: number;
  bonded?: boolean; bondingPercentage?: number; source?: string; poolAddress?: string; exchange?: { name: string };
  security?: { noMintAuthority?: boolean; isFreezable?: boolean };
  /** Both sides of the main pool as the indexer values them, its coin side at the pool's price (a concentrated pool's sides differ). */
  liquidityBothUSD?: number;
  logo?: string; twitter?: string; telegram?: string; website?: string;
};

/** The REST answers. `observedAt`: when the gateway last read the indexer, so the price is current as of then.
 *  - GET /coin?mint=<mint>[&holders=1]                      → CoinAnswer (404 for a coin the indexer never stored)
 *  - GET /coins?mints=<mint>,<mint>…  (MARKET_BATCH at most) → CoinsAnswer, the coins it knows
 *  - GET /search?q=<text>                                    → CoinsAnswer, MARKET_SEARCH at most, best first
 *  - GET /sol                                                → SolAnswer
 *  - GET /candles?mint=<mint>&period=<MarketPeriod>&from=<ms>&to=<ms>[&limit=<n>] → CandlesAnswer: the candles with from ≤ t < to, oldest
 *    first; with `limit`, the latest `limit` candles with t < to, and `from` only bounds the search. `limit` is MARKET_CANDLES at most.
 *    The gateway moves `from` and `to` out to whole periods, so a browser that asks with `to` at the end of the current period shares
 *    its answer with every other browser on that coin and period. */
export type CoinAnswer = { data: MarketCoin; observedAt: number };
export type CoinsAnswer = { data: MarketCoin[]; observedAt: number };
export type SolAnswer = { usd: number; observedAt: number };
/** `from`: where the answer's history starts in full, the asked `from` unless the read stopped at its cap first. `through`: the newest
 *  1-second bar the read held, absent when it held none; the socket's bars after it are new to this answer. */
/*  `first`: the start of the coin's earliest candle of this period that the gateway holds; a browser asks for nothing older. Second periods
 *  read the hot store only (the last INDEXER_RETAIN_DAYS); minute and longer periods also read the history store, so they reach back to the
 *  archive's first day. */
export type CandlesAnswer = { rows: MarketBar[]; from: number; through?: number; first?: number };
export const MARKET_BATCH = 50, MARKET_SEARCH = 20, MARKET_CANDLES = 2_000;

/** What the browser sends on `/ws`. `prices`: the coins whose ticks it wants. `bars`: the coins whose closed 1-second bars it wants.
 *  A socket holds MARKET_WS_SUBS subscriptions at most, prices and bars together; the gateway drops the ones past it. `team`: the team topic
 *  of the team a token names (types/teamFeed.ts), sent again with a new token before the old one ends; `unteam` leaves it. `coin`: a coin
 *  page of that team from its worker (`ref`, types/coinKey.ts), answered by `id`. */
export type MarketClientMessage = { op: 'sub' | 'unsub'; prices?: string[]; bars?: string[] } | { op: 'team'; token: string } | { op: 'unteam' } | { op: 'coin'; id: number; ref: string };
export const MARKET_WS_SUBS = 200;

/** What the gateway sends on `/ws`:
 *  - `hello`: on connect, with SOL's price (null until the gateway has one).
 *  - `p`: a coin's price tick as its row changes, the latest of the gateway's turn: price `p`, market cap `c`, liquidity `l` (as `liquidityUSD`), and
 *    `t`, the coin's latest trade.
 *  - `b`: a coin's 1-second bars as the indexer writes them, oldest first. A new watch starts some seconds back, so a browser keeps only
 *    the bars after its read's `through`.
 *  - `sol`: SOL's price, every MARKET_SOL_MS.
 *  - `t`: the team topic's view, as its worker pushed it at `at`, or `stale` with the reason none can come now.
 *  - `c`: the answer to a `coin` ask: the page (null when the worker's practice desk does not hold the coin), or `stale` with the reason.
 *  `at` in `hello` and `sol`: when the gateway last read the indexer. A price is current as of then, so a browser marks it stale when `at`
 *  is older than MARKET_MAX_AGE_MS (types/market.ts). */
export type MarketServerMessage =
  | { k: 'hello'; sol: number | null; at: number }
  | { k: 'p'; a: string; p: number; c: number | null; l: number | null; t: number }
  | { k: 'b'; a: string; bars: MarketBar[] }
  | { k: 'sol'; usd: number; at: number }
  | { k: 't'; ws: string; at: number; view: unknown } | { k: 't'; ws: string; stale: string }
  | { k: 'c'; id: number; coin: unknown } | { k: 'c'; id: number; stale: string };

/** Opens each bar at the close before it (`prev`, then each bar's own close) and widens its high and low to that open. */
export function chainBars(bars: MarketBar[], prev?: number): MarketBar[] {
  return bars.map(bar => {
    const open = prev ?? bar.o;
    prev = bar.c;
    return open === bar.o ? bar : { ...bar, o: open, h: Math.max(bar.h, open), l: Math.min(bar.l, open) };
  });
}
/** Folds a later bar into the bucket's bar it belongs to. */
export function foldBar(bar: MarketBar, next: MarketBar): MarketBar {
  return { t: bar.t, o: bar.o, h: Math.max(bar.h, next.h), l: Math.min(bar.l, next.l), c: next.c, v: bar.v + next.v };
}
