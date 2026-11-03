/** Production values are private. Every `PRIVATE` value here is a placeholder; the backend holds the real one. */
const PRIVATE = 0;
/** ShieldBot's checks, set per strategy in Settings → ShieldBot. A strategy stores only what it changed (`TeamRules.shield`). A number turns
 *  its check off at 0, a switch at false; a row with `parents` is a parameter of those checks and is never off. The checks themselves are in
 *  types/hotbotResearch.ts. */

export const PRO_HOLDINGS_FLOOR_PCT = PRIVATE;
export const LAUNCH_JUMP_LIMIT_X = PRIVATE;
export const LAUNCH_READ_MINUTES = PRIVATE;
/** By default the launch jump judges coins under this age. */
export const LAUNCH_JUMP_MINUTES = PRIVATE;
/** By default a launch that rose this much is skipped while the coin is under `EXTREME_JUMP_MINUTES`. */
export const EXTREME_JUMP_X = PRIVATE, EXTREME_JUMP_MINUTES = PRIVATE;
/** The age under which a coin is young: research reads its 1-second bars for the smooth-climb check, and the top-10 check judges only a
 *  young coin. */
export const YOUNG_MINUTES = PRIVATE;
const young = `${YOUNG_MINUTES / 60} hours`;
export const LAYERED_WALLETS = PRIVATE, LAYERED_MINUTES = PRIVATE;
/** 10-second log price steps at or under SMOOTH_STEP_VOL, over the last 30 minutes. */
export const SMOOTH_RISE_PCT = PRIVATE, SMOOTH_STEP_VOL = PRIVATE, SMOOTH_OFF_HIGH_PCT = PRIVATE;
export const TOP10_REFUSE_PCT = PRIVATE, BUNDLERS_BOUGHT_REFUSE_PCT = PRIVATE;
export const SELF_MADE_DAYS = PRIVATE;
export const JOINT_SELLERS = PRIVATE, JOINT_MARK_MINUTES = PRIVATE, CREW_MINUTES = PRIVATE, CREW_LINE = PRIVATE;
export const EARLY_MAX = 30;
/** By default the first-buyer checks (First buyers, Same-size buyers) judge coins under this age. */
export const EARLY_JUDGED_MINUTES = PRIVATE;
export const DUMP_SOL_STEPS = [0.25, 0.5, 1, 2, 5, 10], DUMP_PCT_STEPS = [1, 3, 5, 10, 25, 50];
/** The launch's wallet groups whose bags the insider sale counts. */
export const INSIDER_GROUPS = ['dev', 'bundlers', 'snipers'] as const;
export type InsiderGroup = typeof INSIDER_GROUPS[number];
export const INSIDER_NAMES: Record<InsiderGroup, string> = { dev: 'Dev', bundlers: 'Bundlers', snipers: 'Snipers' };
/** A coin's launchpad as the indexer names it: its row's `source`, the evidence's `launchpad`. */
export const LAUNCHPAD_IDS = ['pumpfun', 'mayhem', 'raydium-launchlab'] as const;
export type Launchpad = typeof LAUNCHPAD_IDS[number];
export const LAUNCHPAD_NAMES: Record<Launchpad, string> = { pumpfun: 'pump.fun', mayhem: 'Mayhem', 'raydium-launchlab': 'LaunchLab' };
export const TRADED_LAUNCHPADS: readonly Launchpad[] = ['pumpfun', 'mayhem'];

/** Shares of supply in %: the group counts against the coin over `weighAbove` and refuses it at `refuseAt`. */
export type Holding = { weighAbove: number; refuseAt: number };
export type ShieldRules = {
  proHolders: number;
  /** 0, with `extremeJump` 0 too, also turns off the check that a coin's launch was read. */
  launchJump: number;
  /** The age in minutes under which `launchJump` judges a coin; 0 any age. */
  launchJumpMinutes: number;
  /** A launch that rose this much or more is skipped, whether `launchJump` is on or off; 0 off. */
  extremeJump: number;
  /** The age in minutes under which `extremeJump` judges a coin; 0 forever. */
  extremeJumpMinutes: number;
  layered: boolean;
  /** The launchpads the strategy trades, from `TRADED_LAUNCHPADS` in its order, at least one. */
  launchpads: Launchpad[];
  smoothClimb: boolean;
  transferFee: boolean;
  selfMadeDays: number;
  washTrading: boolean;
  top10: number;
  bundlersBought: number;
  /** The age in minutes under which `bundlersBought` judges a coin; 0 any age. */
  bundlersBoughtMinutes: number;
  crew: number;
  serialCreator: number;
  serialGraduatedPct: number;
  dumper: number;
  dumperTakeSol: number;
  dumperTakePct: number;
  insiderProfit: number;
  dumpDepth: number;
  /** The groups `insiderProfit` and `dumpDepth` count, in `INSIDER_GROUPS` order, at least one. Not `insiders`: older strategies may still
   *  store a dropped holder rule under that name. */
  saleGroups: InsiderGroup[];
  dev: Holding; bundlers: Holding; snipers: Holding; linked: Holding;
  early: Holding;
  earlyBuyers: number;
  /** The age in minutes under which `early` judges a coin; 0 any age. */
  earlyMinutes: number;
  sameSize: Holding;
  sameSizeBuyers: number;
  sameSizeTolerancePct: number;
  sameSizeMin: number;
  sameSizeApps: boolean;
  /** The age in minutes under which `sameSize` judges a coin; 0 any age. */
  sameSizeMinutes: number;
};
export const SHIELD_DEFAULTS: ShieldRules = {
  proHolders: PRO_HOLDINGS_FLOOR_PCT, launchJump: LAUNCH_JUMP_LIMIT_X, launchJumpMinutes: LAUNCH_JUMP_MINUTES, extremeJump: EXTREME_JUMP_X, extremeJumpMinutes: EXTREME_JUMP_MINUTES, layered: true, launchpads: ['pumpfun'], smoothClimb: true, transferFee: true, selfMadeDays: SELF_MADE_DAYS, washTrading: true,
  top10: TOP10_REFUSE_PCT, bundlersBought: BUNDLERS_BOUGHT_REFUSE_PCT, bundlersBoughtMinutes: PRIVATE, crew: PRIVATE,
  serialCreator: PRIVATE, serialGraduatedPct: PRIVATE, dumper: PRIVATE, dumperTakeSol: PRIVATE, dumperTakePct: PRIVATE, insiderProfit: PRIVATE, dumpDepth: PRIVATE, saleGroups: [...INSIDER_GROUPS],
  dev: { weighAbove: PRIVATE, refuseAt: PRIVATE }, bundlers: { weighAbove: PRIVATE, refuseAt: PRIVATE }, snipers: { weighAbove: PRIVATE, refuseAt: PRIVATE }, linked: { weighAbove: PRIVATE, refuseAt: PRIVATE },
  early: { weighAbove: PRIVATE, refuseAt: PRIVATE }, earlyBuyers: PRIVATE, earlyMinutes: EARLY_JUDGED_MINUTES,
  sameSize: { weighAbove: PRIVATE, refuseAt: PRIVATE }, sameSizeBuyers: PRIVATE, sameSizeTolerancePct: PRIVATE, sameSizeMin: PRIVATE, sameSizeApps: false, sameSizeMinutes: EARLY_JUDGED_MINUTES,
};
/** A strategy's ShieldBot rules, built once per stored `shield` object: research and the screen read them for every rule of every row. Never
 *  changed by a reader; a new shield is a new object. */
const shields = new WeakMap<Partial<ShieldRules>, ShieldRules>();
let bare: ShieldRules | undefined;
export const shieldOf = (rules: { shield?: Partial<ShieldRules> }): ShieldRules => {
  const own = rules.shield;
  if (!own) return bare ??= { ...SHIELD_DEFAULTS };
  let shield = shields.get(own);
  if (!shield) shields.set(own, shield = { ...SHIELD_DEFAULTS, ...own });
  return shield;
};
export function storedShield(shield: ShieldRules): Partial<ShieldRules> | undefined {
  const own = Object.fromEntries((Object.keys(SHIELD_DEFAULTS) as (keyof ShieldRules)[])
    .filter(key => JSON.stringify(shield[key]) !== JSON.stringify(SHIELD_DEFAULTS[key])).map(key => [key, shield[key]]));
  return Object.keys(own).length ? own as Partial<ShieldRules> : undefined;
}
export const holdingOn = (holding: Holding) => holding.weighAbove > 0 || holding.refuseAt > 0;

type KeysOf<T> = { [K in keyof ShieldRules]: ShieldRules[K] extends T ? K : never }[keyof ShieldRules];
/** How Settings → ShieldBot shows each rule. tsc fails until a new field has a row. `parents`: the checks this parameter belongs to; it shows
 *  under them while one of them is on. `only`: the value is one of `steps`. `zero`: a parameter that may be 0, and its word for 0. `leave`:
 *  advised to stay at its default, so Settings marks it with a warning. `days`: an age in minutes that people edit in hours and days. */
type Parents = { parents?: readonly (keyof ShieldRules)[] };
export type ShieldRow =
  | { kind: 'switch'; name: string; on: string; off: string } & Parents
  | { kind: 'launchpads'; name: string }
  | { kind: 'insiders'; name: string } & Parents
  | { kind: 'number'; name: string; before: string; after: string; unit: 'count' | 'pct' | 'x' | 'sol' | 'min'; steps: number[]; min: number; max: number; integer?: true; only?: true; zero?: string; leave?: true; days?: true } & Parents
  | { kind: 'holding'; name: string; who: string };
/** The age limits a strategy picks with one click, in minutes. */
const AGE_STEPS = [120, 240, 360, 720, 1440];
/** The first-buyer checks' age limits, in minutes. */
const EARLY_AGE_STEPS = [360, 1440, 4320, EARLY_JUDGED_MINUTES];
export const SHIELD_ROWS: { [K in keyof ShieldRules]: ShieldRules[K] extends boolean ? Extract<ShieldRow, { kind: 'switch' }> : ShieldRules[K] extends Holding ? Extract<ShieldRow, { kind: 'holding' }>
  : ShieldRules[K] extends Launchpad[] ? Extract<ShieldRow, { kind: 'launchpads' }> : ShieldRules[K] extends InsiderGroup[] ? Extract<ShieldRow, { kind: 'insiders' }> : Extract<ShieldRow, { kind: 'number' }> } = {
  proHolders: { kind: 'number', name: 'Pro holders', before: 'Skips coins whose pro traders hold under ', after: '% of supply', unit: 'pct', steps: [0.5, 1, 2, 5], min: 0.1, max: 50 },
  launchJump: { kind: 'number', name: 'Launch jump', before: 'Skips a launch that rose ', after: '× in its first 10 seconds', unit: 'x', steps: [2, 3, 4, 6, 8], min: 1.1, max: 100 },
  launchJumpMinutes: { kind: 'number', name: 'Jump checked under', before: 'Judges coins under ', after: ' old', unit: 'min', steps: AGE_STEPS, min: 10, max: 10_080, integer: true, zero: 'Any age', parents: ['launchJump'] },
  extremeJump: { kind: 'number', name: 'Extreme launch jump', before: 'Skips a coin whose launch rose ', after: '× or more in its first 10 seconds', unit: 'x', steps: [10, 20, 50], min: 1.1, max: 1_000, leave: true },
  extremeJumpMinutes: { kind: 'number', name: 'Extreme jump checked under', before: 'Judges coins under ', after: ' old', unit: 'min', steps: [1440, 4320, 10_080], min: 60, max: 43_200, integer: true, zero: 'Forever', parents: ['extremeJump'], leave: true },
  layered: { kind: 'switch', name: 'Layered launch', on: `Skips a launch whose dev or launch buyers passed the coin to ${LAYERED_WALLETS}+ wallets in its first ${LAYERED_MINUTES} minutes`, off: 'Off: a layered launch is allowed' },
  launchpads: { kind: 'launchpads', name: 'Launchpads' },
  smoothClimb: { kind: 'switch', name: 'Smooth climb', on: `Skips a coin up ${SMOOTH_RISE_PCT}%+ in 30 minutes in a near-straight line with no pullback`, off: 'Off: a smooth climb is allowed' },
  transferFee: { kind: 'switch', name: 'Transfer fee', on: 'Skips coins that take a fee from every transfer', off: 'Off: transfer-fee coins are traded, and each buy and sale pays the fee' },
  selfMadeDays: { kind: 'number', name: 'Self-made pool', before: 'Skips a pool its creator made, under ', after: ' days old', unit: 'count', steps: [7, 14, 30], min: 1, max: 3650, integer: true },
  washTrading: { kind: 'switch', name: 'Wash trading', on: 'Skips volume and market cap nobody paid fees for', off: 'Off: volume counts even when no fees were paid' },
  top10: { kind: 'number', name: 'Top 10 holdings', before: `Skips a coin under ${young} old whose top 10 wallets hold `, after: '% of supply or more', unit: 'pct', steps: [25, 30, 40, 50], min: 5, max: 100 },
  bundlersBought: { kind: 'number', name: 'Bundler buys', before: 'Skips a coin whose bundlers bought ', after: '% of supply or more', unit: 'pct', steps: [20, 30, 40, 60], min: 5, max: 100 },
  bundlersBoughtMinutes: { kind: 'number', name: 'Buys checked under', before: 'Judges coins under ', after: ' old', unit: 'min', steps: AGE_STEPS, min: 10, max: 10_080, integer: true, zero: 'Any age', parents: ['bundlersBought'] },
  crew: { kind: 'number', name: 'Rug crew · experimental', before: `Skips a coin under ${CREW_MINUTES} minutes old with `, after: ` or more buyers that sold in one ${JOINT_SELLERS}+ wallet transaction in the last ${JOINT_MARK_MINUTES} minutes`, unit: 'count', steps: [CREW_LINE, 3, 5, 10], min: 1, max: 25, integer: true },
  serialCreator: { kind: 'number', name: 'Serial creator', before: 'Skips a coin whose creator launched ', after: ' coins or more', unit: 'count', steps: [5, 10, 20, 50], min: 2, max: 10_000, integer: true },
  serialGraduatedPct: { kind: 'number', name: 'Graduated under', before: 'and graduated under ', after: '% of them', unit: 'pct', steps: [1, 2, 5, 10, 20], min: 0.1, max: 100, parents: ['serialCreator'] },
  dumper: { kind: 'number', name: 'Coin dumper', before: 'Skips a coin whose creator dumped ', after: ' or more earlier coins on their buyers', unit: 'count', steps: [1, 2, 3, 5], min: 1, max: 1_000, integer: true },
  dumperTakeSol: { kind: 'number', name: 'Dump take', before: 'A dump: the dev, bundlers and snipers took ', after: ' SOL or more', unit: 'sol', steps: DUMP_SOL_STEPS, min: DUMP_SOL_STEPS[0]!, max: DUMP_SOL_STEPS.at(-1)!, only: true, parents: ['dumper'] },
  dumperTakePct: { kind: 'number', name: 'Dump share', before: 'and ', after: '% or more of what the other buyers paid', unit: 'pct', steps: DUMP_PCT_STEPS, min: DUMP_PCT_STEPS[0]!, max: DUMP_PCT_STEPS.at(-1)!, only: true, parents: ['dumper'] },
  insiderProfit: { kind: 'number', name: 'Insider profit', before: 'Skips a coin whose insiders could sell now for ', after: '× what they paid or more', unit: 'x', steps: [5, 10, 25, 50], min: 1.1, max: 10_000 },
  dumpDepth: { kind: 'number', name: 'Dump depth', before: 'Skips a coin whose price would fall ', after: '% or more if its insiders sold everything', unit: 'pct', steps: [50, 75, 90, 95], min: 5, max: 99 },
  saleGroups: { kind: 'insiders', name: 'Insiders', parents: ['insiderProfit', 'dumpDepth'] },
  dev: { kind: 'holding', name: 'Dev holdings', who: 'the dev' },
  bundlers: { kind: 'holding', name: 'Bundler holdings', who: 'bundlers' },
  snipers: { kind: 'holding', name: 'Sniper holdings', who: 'snipers' },
  linked: { kind: 'holding', name: 'Linked wallets', who: 'the largest group of linked wallets' },
  early: { kind: 'holding', name: 'First buyers', who: 'the first buyers' },
  earlyBuyers: { kind: 'number', name: 'Buyers counted', before: 'Reads the first ', after: ' buyers after the dev', unit: 'count', steps: [5, 10, 20, EARLY_MAX], min: 1, max: EARLY_MAX, integer: true, parents: ['early'] },
  earlyMinutes: { kind: 'number', name: 'First buyers checked under', before: 'Judges coins under ', after: ' old', unit: 'min', steps: EARLY_AGE_STEPS, min: 60, max: 43_200, integer: true, zero: 'Any age', parents: ['early'], days: true },
  sameSize: { kind: 'holding', name: 'Same-size buyers', who: 'early buyers that bought the same amount' },
  sameSizeBuyers: { kind: 'number', name: 'Buyers counted', before: 'Reads the first ', after: ' buyers after the dev', unit: 'count', steps: [5, 10, 20, EARLY_MAX], min: 2, max: EARLY_MAX, integer: true, parents: ['sameSize'] },
  sameSizeTolerancePct: { kind: 'number', name: 'Same within', before: 'Counts first buys within ', after: '% of each other as the same size', unit: 'pct', steps: [0.1, 0.5, 1, 2, 5], min: 0.01, max: 20, parents: ['sameSize'] },
  sameSizeMin: { kind: 'number', name: 'Set of', before: 'Counts a set of ', after: ' or more such buyers', unit: 'count', steps: [2, 3, 4, 5, 8], min: 2, max: EARLY_MAX, integer: true, parents: ['sameSize'] },
  sameSizeApps: { kind: 'switch', name: 'App wallets', on: 'Wallets that trade through an app count too', off: 'Only wallets that trade through no app count', parents: ['sameSize'] },
  sameSizeMinutes: { kind: 'number', name: 'Same-size checked under', before: 'Judges coins under ', after: ' old', unit: 'min', steps: EARLY_AGE_STEPS, min: 60, max: 43_200, integer: true, zero: 'Any age', parents: ['sameSize'], days: true },
};
export type ShieldSwitch = KeysOf<boolean>;
export type ShieldNumber = KeysOf<number>;
export type ShieldHolding = KeysOf<Holding>;
/** A rule's value in words: the rule schema and the settings guide show a default with it. */
export function shieldValueText<K extends keyof ShieldRules>(key: K, value: ShieldRules[K]): string {
  const row: ShieldRow = SHIELD_ROWS[key];
  if (row.kind === 'switch') return value ? 'On' : 'Off';
  if (row.kind === 'launchpads') return (value as Launchpad[]).map(id => LAUNCHPAD_NAMES[id]).join(' · ');
  if (row.kind === 'insiders') return (value as InsiderGroup[]).map(id => INSIDER_NAMES[id]).join(' · ');
  if (row.kind === 'number') {
    const n = value as number;
    return !n ? row.zero ?? 'Off' : row.unit === 'min' ? (row.days && !(n % 1440) ? `${n / 1440} d` : n % 60 ? `${n} min` : `${n / 60} h`)
      : `${n}${row.unit === 'pct' ? '%' : row.unit === 'x' ? '×' : row.unit === 'sol' ? ' SOL' : row.after.includes('days') ? ' days' : ''}`;
  }
  const h = value as Holding;
  return holdingOn(h) ? [h.weighAbove ? `weighed over ${h.weighAbove}%` : '', h.refuseAt ? `refused at ${h.refuseAt}%` : ''].filter(Boolean).join(' · ') : 'Off';
}
/** In `TRADED_LAUNCHPADS` order, as a strategy stores it. */
export function pickedLaunchpads(value: unknown): Launchpad[] {
  if (!Array.isArray(value) || !value.length || value.some(id => !TRADED_LAUNCHPADS.includes(id))) throw new Error(`Pick at least one launchpad: ${TRADED_LAUNCHPADS.join(', ')}.`);
  return TRADED_LAUNCHPADS.filter(id => value.includes(id));
}
/** In `INSIDER_GROUPS` order, as a strategy stores it. */
export function pickedInsiders(value: unknown): InsiderGroup[] {
  if (!Array.isArray(value) || !value.length || value.some(id => !INSIDER_GROUPS.includes(id))) throw new Error(`Pick at least one insider group: ${INSIDER_GROUPS.join(', ')}.`);
  return INSIDER_GROUPS.filter(id => value.includes(id));
}
