import { nextLook } from './team';
import { LINK_QUIET_MS } from './teamFeed';

/** A coin as `team.board` and `team.item` list it, before live prices: `entry` is the part still held (the whole buy once closed). */
type Row = {
  token: { address: string }; strategyId: string; stage: string; mode: string; at: number; supply: number | null; peakPriceUsd: number | null; boughtAt: number | null;
  entry: { priceUsd: number; qty: number; sol: number; solPriceUsd: number } | null; sold: { rungs: number } | null; lastReview: { at: number; priceUsd: number | null; rungs: number } | null;
};
export type Live = { solUsd: number; worker: { beatAt: number; jev: boolean; gwOkAt: number }; prices: Record<string, { priceUsd: number; supply: number | null; at: number }> };
/** The worker shows online while the team's shard was guarded within this time. It spans several heartbeats, so one late beat does not flip it. */
export const WORKER_ONLINE_MS = 90_000;
export const workerOnline = (beatAt: number, now: number) => beatAt > now - WORKER_ONLINE_MS;
type Portfolio = { cash: number; realizedPnlSol: number; deposits: number | null };
type Board = { workspace: { mode: 'paper' | 'live' }; portfolios: Record<'paper' | 'live', Portfolio>; strategies: { id: string; mode: string }[]; bags: Row[]; needs: Row[]; watching: Row[]; researching: Row[] };

/** A held coin whose price is older than this shows the price's age: its value is the last trade's price, which may no longer sell. */
export const STALE_PRICE_MS = 5 * 60_000;

/** A coin at its mint's latest price: the mark, when it was set (`markAt`), the supply it implies and where TraderBot looks next. No price yet
 *  leaves the mark empty. */
export function priced<R extends Row>(row: R, live: Live | null) {
  const price = live?.prices[row.token.address], markPriceUsd = price?.priceUsd ?? null, entry = row.entry;
  const look = row.stage === 'held' && entry ? nextLook({ entryPriceUsd: entry.priceUsd, markPriceUsd: markPriceUsd ?? entry.priceUsd, peakPriceUsd: row.peakPriceUsd ?? markPriceUsd ?? entry.priceUsd,
    since: row.boughtAt ?? row.at, rungs: row.sold?.rungs ?? 0, lastReview: row.lastReview }) : null;
  return { ...row, markPriceUsd, markAt: price?.at ?? null, supply: price?.supply ?? row.supply, look };
}

/** What is still held of a coin, in SOL at its mark (at the entry price before the first one). */
export function heldValue(row: { entry: { priceUsd: number; qty: number; sol: number } | null; markPriceUsd: number | null }, solUsd: number) {
  if (!row.entry) return 0;
  return solUsd > 0 ? row.entry.qty * (row.markPriceUsd ?? row.entry.priceUsd) / solUsd : row.entry.sol;
}

/** What a held coin's buy paid for the coin, in SOL, fees counted. `entry.sol` is what the vault paid: on Real SOL it also holds the rent of the
 *  accounts the buy opened, which the entry price leaves out. */
export const costSol = (entry: { qty: number; priceUsd: number; solPriceUsd: number }) => entry.qty * entry.priceUsd / entry.solPriceUsd;
/** The rent a held coin's buy paid to open its accounts: a deposit the wallet still owns, never cost or profit (types/ledger.ts). */
export const rentSol = (entry: { sol: number; qty: number; priceUsd: number; solPriceUsd: number }) => Math.max(0, entry.sol - costSol(entry));
/** A held coin's profit in SOL: its worth less the cost of the coin, so it agrees with its return on the price. */
export const openProfit = (row: { entry: { qty: number; priceUsd: number; solPriceUsd: number } | null; valueSol: number }) => row.entry ? row.valueSol - costSol(row.entry) : 0;

/** A coin's record at its mint's latest price, as its page shows it: the mark, what is held of it in SOL and where TraderBot looks next. */
export function pricedCoin<R extends Row>(row: R, live: Live | null) {
  const coin = priced(row, live);
  return { ...coin, valueSol: heldValue(coin, live?.solUsd ?? 0) };
}

/** The mints whose live prices home shows: bags, asks and entries being watched. */
export function homeAddresses(board: Pick<Board, 'bags' | 'needs' | 'watching'>) {
  return [...new Set([...board.bags, ...board.needs, ...board.watching].map(row => row.token.address))].sort();
}

/** `team.board` at the latest prices, exactly as home shows it: each portfolio's money (`portfolios`; its `equity` counts the account
 *  deposits of Real SOL the ledger keeps) and the shown one's (`money`), each strategy's open profit in the portfolio it trades in, every coin's mark and value, whether the worker is online
 *  at `now`, and whether its live view is up (`liveView`): with the team topic on (`topic`, flags `topicAt`), a fresh beat whose `gwOkAt` is
 *  more than LINK_QUIET_MS older says the team trades and its live view is down. Both times are the servers' (Convex's beat, the worker's
 *  `gwOkAt`), so the browser's clock plays no part in it. */
export function composeHome<B extends Board>(board: B, live: Live, now: number, topic: boolean) {
  const { portfolios, strategies, bags: held, needs, watching, researching, ...rest } = board;
  const bags = (held as B['bags']).map(row => { const coin = priced(row as B['bags'][number], live); return { ...coin, valueSol: heldValue(coin, live.solUsd) }; });
  const open = (rows: typeof bags) => rows.reduce((sum, row) => sum + openProfit(row), 0);
  const moneyOf = (mode: 'paper' | 'live') => {
    const { cash, realizedPnlSol, deposits } = portfolios[mode], own = bags.filter(row => row.mode === mode), invested = own.reduce((sum, row) => sum + row.valueSol, 0);
    return { cash, equity: cash + invested + (deposits ?? 0), invested, deposits, openPnl: open(own), realizedPnlSol, solUsd: live.solUsd };
  };
  const money = { paper: moneyOf('paper'), live: moneyOf('live') }, online = workerOnline(live.worker.beatAt, now);
  return { ...rest, money: money[board.workspace.mode], portfolios: money,
    worker: { online, jev: live.worker.jev, liveView: !(topic && online && live.worker.beatAt - live.worker.gwOkAt > LINK_QUIET_MS) },
    strategies: (strategies as B['strategies']).map(strategy => ({ ...strategy as B['strategies'][number], openPnlSol: open(bags.filter(row => row.strategyId === strategy.id && row.mode === strategy.mode)) })),
    bags, needs: (needs as B['needs']).map(row => priced(row as B['needs'][number], live)), watching: (watching as B['watching']).map(row => priced(row as B['watching'][number], live)),
    researching: (researching as B['researching']).map(row => priced(row as B['researching'][number], live)) };
}

const MINUTE_MS = 60_000, HOUR_MS = 60 * MINUTE_MS, DAY_MS = 24 * HOUR_MS, WEEK_MS = 7 * DAY_MS;
/** The longest profit chart window drawn from minute candles. */
export const MINUTE_CURVE_MS = 3 * HOUR_MS;
const CURVE_WINDOWS = [15 * MINUTE_MS, HOUR_MS, MINUTE_CURVE_MS, DAY_MS, WEEK_MS, 30 * DAY_MS, 365 * DAY_MS];
export type CurveResolution = 'minute' | 'hour' | 'day' | 'week';
/** The profit chart's window and candle size for a history `ageMs` long, capped by `range` (ms): short histories get minutes, long ones hours, days
 *  or weeks. `team.curve` reads candles at this resolution; ProfitChart picks the bucket it asks with by the same rule. */
export function curveScale(ageMs: number, range = Infinity): { span: number; resolution: CurveResolution } {
  const span = Math.min(range, CURVE_WINDOWS.find(size => size >= ageMs) ?? Math.ceil(ageMs / (365 * DAY_MS)) * 365 * DAY_MS);
  return { span, resolution: span <= MINUTE_CURVE_MS ? 'minute' : span <= WEEK_MS ? 'hour' : span <= 180 * DAY_MS ? 'day' : 'week' };
}
