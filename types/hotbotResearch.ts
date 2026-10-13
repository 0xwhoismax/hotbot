/** ResearchBot's checks as the client shows them. The backend measures each check on a coin and scores it. The predicates, thresholds and
 *  models that do that are private, so this file holds the contract only: each check's key, label, owner and target in words. */
import { DEFAULT_RESEARCH_POLICY, type TeamRules, type ResearchPolicy, type ResearchRuleKey } from './hotbot';
import { shieldOf, holdingOn } from './shield';

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
  move1hPct?: number; buyers1h?: number; devPercent?: number; insidersPercent?: number; bundlersPercent?: number; snipersPercent?: number;
  holders?: number; buySellRatio1h?: number; drawdownPct?: number; lpBurnPct?: number; feesUsd24h?: number;
  totalFeesUsd?: number; feeWindows?: FeeWindow[]; deployer?: string; deployerRugs?: number;
  /** Market cap at the coin's launch and its highest in its first `LAUNCH_SECONDS` seconds (ShieldBot's launch jump):
   *  from the price before the first trade by a wallet other than the dev where the indexer saw the launch, else from Mobula's first 1-second candle. */
  launchOpenCapUsd?: number; launchPeakCapUsd?: number;
  /** The indexer's bundle style where it watched the launch from its first transaction (`launch_live`): `layered` (ShieldBot's layered
   *  launch), `block0` or `none`. Undefined elsewhere: the check judges only what the indexer watched. */
  bundleStyle?: 'layered' | 'block0' | 'none';
  /** A pump.fun Mayhem-mode launch, where the indexer saw the launch; undefined elsewhere. */
  mayhem?: boolean;
  /** The share of every transfer the coin's mint withholds (Token-2022's transfer fee, the indexer's `transfer_fee_bps`), in %: 0 for none,
   *  undefined where the indexer hasn't read it. */
  transferFeePct?: number;
  /** The last 30 minutes of the coin's 1-second bars, where research read them (coins under 2 hours old): the rise over the 30-minute low and
   *  the distance under the 30-minute high, in %, and the spread of 10-second log steps. ShieldBot's smooth-climb check reads it. */
  climb?: { risePct: number; offHighPct: number; stepVol: number };
  /** What the dev and the wallets it passed the coin to did, where the indexer saw the launch: shares of supply bought and sold, minutes
   *  from the launch to the first and last sale, and how many wallets it passed the coin to. */
  devBoughtPct?: number; devSoldPct?: number; devFirstSellMinutes?: number; devLastSellMinutes?: number; devLinkedWallets?: number;
  /** The share of supply the launch's bundlers bought, where the indexer saw the launch (ShieldBot's bundler buys). */
  bundlersBoughtPct?: number;
  crewRate?: number; crewWallets?: number;
  /** A coin under `LAUNCH_CHECK_MINUTES` old whose launch isn't known: still being read (`reading`) or unreadable after every try (`unread`). */
  launchUnread?: 'reading' | 'unread';
  /** The deepest one-minute fall in the hour before research (close against its open or the previous close) and how long ago it closed. */
  hourCrashPct?: number; hourCrashAgoMinutes?: number;
  /** Mobula's share of 24h volume from wallets it tags as pro traders (`proTraderVolume24hPercentage`), and the LP burn its security read reports. */
  terminalVolumePercent?: number; liquidityBurnPercent?: number;
  /** The top 25 holders' average buy price as a percent of the price (85 = they bought at 0.85×), and how many of them bought on a DEX. */
  holderBasisPct?: number; holderBasisBuyers?: number;
  /** The program that made the coin's pool (`factory`) and the launchpad it came from (`source`, else its launch program), when it came from one. */
  poolFactory?: string; launchpad?: string;
  fromIndexer?: boolean;
  proTradersPercent?: number;
};
/** Volume and trader-paid fees over the same window. */
export type FeeWindow = { window: '5m' | '1h' | '24h'; volumeUsd: number; feesUsd: number };
/** Strategy filters beyond the core targets. Each one is weighted like any target: a miss or missing data is a shortfall in the fit score, never an instant reject. */
export const EXTRA_CHECKS = {
  turnover: 'Turnover',
  entry_score: 'Entry score',
  max_age: 'Coin age limit', move_1h: '1h price move', max_move_1h: '1h move range', buyers_1h: 'Buyers in the last hour', dev: 'Dev holdings', bundlers: 'Bundler holdings', snipers: 'Sniper holdings',
  holders_count: 'Holders', buy_sell: 'Buy/sell ratio', drawdown: 'Drawdown from high', lp_burn: 'Liquidity burned',
} as const;
/** `target` and `measured` are the check in words; both are '' from `researchCriteria` without `text` (discovery's screen, code's rechecks). */
export type RuleAssessment = {
  key: string; label: string; mode: 'weighted' | 'hard'; weight: number; target: string; measured: string;
  met?: boolean; missing: boolean; score?: number; confidence?: number; probability?: number;
};
export type ResearchScorecard = { policy: ResearchPolicy; threshold: number; score?: number; reason?: string; checks: RuleAssessment[]; hardFailures: string[] };
/** Under $100K it keeps one decimal, cut rather than rounded, so a cap just under a $25K floor reads $24.9K, never $25K. */
export const money = (value: number) => '$' + (value >= 1e9 ? +(value / 1e9).toFixed(1) + 'B' : value >= 1e6 ? +(value / 1e6).toFixed(1) + 'M' : value >= 1e5 ? Math.round(value / 1e3) + 'K' : value >= 1e3 ? Math.floor(value / 100) / 10 + 'K' : Math.round(value));
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const pct = (value: number) => percent.format(value) + '%';
export const age = (minutes: number) => minutes < 60 ? Math.floor(minutes) + 'm' : minutes < 2880 ? Math.round(minutes / 60) + 'h' : Math.round(minutes / 1440) + 'd';
/** A check's words (`target`, `measured`), given as the string or as the formatting that builds it: with `text` the words, without it '' and the
 *  formatting never runs. The formatting is most of what a screen of a thousand rows costs; the screen reads none of the words. */
type Words = (words: string | (() => string)) => string;
const wordsOf = (text: boolean): Words => text ? words => typeof words === 'string' ? words : words() : () => '';
export const LAUNCH_SECONDS = 10;
export const LAUNCH_CHECK_MINUTES = 360;
export const YOUNG_MINUTES = 120;
/** Hard checks a coin can't outgrow: Mobula rates it Critical, its deployer pulled liquidity before, its launch jumped, its pool is self-made,
 *  it launched on Meteora, its mint takes a transfer fee. A coin turned down on one stays out for good; any other turned-down coin may be
 *  researched again once its price moves (types/team `REPICK`). */
export const FINAL = { rugger: 'Deployer history', launch: 'Launch jump', layered: 'Layered launch', mayhem: 'Mayhem launch', smooth: 'Smooth climb', selfMade: 'Self-made pool', meteora: 'Meteora launch', fee: 'Transfer fee' } as const;
/** The safety checks behind a team's "kept out" count, by the check's label (discovery's screen or research), to the plain name people see
 *  after a count ("94 launch jump"). Style filters (cap, age, liquidity, a strategy's own must-haves) are not safety and never count. */
export const KEPT_OUT: Record<string, string> = {
  'Scam signs': 'scam signs', 'Real trading': 'scam signs', [EXTRA_CHECKS.dev]: 'scam signs', [EXTRA_CHECKS.bundlers]: 'scam signs', [EXTRA_CHECKS.snipers]: 'scam signs',
  'Pro-trader holdings': 'few pro holders', 'Creator controls': 'creator controls', [FINAL.rugger]: 'rugger deployer', [FINAL.launch]: 'launch jump', [FINAL.layered]: 'layered launch', [FINAL.mayhem]: 'Mayhem launch', [FINAL.smooth]: 'smooth climb', [FINAL.fee]: 'transfer fee', 'Top 10 holdings': 'top 10 holdings', 'Bundler buys': 'bundler buys', 'Rug crew': 'rug crew',
  [FINAL.selfMade]: 'self-made pool', [FINAL.meteora]: 'Meteora launch', 'Recent crash': 'recent crash',
};
/** A verdict that turned a coin down on a check it can't outgrow (`FINAL`), read from the reason research recorded. */
export const finalReject = (reason: string | undefined) => Boolean(reason?.startsWith('Hard rule not met:') && Object.values(FINAL).some(label => reason.includes(label)));

/** The hard checks the backend runs before anything is weighed. `owner` says who sets each one: `locked` (every strategy), ShieldBot or
 *  ResearchBot. The backend evaluates them; the client shows their targets. */
export const INSTANT_REJECTS: { key: string; label: string; owner: 'locked' | 'shield' | 'research'; target: (r: TeamRules) => string }[] = [
  { key: 'rugger', label: FINAL.rugger, owner: 'locked', target: () => 'Never pulled liquidity from an earlier coin' },
  { key: 'meteora_launch', label: FINAL.meteora, owner: 'locked', target: () => 'Not launched on Meteora' },
  { key: 'self_made_pool', label: FINAL.selfMade, owner: 'shield', target: r => { const days = shieldOf(r).selfMadeDays; return days ? `Launched on a launchpad, or older than ${days} days` : 'Off'; } },
  { key: 'launch_jump', label: FINAL.launch, owner: 'shield', target: r => { const jump = shieldOf(r).launchJump; return jump ? `Under ${jump}× in its first ${LAUNCH_SECONDS} seconds` : 'Off'; } },
  { key: 'layered_launch', label: FINAL.layered, owner: 'shield', target: r => shieldOf(r).layered ? 'Supply not passed to fresh wallets at launch' : 'Off' },
  { key: 'mayhem_launch', label: FINAL.mayhem, owner: 'shield', target: r => shieldOf(r).mayhem ? 'Not a Mayhem-mode launch' : 'Off' },
  { key: 'transfer_fee', label: FINAL.fee, owner: 'shield', target: r => shieldOf(r).transferFee ? 'No fee on transfers' : 'Off' },
  { key: 'top10_held', label: 'Top 10 holdings', owner: 'shield', target: r => { const at = shieldOf(r).top10; return at ? `Top 10 hold under ${at}% of supply` : 'Off'; } },
  { key: 'crew_rate', label: 'Rug crew', owner: 'shield', target: r => { const at = shieldOf(r).crew; return at ? `First buyers' history under ${at}%` : 'Off'; } },
  { key: 'bundlers_bought', label: 'Bundler buys', owner: 'shield', target: r => { const at = shieldOf(r).bundlersBought; return at ? `Bundlers bought under ${at}% of supply` : 'Off'; } },
  { key: 'smooth_climb', label: FINAL.smooth, owner: 'shield', target: r => shieldOf(r).smoothClimb ? 'Not a climb too smooth to be real trading' : 'Off' },
  { key: 'pro_holdings', label: 'Pro-trader holdings', owner: 'shield', target: r => { const floor = shieldOf(r).proHolders; return floor ? `At least ${floor}% of supply` : 'Off'; } },
];

/** A strategy's checks with their targets, unmeasured: the backend fills `measured`, `met` and `score` for a coin. */
export function researchCriteria(r: TeamRules, _e: ResearchEvidence, _tokenAddress: string, text = true): RuleAssessment[] {
  const words = wordsOf(text), p = r.researchPolicy ?? DEFAULT_RESEARCH_POLICY, checks: RuleAssessment[] = [];
  const row = (key: string, label: string, mode: 'weighted' | 'hard', weight: number, target: () => string): RuleAssessment =>
    ({ key, label, mode, weight, target: words(target), measured: words('Measured by ResearchBot'), missing: true });
  const core = (key: ResearchRuleKey, on: boolean, target: () => string) => {
    const treatment = p.checks[key];
    if (on && treatment.mode !== 'off') checks.push(row(key, RESEARCH_CHECKS[key].label, treatment.mode, treatment.weight, target));
  };
  core('liquidity', r.minLiquidityUsd > 0, () => `At least ${money(r.minLiquidityUsd)}`);
  core('volume', r.minVolume24hUsd > 0, () => `At least ${money(r.minVolume24hUsd)}`);
  core('market_cap', r.minMarketCapUsd > 0 || r.maxMarketCapUsd > 0, () => r.maxMarketCapUsd ? `${money(r.minMarketCapUsd)} to ${money(r.maxMarketCapUsd)}` : `Over ${money(r.minMarketCapUsd)}`);
  core('age', r.minAgeMinutes > 0, () => `At least ${age(r.minAgeMinutes)} old`);
  core('holders', r.maxTop10Percent < 100, () => `At most ${pct(r.maxTop10Percent)}`);
  const extra = (key: keyof typeof EXTRA_CHECKS, on: boolean, target: () => string, mode: 'weighted' | 'hard' = 'weighted') => { if (on) checks.push(row(key, EXTRA_CHECKS[key], mode, 1, target)); };
  extra('max_age', r.maxAgeMinutes !== undefined, () => `Younger than ${age(r.maxAgeMinutes!)}`, r.maxAgeHard ? 'hard' : 'weighted');
  extra('move_1h', r.minMove1hPct !== undefined, () => `Up at least ${pct(r.minMove1hPct!)}`);
  extra('max_move_1h', r.maxMove1hPct !== undefined, () => `Up at most ${pct(r.maxMove1hPct!)}`);
  extra('buyers_1h', r.minBuyers1h !== undefined, () => `At least ${r.minBuyers1h}`);
  extra('holders_count', r.minHolders !== undefined, () => `At least ${r.minHolders}`);
  extra('buy_sell', r.minBuySellRatio !== undefined, () => `At least ${r.minBuySellRatio}× in the last hour`);
  extra('entry_score', r.minEntryScore !== undefined, () => `At least ${r.minEntryScore} of 100`, 'hard');
  extra('turnover', r.minTurnover1h !== undefined || r.maxTurnover1h !== undefined, () => `${r.minTurnover1h ?? 0}–${r.maxTurnover1h ?? '∞'}× its cap traded in the hour`, 'hard');
  extra('drawdown', r.maxDrawdownPct !== undefined, () => `At most ${pct(r.maxDrawdownPct!)} below its high`);
  extra('lp_burn', r.minLpBurnPct !== undefined, () => `At least ${pct(r.minLpBurnPct!)}`, r.lpBurnHard ? 'hard' : 'weighted');
  const shield = shieldOf(r);
  for (const key of ['dev', 'bundlers', 'snipers'] as const) {
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
/** Checks read from Mobula's security endpoint (top-10 falls back to token details). */
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

/** Research's verdict in plain words. */
export const RESEARCH_REASONS = {
  balanced: 'Meets your targets.',
  compensated: 'Strong enough elsewhere to make up for its misses.',
  weak_fit: 'Misses too many of your targets.',
  missing: 'Not enough data to judge it yet.',
  hard_rule: 'Fails a must-have rule.',
} as const;

