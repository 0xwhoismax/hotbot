/** Portfolios: a few coins held for days or months on a theme a person describes in words. This file is the contract
 *  between the page, Convex and the agents service, and holds every rule that code keeps: the mandate's bounds, the hooks that wake the
 *  agent, the code floor that never waits for a model, and the limits that bound each decision. Until the shadow test passes, a portfolio
 *  trades only on paper ("shadow"): every fill is at the last DexScreener mark, and no SOL moves. */

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
  /** Words and tickers that find candidates on DexScreener (`portfolio.ts` in the agents service). */
  terms: string[];
  age: CoinAge;
  holdDays: number;
  budgetSol: number;
  coins: number;
  perCoinSol: number;
  tradesPerDay: number;
  /** Everything sells and the portfolio stops when its value falls under this. */
  stopAllSol: number;
  /** The review clock: the longest a held coin goes without a look. */
  reviewHours: number;
  autonomy: Autonomy;
};

export const MANDATE = {
  budgetSol: { min: 0.5, max: 100, default: 5 },
  coins: { min: 1, max: 8, default: 4 },
  tradesPerDay: { min: 1, max: 20, default: 4 },
  reviewHours: { min: 6, max: 168, default: 48 },
  holdDays: { min: 3, max: 365, default: 30 },
  terms: 8,
  words: 600,
} as const;

/** The candidate gates for each kind of coin: DexScreener's liquidity and market cap in USD, and the age of the coin's oldest pool in days. */
export const GATES: Record<CoinAge, { liquidityUsd: number; capUsd: number; minDays: number; maxDays?: number }> = {
  established: { liquidityUsd: 100_000, capUsd: 2_000_000, minDays: 30 },
  new: { liquidityUsd: 25_000, capUsd: 150_000, minDays: 1, maxDays: 30 },
  any: { liquidityUsd: 50_000, capUsd: 500_000, minDays: 3 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, step: number) => Math.round(value / step) * step;
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** A SOL amount the person wrote ("10 SOL", "2.5 sol"), so a number they said wins over the model's reading. */
const said = (words: string, pattern: RegExp) => { const match = words.match(pattern); return match ? Number(match[1]) : undefined; };

/** A model's reading of the person's words (any shape), bounded into a mandate. Numbers the person wrote win; anything missing takes its
 *  default; per-coin size, trades and the stop floor follow the budget unless the person or a change set them. */
export function readMandate(raw: unknown, words: string, base?: Mandate): Mandate {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T) => options.includes(value as T) ? value as T : fallback;
  const budgetSol = round(clamp(said(words, /(\d+(?:\.\d+)?)\s*sol\b(?!\s*(?:a|per|each)\b)/i) ?? finite(row.budgetSol) ?? base?.budgetSol ?? MANDATE.budgetSol.default, MANDATE.budgetSol.min, MANDATE.budgetSol.max), 0.01);
  const coins = Math.round(clamp(finite(row.coins) ?? base?.coins ?? MANDATE.coins.default, MANDATE.coins.min, MANDATE.coins.max));
  const evenSol = budgetSol / coins;
  const perCoinSol = round(clamp(said(words, /(\d+(?:\.\d+)?)\s*sol\s*(?:a|per|each)\s*coin/i) ?? finite(row.perCoinSol) ?? (base && base.budgetSol === budgetSol && base.coins === coins ? base.perCoinSol : evenSol * 1.5), evenSol * 0.5, budgetSol), 0.01);
  const terms = [...new Set((Array.isArray(row.terms) ? row.terms : base?.terms ?? []).map(term => text(term, 24).toLowerCase()).filter(term => term.length >= 2))].slice(0, MANDATE.terms);
  return {
    words: text(words, MANDATE.words) || base?.words || '',
    summary: text(row.summary, 140) || base?.summary || text(words, 140),
    terms,
    age: pick(row.age, COIN_AGES, base?.age ?? 'established'),
    holdDays: Math.round(clamp(finite(row.holdDays) ?? base?.holdDays ?? MANDATE.holdDays.default, MANDATE.holdDays.min, MANDATE.holdDays.max)),
    budgetSol, coins, perCoinSol,
    tradesPerDay: Math.round(clamp(finite(row.tradesPerDay) ?? base?.tradesPerDay ?? MANDATE.tradesPerDay.default, MANDATE.tradesPerDay.min, MANDATE.tradesPerDay.max)),
    stopAllSol: round(clamp(finite(row.stopAllSol) ?? (base && base.budgetSol === budgetSol ? base.stopAllSol : budgetSol * 0.75), 0, budgetSol * 0.95), 0.01),
    reviewHours: Math.round(clamp(finite(row.reviewHours) ?? base?.reviewHours ?? MANDATE.reviewHours.default, MANDATE.reviewHours.min, MANDATE.reviewHours.max)),
    autonomy: pick(row.autonomy, AUTONOMY, base?.autonomy ?? 'limits'),
  };
}

/** What wakes the agent for one held coin. Percentages are positive numbers: `drop` 25 fires at 25% under the entry price. */
export type Hook =
  | { kind: 'drop'; pct: number }
  | { kind: 'fall'; pct: number }
  | { kind: 'rise'; pct: number }
  | { kind: 'below'; priceUsd: number }
  | { kind: 'above'; priceUsd: number }
  | { kind: 'liquidity'; pct: number }
  | { kind: 'review'; at: number };

/** The code floor: a coin sells without a model once its price is this far under the entry, or its pool has lost this share of its
 *  liquidity since the pick. */
export const FLOOR = { dropPct: 35, drainPct: 80 } as const;
/** Bounds on the hooks a model sets. `drop` stays above the code floor, which acts on its own. */
export const HOOK_BOUNDS = { drop: [8, FLOOR.dropPct - 1], fall: [10, 60], rise: [15, 1000], liquidity: [20, 75] } as const;

/** DexScreener's view of a coin at one moment, from its most liquid Solana pool. */
export type Mark = { priceUsd: number; liquidityUsd: number; capUsd: number; volume24hUsd: number; change24hPct: number; at: number };

/** One coin's shadow position. `qty` is what is held now; `holdQty` is what the pick bought, kept for the buy-and-hold baseline.
 *  `costSol` is the cost of what is held now (a sale takes its share off), `paidSol` all the SOL put in, `realizedSol` all the SOL taken
 *  out. Entry and peak are USD prices. */
export type Position = { qty: number; holdQty: number; costSol: number; paidSol: number; realizedSol: number; entryPriceUsd: number; entryLiquidityUsd: number; peakPriceUsd: number; boughtAt: number };
/** A coin's profit in SOL at a price: what it is worth plus what it sold for, less all it cost. */
export const profit = (position: Position, priceUsd: number, solUsd: number) => position.qty * priceUsd / solUsd + position.realizedSol - position.paidSol;

export const pctFrom = (from: number, to: number) => from > 0 ? (to / from - 1) * 100 : 0;

/** The hooks a mark fires. A review hook fires at its time; price hooks compare against the entry, the peak since the entry, or a level. */
export function firedHooks(hooks: readonly Hook[], position: Position, mark: Mark, now: number): Hook[] {
  return hooks.filter(hook => {
    switch (hook.kind) {
      case 'drop': return pctFrom(position.entryPriceUsd, mark.priceUsd) <= -hook.pct;
      case 'fall': return pctFrom(Math.max(position.peakPriceUsd, mark.priceUsd), mark.priceUsd) <= -hook.pct;
      case 'rise': return pctFrom(position.entryPriceUsd, mark.priceUsd) >= hook.pct;
      case 'below': return mark.priceUsd <= hook.priceUsd;
      case 'above': return mark.priceUsd >= hook.priceUsd;
      case 'liquidity': return pctFrom(position.entryLiquidityUsd, mark.liquidityUsd) <= -hook.pct;
      case 'review': return now >= hook.at;
    }
  });
}

/** The code floor's verdict on a mark: sell everything, or null. */
export function floorHit(position: Position, mark: Mark): 'stop' | 'drain' | null {
  if (position.qty <= 0) return null;
  if (pctFrom(position.entryPriceUsd, mark.priceUsd) <= -FLOOR.dropPct) return 'stop';
  if (position.entryLiquidityUsd > 0 && pctFrom(position.entryLiquidityUsd, mark.liquidityUsd) <= -FLOOR.drainPct) return 'drain';
  return null;
}

const priceText = (value: number) => '$' + (value >= 1 ? value.toFixed(2) : value.toPrecision(2));
/** A hook in words, as the page and the briefing show it. */
export function hookText(hook: Hook, now?: number): string {
  switch (hook.kind) {
    case 'drop': return `price ${hook.pct}% under entry`;
    case 'fall': return `price ${hook.pct}% off its high`;
    case 'rise': return `price ${hook.pct}% over entry`;
    case 'below': return `price under ${priceText(hook.priceUsd)}`;
    case 'above': return `price over ${priceText(hook.priceUsd)}`;
    case 'liquidity': return `liquidity down ${hook.pct}%`;
    case 'review': { if (now === undefined) return 'review'; const hours = Math.max(0, (hook.at - now) / 3_600_000); return hours < 1 ? 'review within the hour' : `review in ${hours < 48 ? Math.round(hours) + ' h' : Math.round(hours / 24) + ' days'}`; }
  }
}

/** A model's hooks (any shape), bounded. A hook never fires the moment it is set: a percentage hook sits at least 3 points past where the
 *  coin is now (else it is moved there, or dropped when that passes its bound), and a price level must sit on the far side of the mark.
 *  The review clock stays inside the mandate's. Returns at most one hook of each kind, always with a review. */
export function readHooks(raw: unknown, position: Position, mark: Mark, now: number, reviewHours: number, maxReviewHours: number): Hook[] {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hooks: Hook[] = [];
  // How far each percentage hook's measure has already moved: down from entry, down from the peak, up from entry, liquidity down.
  const moved = { drop: -pctFrom(position.entryPriceUsd, mark.priceUsd), fall: -pctFrom(Math.max(position.peakPriceUsd, mark.priceUsd), mark.priceUsd), rise: pctFrom(position.entryPriceUsd, mark.priceUsd), liquidity: -pctFrom(position.entryLiquidityUsd, mark.liquidityUsd) };
  for (const kind of ['drop', 'fall', 'rise', 'liquidity'] as const) {
    const pct = finite(row[kind]);
    if (pct === undefined || pct <= 0) continue;
    const [min, max] = HOOK_BOUNDS[kind], at = Math.round(Math.max(clamp(pct, min, max), moved[kind] + 3));
    if (at <= max) hooks.push({ kind, pct: at } as Hook);
  }
  const below = finite(row.below), above = finite(row.above);
  if (below !== undefined && below > 0 && below < mark.priceUsd * 0.98) hooks.push({ kind: 'below', priceUsd: below });
  if (above !== undefined && above > mark.priceUsd * 1.02) hooks.push({ kind: 'above', priceUsd: above });
  const hours = clamp(finite(row.reviewHours) ?? reviewHours, MANDATE.reviewHours.min, Math.max(MANDATE.reviewHours.min, Math.min(maxReviewHours, MANDATE.reviewHours.max)));
  hooks.push({ kind: 'review', at: now + Math.round(hours) * 3_600_000 });
  return hooks;
}

export const ACTIONS = ['hold', 'trim', 'add', 'exit'] as const;
export type Action = typeof ACTIONS[number];
/** A model's decision on one coin: what to do, why, the journal line the person reads, and the hooks to watch next. `part` is the share a
 *  trim sells (0.1 to 0.9); `sol` is what an add puts in. */
export type Decision = { action: Action; part?: number; sol?: number; why: string; line: string; hooks: unknown };

/** A model's decision (any shape), or null when it is unusable. */
export function readDecision(raw: unknown): Decision | null {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!ACTIONS.includes(row.action as Action)) return null;
  const line = text(row.line, 160), why = text(row.why, 400);
  if (!line) return null;
  return { action: row.action as Action, part: finite(row.part), sol: finite(row.sol), why, line, hooks: row.hooks };
}

/** What a decision may do once code has bounded it. `qty` is tokens sold (trim, exit); `sol` is SOL put in (add). `asks` marks a trade the
 *  person must approve; `note` says what the limits changed. */
export type Bounded = { action: Action; qty: number; sol: number; asks: boolean; note?: string };

/** Bounds a decision by the mandate: an add stays under the per-coin size and the free SOL, a trim sells 10% to 90%, and trades stop at
 *  the day's count. Autonomy decides what asks the person: everything (`ask`), only what the limits cut (`limits`), or nothing (`full`). */
export function bound(decision: Decision, context: { mandate: Pick<Mandate, 'perCoinSol' | 'tradesPerDay' | 'autonomy'>; position: Position; cashSol: number; tradesToday: number }): Bounded {
  const { mandate, position, cashSol, tradesToday } = context;
  if (decision.action === 'hold') return { action: 'hold', qty: 0, sol: 0, asks: false };
  if (tradesToday >= mandate.tradesPerDay) return { action: 'hold', qty: 0, sol: 0, asks: false, note: `already ${tradesToday} trades today` };
  if (decision.action === 'exit') return { action: 'exit', qty: position.qty, sol: 0, asks: mandate.autonomy === 'ask' };
  if (decision.action === 'trim') {
    const part = clamp(decision.part ?? 0.33, 0.1, 0.9);
    return { action: 'trim', qty: position.qty * part, sol: 0, asks: mandate.autonomy === 'ask' };
  }
  const want = Math.max(0, decision.sol ?? 0), room = Math.max(0, Math.min(mandate.perCoinSol - position.costSol, cashSol));
  if (want <= 0 || cashSol <= 0.01) return { action: 'hold', qty: 0, sol: 0, asks: false, note: 'no free SOL to add' };
  if (want <= room) return { action: 'add', qty: 0, sol: want, asks: mandate.autonomy === 'ask' };
  // Over the per-coin size: `limits` asks for the whole amount (up to the free SOL); `full` adds only what fits.
  if (mandate.autonomy === 'full') return room > 0.01 ? { action: 'add', qty: 0, sol: room, asks: false, note: `cut to ${room.toFixed(2)} SOL by the per-coin size` } : { action: 'hold', qty: 0, sol: 0, asks: false, note: 'at the per-coin size' };
  return { action: 'add', qty: 0, sol: Math.min(want, cashSol), asks: true, note: `over the ${mandate.perCoinSol} SOL per-coin size` };
}

/** A bounded trade filled on paper at the mark. Returns the new position, the SOL that comes back (a sale) or goes in (an add, negative),
 *  and a sale's profit against the cost of the share it sold. */
export function fill(position: Position, bounded: Bounded, mark: Mark, solUsd: number): { position: Position; cashSol: number; pnlSol?: number } {
  if (bounded.action === 'add' && bounded.sol > 0) {
    const qty = bounded.sol * solUsd / mark.priceUsd;
    return { position: { ...position, qty: position.qty + qty, costSol: position.costSol + bounded.sol, paidSol: position.paidSol + bounded.sol }, cashSol: -bounded.sol };
  }
  if ((bounded.action === 'exit' || (bounded.action === 'trim' && bounded.qty > 0)) && position.qty > 0) {
    const qty = bounded.action === 'exit' ? position.qty : Math.min(position.qty, bounded.qty), share = qty / position.qty;
    const back = qty * mark.priceUsd / solUsd, cost = position.costSol * share;
    return { position: { ...position, qty: position.qty - qty, costSol: position.costSol - cost, realizedSol: position.realizedSol + back }, cashSol: back, pnlSol: back - cost };
  }
  return { position, cashSol: 0 };
}

/** A new shadow position: `sol` bought at the mark. */
export function open(sol: number, mark: Mark, solUsd: number, now: number): Position {
  const qty = sol * solUsd / mark.priceUsd;
  return { qty, holdQty: qty, costSol: sol, paidSol: sol, realizedSol: 0, entryPriceUsd: mark.priceUsd, entryLiquidityUsd: mark.liquidityUsd, peakPriceUsd: mark.priceUsd, boughtAt: now };
}

/** A position's worth in SOL at a mark, and what it would be worth had the pick been held untouched. */
export const worth = (position: Position, priceUsd: number, solUsd: number) => position.qty * priceUsd / solUsd;
export const heldWorth = (position: Position, priceUsd: number, solUsd: number) => position.holdQty * priceUsd / solUsd;

/** A portfolio's shadow value: free SOL plus what each coin is worth now. `hold` is the same picks bought once and never touched, with
 *  the rest of the budget left as SOL: the baseline the shadow test must beat. */
export function bookValue(startSol: number, cashSol: number, coins: readonly { position: Position; priceUsd?: number }[], solUsd: number) {
  let value = cashSol, hold = startSol;
  for (const coin of coins) {
    const priceUsd = coin.priceUsd ?? coin.position.entryPriceUsd, firstSol = coin.position.holdQty * coin.position.entryPriceUsd / solUsd;
    value += worth(coin.position, priceUsd, solUsd);
    hold += heldWorth(coin.position, priceUsd, solUsd) - firstSol;
  }
  return { value, hold };
}

/** How many points a portfolio's value line keeps, and the least time between two. */
export const POINTS = { max: 240, everyMs: 15 * 60_000 } as const;
/** Adds a point to a value line, then thins the older half to every other point once the line is full. */
export function addPoint<T extends { at: number }>(points: readonly T[], point: T): T[] {
  const last = points[points.length - 1];
  if (last && point.at - last.at < POINTS.everyMs) return [...points.slice(0, -1), point];
  const next = [...points, point];
  if (next.length <= POINTS.max) return next;
  const half = Math.floor(next.length / 2);
  return [...next.slice(0, half).filter((_, index) => index % 2 === 0), ...next.slice(half)];
}

/** How long a trade that asks the person waits before it is skipped. */
export const ASK_MS = 2 * 60 * 60_000;
/** The least time between two model wakes of one coin, and the most wakes a portfolio gets in a day: a cost cap. */
export const WAKE = { coolMs: 30 * 60_000, perDay: 24 } as const;

export type DexPair = {
  chainId?: string; pairAddress?: string; baseToken?: { address?: string; symbol?: string; name?: string }; quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string; liquidity?: { usd?: number }; marketCap?: number; fdv?: number; pairCreatedAt?: number;
  volume?: { h24?: number }; priceChange?: { h24?: number }; info?: { imageUrl?: string };
};
/** A coin that passed the gates, with its mark from its most liquid pool. */
export type Candidate = { address: string; symbol: string; name: string; logo?: string; ageDays: number; mark: Mark };

/** SOL, USDC and USDT: the quotes a candidate's pool may use, and never candidates themselves. */
export const QUOTES = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);

/** DexScreener pairs to candidates: Solana pools quoted in SOL, USDC or USDT, one per coin (its most liquid), that pass the gates for the
 *  mandate's kind of coin. A coin's age is its oldest pool's. Most liquid first. */
export function candidates(pairs: readonly DexPair[], age: CoinAge, now: number): Candidate[] {
  const gate = GATES[age], best = new Map<string, { pair: DexPair; liquidity: number; createdAt: number }>();
  for (const pair of pairs) {
    const address = pair.baseToken?.address, liquidity = pair.liquidity?.usd ?? 0;
    if (pair.chainId !== 'solana' || !address || QUOTES.has(address) || !QUOTES.has(pair.quoteToken?.address ?? '')) continue;
    const seen = best.get(address), createdAt = Math.min(seen?.createdAt ?? Infinity, pair.pairCreatedAt ?? Infinity);
    best.set(address, !seen || liquidity > seen.liquidity ? { pair, liquidity, createdAt } : { ...seen, createdAt });
  }
  const rows: Candidate[] = [];
  for (const [address, { pair, liquidity, createdAt }] of best) {
    const priceUsd = Number(pair.priceUsd), capUsd = pair.marketCap ?? pair.fdv ?? 0, ageDays = Number.isFinite(createdAt) ? (now - createdAt) / 86_400_000 : 0;
    if (!(priceUsd > 0) || liquidity < gate.liquidityUsd || capUsd < gate.capUsd || ageDays < gate.minDays || (gate.maxDays !== undefined && ageDays > gate.maxDays)) continue;
    rows.push({ address, symbol: text(pair.baseToken?.symbol, 16) || '?', name: text(pair.baseToken?.name, 40), ...(pair.info?.imageUrl ? { logo: pair.info.imageUrl } : {}), ageDays,
      mark: { priceUsd, liquidityUsd: liquidity, capUsd, volume24hUsd: pair.volume?.h24 ?? 0, change24hPct: pair.priceChange?.h24 ?? 0, at: now } });
  }
  return rows.sort((a, b) => b.mark.liquidityUsd - a.mark.liquidityUsd);
}
