/** ShieldBot's thresholds in production are private. Every `PRIVATE` value here is a placeholder; the backend holds the real one. */
const PRIVATE = 0;

/** A coin whose pro traders hold under this share (%) of its supply fails: those trades lost most.
 *  A measured 0% counts, a missing share passes. */
export const PRO_HOLDINGS_FLOOR = PRIVATE;
export const LAUNCH_JUMP_LIMIT = PRIVATE;
export const LAYERED_WALLETS = PRIVATE, LAYERED_MINUTES = PRIVATE;
export const SMOOTH_RISE_PCT = PRIVATE, SMOOTH_STEP_VOL = PRIVATE, SMOOTH_OFF_HIGH_PCT = PRIVATE;
export const TOP10_REFUSE_PCT = PRIVATE, BUNDLERS_BOUGHT_REFUSE_PCT = PRIVATE;
/** A coin younger than this many days whose pool its creator made straight on an AMM, not through a launchpad, fails for good:
 *  whoever holds that pool's LP can take it back. Older coins made that way (BONK, WIF) predate launchpads. */
export const SELF_MADE_DAYS = PRIVATE;
export const CREW_MINUTES = PRIVATE;

/** A holder group's share of supply: weighed against the coin over `weighAbove` (% of supply), refused at `refuseAt`; 0 leaves either out. */
export type Holding = { weighAbove: number; refuseAt: number };
export type ShieldRules = {
  proHolders: number;
  /** Also turns off the check that a young coin's launch was read: with no jump check, the launch needn't be known. */
  launchJump: number;
  layered: boolean;
  mayhem: boolean;
  /** A climb too smooth to be real trading (`SMOOTH_RISE_PCT`), read from the 1-second bars of a coin under 2 hours old. */
  smoothClimb: boolean;
  transferFee: boolean;
  selfMadeDays: number;
  /** Volume or market cap nobody paid fees for (`tradingReality`). */
  washTrading: boolean;
  /** Refuses a coin whose top 10 wallets hold this share of supply or more (%, 0 off); a coin without a top-10 read passes. */
  top10: number;
  /** Refuses a coin whose bundlers bought this share of supply or more (%, 0 off), where the indexer saw the launch. */
  bundlersBought: number;
  crew: number;
  dev: Holding; bundlers: Holding; snipers: Holding;
};
export const SHIELD_DEFAULTS: ShieldRules = {
  proHolders: PRO_HOLDINGS_FLOOR, launchJump: LAUNCH_JUMP_LIMIT, layered: true, mayhem: false, smoothClimb: true, transferFee: true, selfMadeDays: SELF_MADE_DAYS, washTrading: true,
  top10: TOP10_REFUSE_PCT, bundlersBought: BUNDLERS_BOUGHT_REFUSE_PCT, crew: 0,
  dev: { weighAbove: PRIVATE, refuseAt: PRIVATE }, bundlers: { weighAbove: PRIVATE, refuseAt: PRIVATE }, snipers: { weighAbove: PRIVATE, refuseAt: PRIVATE },
};
export const shieldOf = (rules: { shield?: Partial<ShieldRules> }): ShieldRules => ({ ...SHIELD_DEFAULTS, ...rules.shield });
/** A shield as a strategy stores it: only what differs from the defaults, or undefined when nothing does. */
export function storedShield(shield: ShieldRules): Partial<ShieldRules> | undefined {
  const own = Object.fromEntries((Object.keys(SHIELD_DEFAULTS) as (keyof ShieldRules)[])
    .filter(key => JSON.stringify(shield[key]) !== JSON.stringify(SHIELD_DEFAULTS[key])).map(key => [key, shield[key]]));
  return Object.keys(own).length ? own as Partial<ShieldRules> : undefined;
}
/** Whether a holding check does anything. */
export const holdingOn = (holding: Holding) => holding.weighAbove > 0 || holding.refuseAt > 0;
/** Whether a measured pro-trader share of supply keeps the coin out under this floor (0 off). */
export const fewPros = (percent: number | undefined, floor: number) => floor > 0 && percent !== undefined && percent < floor;

type KeysOf<T> = { [K in keyof ShieldRules]: ShieldRules[K] extends T ? K : never }[keyof ShieldRules];
/** How Settings → ShieldBot shows each rule: a switch, a number with its words and steps (`kind` as the number fields show it), or a holder
 *  group's two shares. One entry per field, in the order the tab shows them; tsc fails until a new field has one. */
export type ShieldRow =
  | { kind: 'switch'; name: string; on: string; off: string }
  | { kind: 'number'; name: string; before: string; after: string; unit: 'count' | 'pct' | 'x'; steps: number[]; min: number; max: number; integer?: true }
  | { kind: 'holding'; name: string; who: string };
export const SHIELD_ROWS: { [K in keyof ShieldRules]: ShieldRules[K] extends boolean ? Extract<ShieldRow, { kind: 'switch' }> : ShieldRules[K] extends Holding ? Extract<ShieldRow, { kind: 'holding' }> : Extract<ShieldRow, { kind: 'number' }> } = {
  proHolders: { kind: 'number', name: 'Pro holders', before: 'Skips coins whose pro traders hold under ', after: '% of supply', unit: 'pct', steps: [0.5, 1, 2, 5], min: 0.1, max: 50 },
  launchJump: { kind: 'number', name: 'Launch jump', before: 'Skips a launch that rose ', after: '× in its first 10 seconds', unit: 'x', steps: [2, 3, 4, 6, 8], min: 1.1, max: 100 },
  layered: { kind: 'switch', name: 'Layered launch', on: `Skips a launch whose dev or launch buyers passed the coin to ${LAYERED_WALLETS}+ wallets in its first ${LAYERED_MINUTES} minutes`, off: 'Off: a layered launch is allowed' },
  mayhem: { kind: 'switch', name: 'Mayhem mode', on: 'Skips pump.fun Mayhem-mode launches, where an AI agent trades 1B extra tokens', off: 'Off: Mayhem-mode launches are allowed' },
  smoothClimb: { kind: 'switch', name: 'Smooth climb', on: `Skips a coin up ${SMOOTH_RISE_PCT}%+ in 30 minutes in a near-straight line with no pullback`, off: 'Off: a smooth climb is allowed' },
  transferFee: { kind: 'switch', name: 'Transfer fee', on: 'Skips coins that take a fee from every transfer, 1–5% on most LaunchLab coins', off: 'Off: transfer-fee coins are traded, and each buy and sale pays the fee' },
  selfMadeDays: { kind: 'number', name: 'Self-made pool', before: 'Skips a pool its creator made, under ', after: ' days old', unit: 'count', steps: [7, 30, 90], min: 1, max: 3650, integer: true },
  washTrading: { kind: 'switch', name: 'Wash trading', on: 'Skips volume and market cap nobody paid fees for', off: 'Off: volume counts even when no fees were paid' },
  top10: { kind: 'number', name: 'Top 10 holdings', before: 'Skips a coin under 2 hours old whose top 10 wallets hold ', after: '% of supply or more', unit: 'pct', steps: [25, 30, 40, 50], min: 5, max: 100 },
  bundlersBought: { kind: 'number', name: 'Bundler buys', before: 'Skips a coin whose bundlers bought ', after: '% of supply or more', unit: 'pct', steps: [20, 30, 40, 60], min: 5, max: 100 },
  crew: { kind: 'number', name: 'Rug crew · experimental', before: `Skips a coin under ${CREW_MINUTES} minutes old whose first buyers' earlier coins rugged `, after: ' of the time or more', unit: 'pct', steps: [50, 60, 70], min: 30, max: 100 },
  dev: { kind: 'holding', name: 'Dev holdings', who: 'the dev' },
  bundlers: { kind: 'holding', name: 'Bundler holdings', who: 'bundlers' },
  snipers: { kind: 'holding', name: 'Sniper holdings', who: 'snipers' },
};
export type ShieldSwitch = KeysOf<boolean>;
export type ShieldNumber = KeysOf<number>;
export type ShieldHolding = KeysOf<Holding>;
