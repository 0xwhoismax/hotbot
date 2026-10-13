import { POOL_SHARE, SELL_MODEL } from './hotbot';
import { YOUNG_MINUTES, LAUNCH_CHECK_MINUTES } from './hotbotResearch';
import { CREW_MINUTES, LAYERED_MINUTES, LAYERED_WALLETS, SMOOTH_RISE_PCT } from './shield';
import { ENTRY_ACTIVITY_DESCRIPTION } from './entryActivity';
import { INACTIVITY_DEFAULT } from './inactivity';
import { REPICK, QUEUE } from './team';
import { TRAIL } from './exits';
import type { StrategyPatch } from './team';

/** Where a row shows: an Advanced tab, and Easy when it has a row there too. */
export type GuideTab = 'search' | 'shield' | 'sniper' | 'trader' | 'budget';
export type GuideEntry = { name: string; tab?: GuideTab; easy?: true; about: string; up?: string; down?: string; off?: string; noReplay?: true; patch?: string };

const young = `${YOUNG_MINUTES / 60} hours`;
const check = (name: string, about: string, up: string, down: string, extra: Partial<GuideEntry> = {}): GuideEntry => ({ name, tab: 'search', about, up, down, ...extra });
const shield = (name: string, about: string, extra: Partial<GuideEntry> = {}): GuideEntry => ({ name, tab: 'shield', ...extra, about });

export const SETTINGS_GUIDE = {
  // ---- Easy only ----
  market: { name: 'What to trade', easy: true, about: 'Easy’s four coin kinds. New pairs: coins still on a launchpad curve (fastest, most rugs). Graduated: coins just off the curve. 6 figs: any coin at a $100K–$1M market cap. Mid market: coins over $1M (slowest, fewest rugs). A pick sets the streams and the market-cap band in Advanced → Search.', patch: 'streams, minMarketCapUsd, maxMarketCapUsd' },
  result: { name: 'Replay result', easy: true, about: 'What the settings on screen would have made in SOL, replayed on the coins research read over the last days. The replay sells only on the exit plan: no TraderBot sales, no re-buys, no inactivity exit and no sell-or-keep model. A few days of coins is a small sample; a change that only helps one half of the days is luck.' },
  ideas: { name: 'HOTBOT ideas', easy: true, about: 'Changes the same replay found: the best step of one rule, or a take-profit plan that beat the current one on the same days. Apply puts it in the unsaved draft; nothing saves until Save.' },

  // ---- Search ----
  streams: { name: 'Streams', tab: 'search', about: 'Which coins discovery takes: Bonding (still on a launchpad’s curve) and Graduated (off the curve, or launched straight into a pool). Both is the default.', up: 'Both: the most coins.', down: 'One stream: fewer coins, only that kind.', patch: 'streams' },
  minAgeMinutes: check('Min age', 'Skips coins younger than this. A coin too young waits at the screen and comes back once old enough.', 'Higher: older, steadier coins; misses the early part of each move.', 'Lower: earlier entries, more young-coin risk.', { patch: 'minAgeMinutes' }),
  maxAgeMinutes: check('Max age', 'Skips coins older than this, to keep the strategy on fresh coins.', 'Higher: more older coins.', 'Lower: only the newest coins.', { patch: 'maxAgeMinutes' }),
  minLiquidityUsd: check('Liquidity', 'The pool’s SOL side in USD. On a launchpad coin it follows market cap (about $15K × √(cap ÷ $100K)), so a liquidity floor works like a market-cap floor.', 'Higher: bigger coins, smaller price impact.', 'Lower: smaller coins.', { patch: 'minLiquidityUsd' }),
  minVolume24hUsd: check('Volume', 'USD traded in the last day.', 'Higher: only coins with real trading.', 'Lower: quieter coins pass.', { patch: 'minVolume24hUsd' }),
  minMarketCapUsd: check('Min market cap', 'Skips coins under this market cap.', 'Higher: bigger, slower coins.', 'Lower: smaller, faster coins.', { patch: 'minMarketCapUsd' }),
  maxMarketCapUsd: check('Max market cap', 'Skips coins over this market cap.', 'Higher: bigger coins pass.', 'Lower: only small coins.', { patch: 'maxMarketCapUsd' }),
  maxTop10Percent: check('Top 10 holders', 'Skips coins whose 10 largest wallets hold this share of supply or more. Concentrated supply can be dumped at once.', 'Higher: looser, more coins pass.', 'Lower: stricter, fewer coins.', { patch: 'maxTop10Percent' }),
  minMove1hPct: check('1h move', 'The coin must be up at least this much in the last hour, so the strategy only buys coins that are moving.', 'Higher: only strong movers, often later in the move.', 'Lower: more coins, some of them flat.', { patch: 'minMove1hPct' }),
  maxMove1hPct: check('1h move range', 'Scores a coin best when its hour’s rise sits in the sweet spot, and skips it over the limit, so the strategy does not chase a coin that already ran.', 'Higher limit: takes coins that ran further.', 'Lower limit: skips more coins that ran.', { patch: 'maxMove1hPct, sweetMove1hLowPct, sweetMove1hHighPct' }),
  minBuyers1h: check('Buyers', 'Distinct buying wallets in the last hour.', 'Higher: only coins with a crowd.', 'Lower: quieter coins pass.', { patch: 'minBuyers1h' }),
  minEntryScore: check('Entry score', 'The entry model’s rank of a coin, 0–100, against four days of research decisions. A must-have: under it the coin never passes. The Oracle preset uses 80.', 'Higher: fewer, better-ranked coins.', 'Lower: more coins, weaker ones too.', { patch: 'minEntryScore' }),
  minTurnover1h: check('Turnover floor', 'Volume in the last hour as a multiple of market cap. 2–10× marks a coin that is moving; under 1× it is stale. A must-have band with the ceiling.', 'Higher: only busy coins.', 'Lower: quieter coins pass.', { patch: 'minTurnover1h' }),
  maxTurnover1h: check('Turnover ceiling', 'The top of the turnover band: over about 20× its cap in an hour a coin is usually churned, not bought.', 'Higher: takes hotter coins.', 'Lower: skips the most churned coins.', { patch: 'maxTurnover1h' }),
  minBuySellRatio: check('Buy pressure', 'Buys as a multiple of sells.', 'Higher: only coins with clear buying.', 'Lower: balanced coins pass.', { patch: 'minBuySellRatio' }),
  maxDrawdownPct: check('Drawdown', 'Skips a coin this far or more under its high.', 'Higher: takes coins that fell further.', 'Lower: only coins near their high.', { patch: 'maxDrawdownPct' }),
  minHolders: check('Holders', 'Wallets holding the coin.', 'Higher: wider-held coins.', 'Lower: newer coins pass.', { patch: 'minHolders' }),
  addRule: { name: 'Add a rule', tab: 'search', about: 'The research checks that are off for this strategy. Picking one adds it at a starting value.' },
  mustHave: { name: 'Must-have shield', tab: 'search', about: 'The shield beside a rule. On: a coin that misses the rule never passes. Off: a miss only lowers the coin’s score against the pass mark. Liquidity, volume, market cap and age start on. Grey fixed shields are always must-haves.', patch: 'mustHave' },
  recheckMovePct: { name: 'Re-check turned-down coins', tab: 'search', about: `A coin research turned down comes back once its price moves this far from the verdict and it fits again. Never on a timer. ${REPICK.movePct}% when unset.`, up: 'Higher: fewer second looks.', down: 'Lower: more second looks.', off: 'Off: a turned-down coin never comes back.', patch: 'recheckMovePct' },
  passMark: { name: 'Soft rules pass at', tab: 'search', about: 'Rules without a must-have shield add up to a score; 100 meets every target. A coin passes at this score. Position size also grows with how far the score clears it.', up: 'Higher: fewer coins, each fitting more rules.', down: 'Lower: more coins, misses forgiven.', patch: 'passMark' },

  // ---- Shield ----
  'shield.proHolders': shield('Pro holders', `Skips a coin whose pro traders hold under this share of supply. A coin without the read passes. Not final: it comes back once pros hold enough.`, { up: 'Higher: only coins pros hold more of.', down: 'Lower: looser.', off: 'Off: pro holdings are not checked.', patch: 'shield.proHolders' }),
  'shield.washTrading': shield('Wash trading', 'Skips a coin whose volume or market cap nobody paid fees for: fake trading.', { off: 'Off: fake volume counts.', patch: 'shield.washTrading' }),
  'shield.launchJump': shield('Launch jump', `Skips for good a coin under ${LAUNCH_CHECK_MINUTES / 60} hours old whose market cap jumped this many times over in its first seconds: a bundled or sniped launch.`, { up: 'Higher: allows bigger jumps.', down: 'Lower: skips more launches.', off: 'Off: no launch read.', patch: 'shield.launchJump' }),
  'shield.layered': shield('Layered launch', `Skips for good a launch whose dev or launch buyers passed the coin to ${LAYERED_WALLETS}+ wallets in its first ${LAYERED_MINUTES} minutes, to hide how much they hold. Judges only launches the indexer watched.`, { off: 'Off: layered launches pass.', patch: 'shield.layered' }),
  'shield.mayhem': shield('Mayhem mode', 'Skips pump.fun Mayhem-mode launches, where an AI agent trades 1B extra tokens. Off by default.', { off: 'Off: Mayhem launches pass.', patch: 'shield.mayhem' }),
  'shield.transferFee': shield('Transfer fee', 'Skips for good a coin whose mint takes a fee from every transfer. The buy and the sale each pay it. On by default. A coin whose fee the indexer has not read passes.', { off: 'Off: transfer-fee coins are traded.', patch: 'shield.transferFee' }),
  'shield.smoothClimb': shield('Smooth climb', `Skips for good a coin up ${SMOOTH_RISE_PCT}%+ over its 30-minute low in a near-straight line with no pullback.`, { off: 'Off: smooth climbs pass.', patch: 'shield.smoothClimb' }),
  hourCrashLimit: shield('Recent crashes', 'Skips a coin with any 1-minute candle in the last hour that fell this much or more. With no candles there is no check.', { up: 'Higher: only skips bigger crashes.', down: 'Lower: skips coins with smaller drops.', off: 'Off: no crash check.', patch: 'hourCrashLimit' }),
  'shield.selfMadeDays': shield('Self-made pool', `Skips for good a coin whose pool its creator made on an AMM, while that pool is younger than this.`, { off: 'Off: self-made pools pass.', patch: 'shield.selfMadeDays' }),
  'shield.top10': shield('Top 10 holdings', `Skips a coin under ${young} old whose top 10 wallets hold this share of supply or more.`, { up: 'Higher: looser.', down: 'Lower: stricter.', off: 'Off: not checked.', patch: 'shield.top10' }),
  'shield.bundlersBought': shield('Bundler buys', `Skips a coin whose launch bundlers bought this share of supply or more.`, { up: 'Higher: looser.', down: 'Lower: stricter.', off: 'Off: not checked.', patch: 'shield.bundlersBought' }),
  'shield.dev': shield('Dev holdings', 'Two lines for what the dev (and wallets it passed coins to) holds: over the first it counts against the coin’s score, at the second the coin is skipped.', { off: 'Off: dev holdings are not checked.', patch: 'shield.dev' }),
  'shield.bundlers': shield('Bundler holdings', 'Two lines for what launch bundlers hold: over the first it counts against the coin, at the second the coin is skipped.', { off: 'Off: not checked.', patch: 'shield.bundlers' }),
  'shield.snipers': shield('Sniper holdings', 'Two lines for what launch snipers hold: over the first it counts against the coin, at the second the coin is skipped. Off by default.', { off: 'Off: not checked.', patch: 'shield.snipers' }),
  minLpBurnPct: shield('Burned liquidity', 'Skips a coin whose pool has less than this share of its liquidity burned. Unburned liquidity can be pulled.', { up: 'Higher: stricter.', down: 'Lower: looser.', off: 'Off: not checked.', patch: 'minLpBurnPct' }),
  'shield.crew': shield('Rug crew', `Experimental, off by default. Skips a coin under ${CREW_MINUTES} minutes old whose first buyers keep showing up in coins that rug, at this rate or more. A coin without the rate passes.`, { up: 'Higher: flags fewer coins.', down: 'Lower: flags more.', off: 'Off: not checked.', patch: 'shield.crew' }),
  creatorControls: shield('Creator controls', 'Always on: mint and freeze authority must be revoked before research, so the creator cannot print coins or freeze wallets.'),
  knownRugger: shield('Known rugger', 'Always on: skips coins from a deployer who drained a pool before. The list is shared by every team.'),
  meteoraLaunch: shield('Meteora launch', 'Always on: skips coins launched on Meteora’s curve.'),
  drainedPool: shield('Drained pool', 'Always on: a held coin whose pool drains sells at once, and its deployer goes on the rugger list.'),

  // ---- Sniper ----
  dipPct: { name: 'Buys', tab: 'sniper', about: 'When SniperBot buys a passed coin: right away, or once the price dips this far under the price research passed it at.', up: 'Bigger dip: better entries, more coins run off without a buy.', down: 'Right away: every passed coin is bought.', patch: 'dipPct' },
  entryActivity: { name: 'Active trading', tab: 'sniper', about: `Off by default; on: ${ENTRY_ACTIVITY_DESCRIPTION}. Quiet coins can return when trading picks up, without reserving funds.`, up: 'Avoids isolated swaps and quiet coins; can miss fast first bursts. Activity does not establish profit or rug safety.', off: 'Off: no recent-activity requirement at discovery or entry.', noReplay: true, patch: 'entryActivity' },
  entryDelayMinutes: { name: 'Watch before buying', tab: 'sniper', about: 'SniperBot watches a passed coin this long, then buys at market if research’s recheck still passes.', up: 'Longer: skips coins that fade fast, enters later on runners.', off: 'Off: no wait.', patch: 'entryDelayMinutes' },
  entryMaxUpPct: { name: 'Skip if it ran up', tab: 'sniper', about: 'Lets a waiting coin go if it ran this far past the price research passed it at, so the strategy does not chase.', up: 'Higher: chases further.', down: 'Lower: lets more coins go.', off: 'Off: no run-up limit.', patch: 'entryMaxUpPct' },
  askFirst: { name: 'Ask before each buy', tab: 'sniper', easy: true, about: 'Each buy waits for your Approve or Skip under Needs you. Entries expire after 2 hours.', off: 'Off: SniperBot buys on its own.', noReplay: true, patch: 'askFirst' },
  rebuy: { name: 'Re-buys', tab: 'sniper', about: 'After a sale, SniperBot watches the coin and buys it again when it steadies with a confirmation. A coin this strategy traded only ever comes back this way.', off: 'Off: a traded coin never comes back.', noReplay: true },
  'rebuy.steadyCloses': { name: 'Steady closes', tab: 'sniper', about: '1-minute closes in a row, each at least 99% of the one before, before a re-buy. 2 with a confirmation, 3 without, on the weighted choice.', noReplay: true },
  'rebuy.confirmation': { name: 'Confirmation', tab: 'sniper', about: 'What must hold on top of the steady closes: a volume uptick, a positive volume uptick, buys overtaking sells, or volume and buys.', noReplay: true },
  'rebuy.chasePct': { name: 'Don’t chase', tab: 'sniper', about: 'Re-buys only within this much of the low since the sale.', noReplay: true },
  'rebuy.watchMinutes': { name: 'Watch after each sale', tab: 'sniper', about: 'How long after a sale the coin stays watched for a re-buy.', noReplay: true },
  'rebuy.afterLoss': { name: 'After a losing re-buy', tab: 'sniper', about: 'Stop: no more re-buys of that coin after one loses. Keep watching: it can be re-bought again.', noReplay: true },
  'rebuy.maxPerCoin': { name: 'Max re-buys per coin', tab: 'sniper', about: 'The most times one coin is re-bought.', noReplay: true },

  // ---- Trader ----
  trail: { name: 'Trailing stop', tab: 'trader', easy: true, about: `Sells everything once the price falls this far under its highest price since the buy. It rises with the price and never moves down. ${TRAIL.min}–${TRAIL.max}%.`, up: 'Wider: holds through deeper pullbacks, gives back more at the end.', down: 'Tighter: locks gains sooner, gets shaken out of runners.', off: 'Off: only the plan, a stop loss and TraderBot sell.', patch: 'stopLossPct' },
  exitPlan: { name: 'Exit plan', tab: 'trader', easy: true, about: 'The take-profits and timed stops that sell above the trailing stop. Code runs it on every price; TraderBot may sell earlier, never later. Picking a plan keeps your trailing stop. Plans: Clip, Stake back, Quick flip, Ladder, Trailing take-profit, Trailing stop only, Scale out, Quick scalp, Take 30%, Stall exit, Step lock, Tightening trail, Doubling ladder, or your own saved ones.', patch: 'exitPlan' },
  takeProfit: { name: 'Take profit', tab: 'trader', about: 'Sells a share of the original bag at a gain, at once or on a pullback after the gain. The rest stays held.', patch: 'takeProfits' },
  stopLoss: { name: 'Stop loss', tab: 'trader', easy: true, about: 'Sells everything once the price falls this far under the buy price. Separate from the trailing stop, which follows the high.', up: 'Wider: more room, bigger losses when wrong.', down: 'Tighter: smaller losses, more early exits.', off: 'Off: no stop under the buy.' },
  armedTrail: { name: 'Trail once up', tab: 'trader', about: 'A second trailing stop that starts only after the coin reaches a gain, to protect a winner.' },
  tighten: { name: 'Tighten over time', tab: 'trader', about: 'A trailing stop that moves closer under the high after a set time.' },
  timeStop: { name: 'Sell if not up after', tab: 'trader', about: 'Sells at the buy price (or a set loss) if the coin is not up after this many minutes, so dead coins do not tie up a slot.' },
  scaleOut: { name: 'Scale out', tab: 'trader', about: 'Sells a share of the bag at a first gain and again at every further step.' },
  lockSteps: { name: 'Lock in steps', tab: 'trader', about: 'Each step the coin climbs locks in the step below as a floor.' },
  stall: { name: 'Sell on a stall', tab: 'trader', about: 'Once up a set gain, sells if the coin makes no new high for this long.' },
  addStep: { name: 'Add a step', tab: 'trader', about: 'Adds a take-profit, a stop or another step to the exit plan.' },
  savePlan: { name: 'Save as your plan', tab: 'trader', about: 'Saves this plan under your name to pick in any strategy. You keep up to 12.' },
  inactivity: { name: 'Inactivity exit', tab: 'trader', about: `Sells the rest when price, trades and volume all stay quiet for the whole period. Missing data never counts as quiet. Starts at ${INACTIVITY_DEFAULT.minutes} minutes, ${INACTIVITY_DEFAULT.priceRangePct}% price range, ${INACTIVITY_DEFAULT.maxTrades5m} trades and ${INACTIVITY_DEFAULT.maxVolumeCapPct5m}% of cap in volume per 5 minutes.`, off: 'Off: a quiet coin stays held until another exit fires.', noReplay: true },
  'inactivity.minutes': { name: 'Quiet for', tab: 'trader', about: 'How long the coin must stay quiet. A restart or a data gap starts the count again.', noReplay: true },
  'inactivity.priceRangePct': { name: 'Price range at most', tab: 'trader', about: 'Highest versus lowest price over the quiet period.', noReplay: true },
  'inactivity.maxTrades5m': { name: 'Trades at most', tab: 'trader', about: 'Trades in each 5-minute reading.', noReplay: true },
  'inactivity.maxVolumeCapPct5m': { name: 'Volume at most', tab: 'trader', about: '5-minute volume as a share of market cap.', noReplay: true },
  sellModelPct: { name: 'Sell-or-keep model', tab: 'trader', about: `Scores each coin held 2 minutes or more on its 1-minute candles and sells the rest once its chance that selling beats keeping for the next hour reaches this percent. Missing candles never sell. ${SELL_MODEL.min}–${SELL_MODEL.max}%.`, up: 'Higher: sells only when sure, holds more.', down: 'Lower: sells earlier and more often.', off: 'Off: the plan and TraderBot decide.', noReplay: true, patch: 'sellModelPct' },
  codeOnly: { name: 'Code only', tab: 'trader', about: 'No AI on this strategy’s coins: no TraderBot reviews or second opinions. The exit plan, the trailing stop and the inactivity exit sell; plain limits settle asks.', off: 'Off: TraderBot’s reviews can sell before the plan.', noReplay: true, patch: 'codeOnly' },

  // ---- Budget ----
  budgetSol: { name: 'Budget', tab: 'budget', easy: true, about: 'All the SOL this strategy can have in coins at once. Running strategies share the portfolio’s SOL, so budgets that add up to more than you hold leave picks waiting.', up: 'Bigger: more coins or bigger buys.', down: 'Smaller: less at risk.', patch: 'budgetSol' },
  tradeSol: { name: 'Per coin', tab: 'budget', about: 'The most one buy spends. Each buy scales with how far the coin clears the pass mark, up to this.', up: 'Bigger: larger buys, fewer fit the budget.', down: 'Smaller: more coins fit.', patch: 'tradeSol' },
  maxPoolSharePct: { name: 'Pool share', tab: 'budget', about: `Each buy takes at most this share of the coin’s pool, so a buy does not move the price too far. ${POOL_SHARE.pct}% when unset, ${POOL_SHARE.min}–${POOL_SHARE.max}%.`, up: 'Higher: bigger buys in small pools, more price impact.', down: 'Lower: smaller buys in small pools.', patch: 'maxPoolSharePct' },
  maxOpen: { name: 'Coins at once', tab: 'budget', easy: true, about: `How many coins it holds at the same time. More picks wait in a queue (best score first, at most ${QUEUE.max}) for room. The budget must fit this many at full size.`, up: 'More: spreads the budget, more coins.', down: 'Fewer: concentrates on the best picks.', patch: 'maxOpen' },
} satisfies Record<string, GuideEntry>;
export type SettingId = keyof typeof SETTINGS_GUIDE;
const GUIDE: Record<string, GuideEntry> = SETTINGS_GUIDE;
export const isSettingId = (id: unknown): id is SettingId => typeof id === 'string' && Object.hasOwn(GUIDE, id);

const TAB_NAMES: Record<GuideTab, string> = { search: 'Search', shield: 'Shield', sniper: 'Sniper', trader: 'Trader', budget: 'Budget' };
/** Where a row is, as people read it: "Easy and Advanced → Budget". */
export const whereOf = (entry: GuideEntry) => [entry.easy ? 'Easy' : '', entry.tab ? `Advanced → ${TAB_NAMES[entry.tab]}` : ''].filter(Boolean).join(' and ');
/** Every row by id and name, grouped by where it is: what chat sends so the model can read or point at any row. */
export function settingsIndex(): Record<string, Record<string, string>> {
  const index: Record<string, Record<string, string>> = {};
  for (const [id, entry] of Object.entries(GUIDE)) (index[entry.tab ? TAB_NAMES[entry.tab] : 'Easy'] ??= {})[id] = entry.name;
  return index;
}
/** The entries for these ids, each with where it is; unknown ids are left out. */
export const guideOf = (ids: readonly unknown[]) => [...new Set(ids)].filter(isSettingId).map(id => ({ id, where: whereOf(GUIDE[id]), ...GUIDE[id] }));

/** The rows a patch changes, for pointing at them when a change lands in the draft. */
export function settingsOfPatch(patch: StrategyPatch): SettingId[] {
  const ids = new Set<string>();
  for (const key of Object.keys(patch) as (keyof StrategyPatch)[]) {
    if (key === 'shield') for (const part of Object.keys(patch.shield ?? {})) ids.add('shield.' + part);
    else if (key === 'stopLossPct') ids.add('trail');
    else if (key === 'exits' || key === 'exitPlan') ids.add('exitPlan');
    else if (key === 'takeProfits') ids.add('takeProfit');
    else if (key === 'sweetMove1hLowPct' || key === 'sweetMove1hHighPct') ids.add('maxMove1hPct');
    else if (key === 'mustHave') ids.add('mustHave');
    else ids.add(key);
  }
  return [...ids].filter(isSettingId);
}
