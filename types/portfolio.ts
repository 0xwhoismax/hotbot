

export const AUTONOMY = ['ask', 'limits', 'full'] as const;
/** `ask`: every trade waits for the person. `limits`: trades inside the limits go ahead, bigger ones ask. `full`: every trade goes ahead. */
export type Autonomy = typeof AUTONOMY[number];
export const COIN_AGES = ['established', 'new', 'any'] as const;
export type CoinAge = typeof COIN_AGES[number];

/** What a portfolio holds and how, read from the person's words and then bounded by code. Money is SOL. */
export type Mandate = {
  /** The person's words, as they said them. */
  words: string;
  /** One line HOTBOT wrote: what it holds and for how long. */
  summary: string;
  /** Words and tickers that find candidates (`discovery.ts` in the agents service). */
  terms: string[];
  age: CoinAge;
  budgetSol: number;
  coins: number;
  perCoinSol: number;
  tradesPerDay: number;
  /** Everything sells and the portfolio stops when its value falls under this. */
  stopAllSol: number;
  autonomy: Autonomy;
};

export const MANDATE = {
  budgetSol: { min: 0.5, max: 100, default: 5 },
  coins: { min: 1, max: 8, default: 4 },
  tradesPerDay: { min: 1, max: 20, default: 4 },
  terms: 8,
  words: 600,
} as const;

/** The code floor: a coin sells without a model once its price is this far under the entry, or its pool has lost this share of its
 *  liquidity since the pick. */
export const FLOOR = { dropPct: 35, drainPct: 80 } as const;
/** What a market signal needs before it counts (an event, a risk exit, an evidence spike), so a quiet coin does not wake the agent on
 *  noise: the last hour's volume in USD, its trade count, X posts in the last hour, and the pump.fun holders a holders measure starts
 *  from. Coin intel older than `staleMs` is left out. The intel service rewrites an unchanged read only once an hour, so a current read
 *  can carry an older time. */
export const SIGNAL = { volumeUsd: 5_000, trades: 30, posts: 10, holders: 50, staleMs: 3 * 3_600_000 } as const;

/** A coin's market at one moment, from the launchpad indexer's row of the coin. Liquidity counts both sides of its main pool. The last hour's volume and trade counts are optional: a source or an older stored mark can lack them, and a measure
 *  that needs them does not count without them. */
export type Mark = { priceUsd: number; liquidityUsd: number; capUsd: number; volume24hUsd: number; change24hPct: number; at: number; volume1hUsd?: number; buys1h?: number; sells1h?: number };

/** What signals read beside the mark, from coin intel (`types/coinIntel.ts`): pump.fun's holder count, and X's posts in the last hour
 *  with their hourly average. A missing value never counts. */
export type Signals = { pumpUsers?: number; xPerHour?: number; xBaseline?: number };
/** A coin's intel to signals, leaving out a read older than `SIGNAL.staleMs` and a pump.fun count of 0 (a coin pump.fun does not know). */
export function signalsOf(intel: { pump?: { users: number; readAt: number }; x?: { perHour: number; baseline: number; readAt: number } } | null | undefined, now: number): Signals {
  const fresh = (readAt: number) => now - readAt <= SIGNAL.staleMs;
  return {
    ...(intel?.pump && intel.pump.users > 0 && fresh(intel.pump.readAt) ? { pumpUsers: intel.pump.users } : {}),
    ...(intel?.x && fresh(intel.x.readAt) ? { xPerHour: intel.x.perHour, xBaseline: intel.x.baseline } : {}),
  };
}

/** Each rate a signal compares, and whether it has passed its `SIGNAL` minimum (`ready`): the last hour's volume over the 24-hour
 *  hourly average, the share of the last hour's trades that sold (percent), and X's posts in the last hour over their hourly average.
 *  Undefined without its source. */
export function signalRates(mark: Mark, signals?: Signals) {
  const trades = (mark.buys1h ?? 0) + (mark.sells1h ?? 0);
  return {
    volume: mark.volume1hUsd !== undefined && mark.volume24hUsd > 0 ? { value: mark.volume1hUsd / (mark.volume24hUsd / 24), ready: mark.volume1hUsd >= SIGNAL.volumeUsd } : undefined,
    sellers: mark.buys1h !== undefined && mark.sells1h !== undefined && trades > 0 ? { value: mark.sells1h / trades * 100, ready: trades >= SIGNAL.trades } : undefined,
    buzz: signals?.xPerHour !== undefined && signals.xBaseline !== undefined && signals.xBaseline > 0 ? { value: signals.xPerHour / signals.xBaseline, ready: signals.xPerHour >= SIGNAL.posts } : undefined,
  };
}

/** One coin's shadow position. `qty` is what is held now; `holdQty` is what the pick bought and `holdSol` the SOL it paid, kept for the
 *  buy-and-hold baseline. `costSol` is the cost of what is held now (a sale takes its share off), `paidSol` all the SOL put in,
 *  `realizedSol` all the SOL taken out. Entry and peak are USD prices. */
export type Position = { qty: number; holdQty: number; holdSol: number; costSol: number; paidSol: number; realizedSol: number; entryPriceUsd: number; entryLiquidityUsd: number; peakPriceUsd: number; boughtAt: number };
/** A coin's profit in SOL at a price: what it is worth plus what it sold for, less all it cost. */
export const profit = (position: Position, priceUsd: number, solUsd: number) => position.qty * priceUsd / solUsd + position.realizedSol - position.paidSol;

export const pctFrom = (from: number, to: number) => from > 0 ? (to / from - 1) * 100 : 0;

/** How long a trade that asks the person waits before it is skipped. */
export const ASK_MS = 2 * 60 * 60_000;
/** The journal lines a portfolio page reads, newest first. */
export const JOURNAL_PAGE = 60;
/** The most portfolios a person keeps at once, archived ones not counted; an admin has no limit. */
export const PORTFOLIO_LIMIT = 3;
/** The most coins a portfolio's card and banner show: the coins it holds, else the newest it sold. */
export const COVER_COINS = 4;
