import { nextLook } from './team';

/** A coin as `team.board` and `team.item` list it, before live prices: `entry` is the part still held (the whole buy once closed). */
type Row = {
  token: { address: string }; strategyId: string; stage: string; mode: string; at: number; supply: number | null; peakPriceUsd: number | null; boughtAt: number | null;
  entry: { priceUsd: number; qty: number; sol: number } | null; sold: { rungs: number } | null; lastReview: { at: number; priceUsd: number | null; rungs: number } | null;
};
/** What `team.prices` returns: each mint's latest price (and the supply its market cap implies), the SOL price and the worker's status. */
export type Live = { solUsd: number; worker: { online: boolean; jev: boolean; claw: boolean }; prices: Record<string, { priceUsd: number; supply: number | null }> };
type Board = { workspace: { mode: string }; cash: number; strategies: { id: string; mode: string }[]; bags: Row[]; needs: Row[]; watching: Row[]; researching: Row[] };

/** A coin at its mint's latest price: the mark, the supply it implies and where TraderBot looks next. No price yet leaves the mark empty. */
export function priced<R extends Row>(row: R, live: Live | null) {
  const price = live?.prices[row.token.address], markPriceUsd = price?.priceUsd ?? null, entry = row.entry;
  const look = row.stage === 'held' && entry ? nextLook({ entryPriceUsd: entry.priceUsd, markPriceUsd: markPriceUsd ?? entry.priceUsd, peakPriceUsd: row.peakPriceUsd ?? markPriceUsd ?? entry.priceUsd,
    since: row.boughtAt ?? row.at, rungs: row.sold?.rungs ?? 0, lastReview: row.lastReview }) : null;
  return { ...row, markPriceUsd, supply: price?.supply ?? row.supply, look };
}

/** What is still held of a coin, in SOL at its mark (at the entry price before the first one). */
export function heldValue(row: { entry: { priceUsd: number; qty: number; sol: number } | null; markPriceUsd: number | null }, solUsd: number) {
  if (!row.entry) return 0;
  return solUsd > 0 ? row.entry.qty * (row.markPriceUsd ?? row.entry.priceUsd) / solUsd : row.entry.sol;
}

/** A coin's record at its mint's latest price, as its page shows it: the mark, what is held of it in SOL and where TraderBot looks next. */
export function pricedCoin<R extends Row>(row: R, live: Live | null) {
  const coin = priced(row, live);
  return { ...coin, valueSol: heldValue(coin, live?.solUsd ?? 0) };
}

/** The mints whose live prices home shows: bags, asks and entries being watched. */
export function homeAddresses(board: Pick<Board, 'bags' | 'needs' | 'watching'>) {
  return [...new Set([...board.bags, ...board.needs, ...board.watching].map(row => row.token.address))].sort();
}

/** `team.board` at the latest prices, exactly as home shows it: the shown portfolio's money, each strategy's open profit in the portfolio it
 *  trades in, and every coin's mark and value. */
export function composeHome<B extends Board>(board: B, live: Live) {
  const { cash, strategies, bags: held, needs, watching, researching, ...rest } = board;
  const bags = (held as B['bags']).map(row => { const coin = priced(row as B['bags'][number], live); return { ...coin, valueSol: heldValue(coin, live.solUsd) }; });
  const open = (rows: typeof bags) => rows.reduce((sum, row) => sum + (row.entry ? row.valueSol - row.entry.sol : 0), 0);
  const shown = bags.filter(row => row.mode === board.workspace.mode), invested = shown.reduce((sum, row) => sum + row.valueSol, 0);
  return { ...rest, money: { cash, equity: cash + invested, invested, openPnl: open(shown), solUsd: live.solUsd }, worker: live.worker,
    strategies: (strategies as B['strategies']).map(strategy => ({ ...strategy as B['strategies'][number], openPnlSol: open(bags.filter(row => row.strategyId === strategy.id && row.mode === strategy.mode)) })),
    bags, needs: (needs as B['needs']).map(row => priced(row as B['needs'][number], live)), watching: (watching as B['watching']).map(row => priced(row as B['watching'][number], live)),
    researching: (researching as B['researching']).map(row => priced(row as B['researching'][number], live)) };
}

const MINUTE_MS = 60_000, HOUR_MS = 60 * MINUTE_MS, DAY_MS = 24 * HOUR_MS, WEEK_MS = 7 * DAY_MS;
const CURVE_WINDOWS = [15 * MINUTE_MS, HOUR_MS, 3 * HOUR_MS, DAY_MS, WEEK_MS, 30 * DAY_MS, 365 * DAY_MS];
export type CurveResolution = 'minute' | 'hour' | 'day' | 'week';
/** The profit chart's window and candle size for a history `ageMs` long, capped by `range` (ms): short histories get minutes, long ones hours, days
 *  or weeks. `team.curve` reads candles at this resolution; ProfitChart picks the bucket it asks with by the same rule. */
export function curveScale(ageMs: number, range = Infinity): { span: number; resolution: CurveResolution } {
  const span = Math.min(range, CURVE_WINDOWS.find(size => size >= ageMs) ?? Math.ceil(ageMs / (365 * DAY_MS)) * 365 * DAY_MS);
  return { span, resolution: span <= 3 * HOUR_MS ? 'minute' : span <= WEEK_MS ? 'hour' : span <= 180 * DAY_MS ? 'day' : 'week' };
}
