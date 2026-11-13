import { LOSS_STOP_PCT, type TeamRules } from './hotbot';
import { maxBuySol, type Mode } from './team';
/** The SOL a strategy's open coins may take: a Real SOL budget less what it lost, a Practice one whole. */
export const budgetLeft = (strategy: { mode: Mode; rules: Pick<TeamRules, 'allocationSol'>; lostSol: number }) => strategy.rules.allocationSol - (strategy.mode === 'live' ? strategy.lostSol : 0);
/** What a strategy's open coins take of its budget, each at the cost it still carries (a buy not filled yet at its size). */
export const heldCost = (open: number[]) => open.reduce((sum, sol) => sum + sol, 0);
/** The loss at which a Real SOL strategy stops: its share of the budget (`lossStopPct`), or sooner where the budget left would hold less than
 *  its largest buy. 0 or less: its first loss stops it. */
export const stopAtSol = (rules: Pick<TeamRules, 'allocationSol' | 'lossStopPct' | 'amountSol' | 'maxPoolSharePct'>) =>
  Math.min((rules.lossStopPct ?? LOSS_STOP_PCT) / 100 * rules.allocationSol, rules.allocationSol - maxBuySol(rules));
/** Whether a practice strategy has a Real SOL copy: one of `copies` (the team's Real SOL strategies) not archived names it as its twin. */
export const twinned = (strategyId: string, copies: { twinId?: string | null; status: string }[]) => copies.some(copy => copy.twinId === strategyId && copy.status !== 'archived');
