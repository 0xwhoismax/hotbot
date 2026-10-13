import { exitFamily } from '../../../../types/performance';
export { checkLabel, rulesOfCheck, type Result } from '../../../../types/lab';

/** A sold coin as `team.trades` returns it. */
export type OwnTrade = { id: string; strategyId: string; token: { address: string; symbol: string; logoUri?: string }; inSol: number; pnlSol: number; changePct: number; boughtAt: number | null; closedAt: number; reason: string | null; entryPriceUsd?: number | null };
/** Where the money went: sold coins by exit reason, losses first. */
export function byExit(trades: OwnTrade[]) {
  const groups = new Map<string, { key: string; trades: OwnTrade[]; sol: number; lost: number }>();
  for (const trade of trades) {
    const key = exitFamily(trade.reason ?? 'No reason recorded'), group = groups.get(key) ?? { key, trades: [], sol: 0, lost: 0 };
    group.trades.push(trade); group.sol += trade.pnlSol; if (trade.pnlSol < 0) group.lost++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.sol - b.sol);
}
