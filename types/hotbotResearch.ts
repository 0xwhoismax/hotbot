import { DEFAULT_RESEARCH_POLICY, type TeamRules, type ResearchRuleKey } from './hotbot';
import { poolSale } from './market';
import { secondsText } from './inactivity';
import { DUMP_PCT_STEPS, DUMP_SOL_STEPS, SHIELD_ROWS, holdingOn, shieldOf, type InsiderGroup } from './shield';

/** The rules a research verdict reads: coin selection only, never a budget, a size or an execution setting. */
export const RESEARCH_RULES = ['researchPolicy', 'shield', 'blockedMints', 'hourCrashLimit', 'minLiquidityUsd', 'minVolume24hUsd', 'minMarketCapUsd', 'maxMarketCapUsd',
  'minAgeMinutes', 'maxAgeMinutes', 'maxAgeHard', 'minGraduatedSeconds', 'maxTop10Percent', 'minHolders', 'minBuyers1h', 'minBuySellRatio',
  'minMove1hPct', 'maxMove1hPct', 'sweetMove1hLowPct', 'sweetMove1hHighPct', 'minTurnover1h', 'maxTurnover1h', 'maxDrawdownPct', 'minLpBurnPct', 'lpBurnHard'] as const satisfies readonly (keyof TeamRules)[];
export type ResearchRules = Pick<TeamRules, typeof RESEARCH_RULES[number]>;

export const RESEARCH_CHECKS = {
  liquidity: { label: 'Liquidity', explanation: 'Pool liquidity relative to the proposed trade.' },
  volume: { label: '24h volume', explanation: 'Trading activity; volume alone does not prove organic demand.' },
  market_cap: { label: 'Market cap', explanation: 'Fit with the selected market-cap range.' },
  age: { label: 'Token age', explanation: 'Time available to observe the token.' },
  holders: { label: 'Top 10 holders', explanation: 'Reported concentration, which may include pool or custody accounts.' },
} as const;
export type ResearchEvidence = {
  priceUsd?: number; solPriceUsd?: number; liquidityUsd?: number; volume24hUsd?: number; marketCapUsd?: number; ageMinutes?: number;
  top10Percent?: number; mintable?: boolean; freezable?: boolean; missing: string[];
  /** Seconds since the coin left its launchpad's curve (the indexer row's `bonded_at`). Undefined, and the check passes it, for a coin still on
   *  its curve, one launched straight into a pool, and one that graduated before the indexer kept its time. */
  graduatedSeconds?: number;
  /** The indexer's 24-hour volume where its record doesn't cover the whole day (it restarted inside the day), in place of `volume24hUsd`:
   *  the part the record holds, a lower bound (`dayVolume`). */
  volume24hAtLeastUsd?: number;
  move1hPct?: number; buyers1h?: number; devPercent?: number; insidersPercent?: number; bundlersPercent?: number; snipersPercent?: number;
  holders?: number; buySellRatio1h?: number; drawdownPct?: number; lpBurnPct?: number; feesUsd24h?: number;
  totalFeesUsd?: number; feeWindows?: FeeWindow[]; deployer?: string; deployerRugs?: number;
  launchOpenCapUsd?: number; launchPeakCapUsd?: number;
  /** The indexer's bundle style where it watched the launch from its first transaction (`launch_live`): `layered` (ShieldBot's layered
   *  launch), `block0` or `none`. Undefined elsewhere: the check judges only what the indexer watched. */
  bundleStyle?: 'layered' | 'block0' | 'none';
  /** The share of every transfer the coin's mint withholds (Token-2022's transfer fee, the indexer's `transfer_fee_bps`), in %: 0 for none,
   *  undefined where the indexer hasn't read it. */
  transferFeePct?: number;
  /** The fee of the coin's main pool in basis points of the quote that enters or leaves it (the indexer's `swapFeeBps`, from the pool's own
   *  trades): pump.fun's curve 125 for most coins, PumpSwap 30 without a creator fee and up to 125 with one. Undefined where the indexer
   *  doesn't read it. Paper fills and the Lab's replays charge it. */
  swapFeeBps?: number;
  /** The last 30 minutes of the coin's 1-second bars, where research read them (coins under 2 hours old): the rise over the 30-minute low and
   *  the distance under the 30-minute high, in %, and the spread of 10-second log steps. ShieldBot's smooth-climb check reads it. */
  climb?: { risePct: number; offHighPct: number; stepVol: number };
  /** What the dev and the wallets it passed the coin to did, where the indexer saw the launch: shares of supply bought and sold, minutes
   *  from the launch to the first and last sale, and how many wallets it passed the coin to. */
  devBoughtPct?: number; devSoldPct?: number; devFirstSellMinutes?: number; devLastSellMinutes?: number; devLinkedWallets?: number;
  /** The share of supply the launch's bundlers bought, where the indexer saw the launch (ShieldBot's bundler buys). */
  bundlersBoughtPct?: number;
  crewBuyers?: number; jointSellers?: number;
  /** A coin whose launch the worker reads (`LAUNCH_READ_MINUTES`) and doesn't know yet: still being read (`reading`) or unreadable after every try (`unread`). */
  launchUnread?: 'reading' | 'unread';
  /** The deepest one-minute fall in the hour before research (close against its open or the previous close) and how long ago it closed. */
  hourCrashPct?: number; hourCrashAgoMinutes?: number;
  /** The share of 24h volume from pro-trader wallets (`proTraderVolume24hPercentage`), and the share of the pool's LP that is burned. */
  terminalVolumePercent?: number; liquidityBurnPercent?: number;
  /** The top 25 holders' average buy price as a percent of the price (85 = they bought at 0.85×), and how many of them bought on a DEX. */
  holderBasisPct?: number; holderBasisBuyers?: number;
  /** The program that made the coin's pool (`factory`) and the launchpad it came from (`source`, else its launch program), when it came from
   *  one. The indexer names it from types/shield.ts `LAUNCHPAD_IDS`. */
  poolFactory?: string; launchpad?: string;
  /** The evidence came from the launchpad indexer. */
  fromIndexer?: boolean;
  proTradersPercent?: number;
  /** What the largest group of linked wallets holds (the indexer's `clusters.top_pct`), % of supply, once it read every holder. */
  linkedTopPct?: number;
  /** The creator's launches and graduations the indexer counted, this coin's included, and its closed launches whose dev, bundlers and
   *  snipers took each step of types/shield.ts `DUMP_SOL_STEPS` (row) and `DUMP_PCT_STEPS` of the other buyers' SOL (column) or more. */
  creatorLaunches?: number; creatorGraduations?: number; creatorDumpGrid?: number[][];
  /** The coin's first buyers past the dev, in buy order, where the indexer saw the launch (types/shield.ts `EARLY_MAX` at most). */
  earlyList?: EarlyBuyer[];
  /** Each launch group's bag at the price and its trades so far, where the indexer saw the launch: insider profit and dump depth. */
  insiderGroups?: Partial<Record<InsiderGroup, InsiderBag>>;
};
/** One early buyer, as `[sol, heldPct, flags]`: its first buy in SOL, what it holds now in % of supply, and its `EARLY_SOLD` and `EARLY_APP`
 *  flags. A plain array, as Convex stores it. */
export type EarlyBuyer = number[];
/** It sold since its first buy; it had traded through an app by its first buy. */
export const EARLY_SOLD = 1, EARLY_APP = 2;
/** In USD: what the group holds at the price, and what its buys cost and its sales brought. */
export type InsiderBag = { heldUsd: number; boughtUsd: number; soldUsd: number };
/** The first `n` early buyers: how many there are, what they hold (% of supply), how many sold any and how many hold none. */
export function earlyFigures(e: Pick<ResearchEvidence, 'earlyList'>, n: number) {
  if (!e.earlyList) return undefined;
  const first = e.earlyList.slice(0, n);
  return { buyers: first.length, heldPct: first.reduce((sum, [, held]) => sum + held, 0), sold: first.filter(([, , flags]) => flags & EARLY_SOLD).length, exited: first.filter(([, held]) => held === 0).length };
}
/** The widest set of the first `n` early buyers whose first buys sit within `tolerancePct` of each other, wallets that trade through an
 *  app only when `apps`: its wallets and what they hold (% of supply), or none under `min` wallets. */
export function sameSizeSet(e: Pick<ResearchEvidence, 'earlyList'>, n: number, tolerancePct: number, min: number, apps: boolean) {
  if (!e.earlyList) return undefined;
  const buys = e.earlyList.slice(0, n).filter(([sol, , flags]) => sol > 0 && (apps || !(flags & EARLY_APP))).sort((a, b) => a[0] - b[0]);
  let best = { wallets: 0, heldPct: 0 };
  for (let lo = 0, hi = 0; hi < buys.length; hi++) {
    while (buys[hi]![0] > buys[lo]![0] * (1 + tolerancePct / 100)) lo++;
    if (hi - lo + 1 > best.wallets) best = { wallets: hi - lo + 1, heldPct: buys.slice(lo, hi + 1).reduce((sum, [, held]) => sum + held, 0) };
  }
  return best.wallets >= min ? best : { wallets: 0, heldPct: 0 };
}
/** The creator's closed launches dumped at a take of `takeSol` and `takePct`, two steps of the indexer's grid. */
export const creatorDumps = (e: Pick<ResearchEvidence, 'creatorDumpGrid'>, takeSol: number, takePct: number) =>
  e.creatorDumpGrid?.[DUMP_SOL_STEPS.indexOf(takeSol)]?.[DUMP_PCT_STEPS.indexOf(takePct)];
/** `groups` selling all they hold into the pool now (types/market.ts `poolSale`): what that and their sales so far bring over what they
 *  paid (×, undefined before a buy), and how far it sinks the price (%). */
export function insiderSale(e: Pick<ResearchEvidence, 'insiderGroups' | 'liquidityUsd' | 'swapFeeBps'>, groups: readonly InsiderGroup[]) {
  if (!e.insiderGroups || !e.liquidityUsd) return undefined;
  const bags = groups.flatMap(group => e.insiderGroups?.[group] ?? []), total = (field: keyof InsiderBag) => bags.reduce((sum, bag) => sum + bag[field], 0);
  const paid = total('boughtUsd'), sale = poolSale(total('heldUsd'), e.liquidityUsd, e.swapFeeBps ?? 0);
  return { depthPct: 100 * (1 - sale.priceAfter), profitX: paid > 0 ? (total('soldUsd') + sale.proceedsUsd) / paid : undefined };
}
/** Volume and trader-paid fees over the same window. */
export type FeeWindow = { window: '5m' | '1h' | '24h'; volumeUsd: number; feesUsd: number };
/** Strategy filters beyond the core targets. Each one is weighted like any target: a miss or missing data is a shortfall in the fit score, never an instant reject. */
export const EXTRA_CHECKS = {
  turnover: 'Turnover', graduated: 'Since graduation',
  max_age: 'Coin age limit', move_1h: '1h price move', max_move_1h: '1h move range', buyers_1h: 'Buyers in the last hour', dev: 'Dev holdings', bundlers: 'Bundler holdings', snipers: 'Sniper holdings',
  linked: 'Linked wallets', early: 'First buyers', sameSize: 'Same-size buyers',
  holders_count: 'Holders', buy_sell: 'Buy/sell ratio', drawdown: 'Drawdown from high', lp_burn: 'Liquidity burned',
} as const;
/** `target` and `measured` are the check in words; both are '' from `researchCriteria` without `text` (discovery's screen, code's rechecks). */
export type RuleAssessment = {
  key: string; label: string; mode: 'weighted' | 'hard'; weight: number; target: string; measured: string;
  met?: boolean; missing: boolean; score?: number; confidence?: number; probability?: number;
};
/** Under $100K it keeps one decimal, cut rather than rounded, so a cap just under a $25K floor reads $24.9K, never $25K. */
export const money = (value: number) => '$' + (value >= 1e9 ? +(value / 1e9).toFixed(1) + 'B' : value >= 1e6 ? +(value / 1e6).toFixed(1) + 'M' : value >= 1e5 ? Math.round(value / 1e3) + 'K' : value >= 1e3 ? Math.floor(value / 100) / 10 + 'K' : Math.round(value));
// One formatter: `toLocaleString` with options builds a new one per call, which dominates replaying research over thousands of coins.
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const pct = (value: number) => percent.format(value) + '%';
export const age = (minutes: number) => minutes < 60 ? Math.floor(minutes) + 'm' : minutes < 2880 ? Math.round(minutes / 60) + 'h' : Math.round(minutes / 1440) + 'd';

/** A check's words (`target`, `measured`), given as the string or as the formatting that builds it: with `text` the words, without it '' and the
 *  formatting never runs. The formatting is most of what a screen of a thousand rows costs; the screen reads none of the words. */
type Words = (words: string | (() => string)) => string;
const wordsOf = (text: boolean): Words => text ? words => typeof words === 'string' ? words : words() : () => '';

/** Hard checks a coin can't outgrow: its deployer pulled a pool before or dumped earlier coins, its launch jumped, its pool is self-made, it
 *  launched in layers, on Meteora or on a launchpad the strategy doesn't trade, it climbed too smoothly, its mint takes a transfer fee. A coin
 *  turned down on one stays out for good; any other turned-down coin may be researched again once its price moves (types/team `REPICK`). */
export const FINAL = { rugger: 'Pool puller', dumper: SHIELD_ROWS.dumper.name, launch: SHIELD_ROWS.launchJump.name, layered: 'Layered launch', launchpad: 'Launchpad', smooth: 'Smooth climb', selfMade: 'Self-made pool', meteora: 'Meteora launch', fee: 'Transfer fee' } as const;
/** A strategy's checks with their targets, unmeasured: the backend measures each one on a coin and fills `measured`, `met` and `score`. */
export function researchCriteria(r: ResearchRules, _e: Partial<ResearchEvidence>, _tokenAddress: string, text = true): RuleAssessment[] {
  const words = wordsOf(text), p = r.researchPolicy ?? DEFAULT_RESEARCH_POLICY, checks: RuleAssessment[] = [];
  const row = (key: string, label: string, mode: 'weighted' | 'hard', weight: number, target: () => string): RuleAssessment =>
    ({ key, label, mode, weight, target: words(target), measured: words('Measured by ResearchBot'), missing: true });
  const core = (key: ResearchRuleKey, on: boolean, target: () => string) => {
    const treatment = p.checks[key];
    if (on && treatment.mode !== 'off') checks.push(row(key, RESEARCH_CHECKS[key].label, treatment.mode, treatment.weight, target));
  };
  core('liquidity', r.minLiquidityUsd > 0, () => `At least ${money(r.minLiquidityUsd)}`);
  core('volume', r.minVolume24hUsd > 0, () => `At least ${money(r.minVolume24hUsd)}`);
  core('market_cap', r.minMarketCapUsd > 0 || r.maxMarketCapUsd > 0, () => r.maxMarketCapUsd ? (r.minMarketCapUsd ? `${money(r.minMarketCapUsd)} to ${money(r.maxMarketCapUsd)}` : `Under ${money(r.maxMarketCapUsd)}`) : `Over ${money(r.minMarketCapUsd)}`);
  core('age', r.minAgeMinutes > 0, () => `At least ${age(r.minAgeMinutes)} old`);
  core('holders', r.maxTop10Percent < 100, () => `At most ${pct(r.maxTop10Percent)}`);
  const extra = (key: keyof typeof EXTRA_CHECKS, on: boolean, target: () => string, mode: 'weighted' | 'hard' = 'weighted') => { if (on) checks.push(row(key, EXTRA_CHECKS[key], mode, 1, target)); };
  extra('max_age', r.maxAgeMinutes !== undefined, () => `Younger than ${age(r.maxAgeMinutes!)}`, r.maxAgeHard ? 'hard' : 'weighted');
  extra('graduated', r.minGraduatedSeconds !== undefined, () => `Graduated ${secondsText(r.minGraduatedSeconds!)} ago or more`, 'hard');
  extra('move_1h', r.minMove1hPct !== undefined, () => `Up at least ${pct(r.minMove1hPct!)}`);
  extra('max_move_1h', r.maxMove1hPct !== undefined, () => `Up at most ${pct(r.maxMove1hPct!)} in the last hour`);
  extra('buyers_1h', r.minBuyers1h !== undefined, () => `At least ${r.minBuyers1h}`);
  extra('holders_count', r.minHolders !== undefined, () => `At least ${r.minHolders}`);
  extra('buy_sell', r.minBuySellRatio !== undefined, () => `At least ${r.minBuySellRatio}× in the last hour`);
  extra('turnover', r.minTurnover1h !== undefined || r.maxTurnover1h !== undefined, () => `${r.minTurnover1h ?? 0}–${r.maxTurnover1h ?? '∞'}× its cap traded in the hour`, 'hard');
  extra('drawdown', r.maxDrawdownPct !== undefined, () => `At most ${pct(r.maxDrawdownPct!)} below its high`);
  extra('lp_burn', r.minLpBurnPct !== undefined, () => `At least ${pct(r.minLpBurnPct!)}`, r.lpBurnHard ? 'hard' : 'weighted');
  const shield = shieldOf(r);
  for (const key of ['dev', 'bundlers', 'snipers', 'linked', 'early', 'sameSize'] as const) {
    const holding = shield[key];
    if (holdingOn(holding)) extra(key, true, () => [holding.weighAbove ? `At most ${pct(holding.weighAbove)} of supply` : '', holding.refuseAt ? `under ${pct(holding.refuseAt)} required` : ''].filter(Boolean).join(', '), holding.weighAbove ? 'weighted' : 'hard');
  }
  if (shield.washTrading) checks.push(row('real_trading', 'Real trading', 'hard', 1, () => 'Volume and market cap paid for in fees'));
  checks.push(row('excluded', 'Excluded tokens', 'hard', 1, () => 'Not on your exclusion list'));
  return checks;
}

/** Weighted fit of the given checks: 100 meets every target and is the maximum score. */
export function fitOf(checks: RuleAssessment[]) {
  const weight = checks.reduce((sum, c) => sum + c.weight, 0);
  return weight ? checks.reduce((sum, c) => sum + (c.score ?? 0) * c.weight, 0) / weight : 100;
}
/** Checks that a missing security read cannot measure, so they are no gap when the read is unavailable. */
const SECURITY_CHECKS = new Set(['holders']);
/** Research's verdict on checks with no hard failure: measured rules must reach the strategy's displayed pass mark, with no internal
 *  margin. A weighted rule without data (`gaps`) waits; with `securityUnavailable`, security checks score 0 without counting as gaps.
 *  `couldPass`: the coin clears the same pass mark once its gaps fill. */
export function codeGate(checks: RuleAssessment[], threshold: number, securityUnavailable?: boolean) {
  const measured = checks.filter(c => c.mode === 'weighted' && c.score !== undefined);
  const bar = threshold, codeFit = (fill?: number) => fitOf(fill === undefined ? measured : measured.map(c => c.missing ? { ...c, score: fill } : c));
  const gaps = measured.filter(c => c.missing && !(securityUnavailable && SECURITY_CHECKS.has(c.key))), fit = codeFit();
  return { bar, fit, gaps, short: measured.filter(c => c.score! < 100), pass: !gaps.length && fit >= bar, couldPass: codeFit(100) >= bar };
}
