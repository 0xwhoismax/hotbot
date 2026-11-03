/** HOTBOT's access pass. A team finds and buys coins, in Practice and in Real SOL, only while its person's pass is paid and the tier's $HOTBOT
 *  stake sits in their HOTBOT wallet, locked there while the pass runs. The fee goes to HOTBOT's fee account in SOL or USDC: from the
 *  person's own wallet in the transaction that puts the stake in, or from the HOTBOT wallet the person sent SOL to (Send it yourself). A
 *  pass that an outside wallet paid before the stake moved in counts that wallet's $HOTBOT until it ends.
 *  Held coins keep their exits either way. An admin's team always runs, and a free period (`freeUntil`) needs neither fee nor stake. The
 *  same code runs in the browser and in Convex. */
import { HOTBOT_MINT } from './hotbot';
import { PLATFORM_FEE_BPS } from './swapCosts';

export const ACCESS_TIERS: Readonly<Record<'base' | 'test', { name: string; usd?: number; sol?: number; hotbot: number; days: number }>> = {
  base: { name: 'HOTBOT', usd: 20, hotbot: 50_000, days: 30 },
  test: { name: 'Test', sol: 0.01, hotbot: 1, days: 30 },
};
export type AccessTier = keyof typeof ACCESS_TIERS;
export const DEFAULT_TIER: AccessTier = 'base';
export const DAY_MS = 24 * 60 * 60_000;
/** Days before a pass ends from which the app asks the person to renew it. */
export const RENEW_DAYS = 3;

/** The fee's currencies, paid from the HOTBOT wallet. */
export const PAY_CURRENCIES = ['SOL', 'USDC'] as const;
export type PayCurrency = typeof PAY_CURRENCIES[number];
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6, HOTBOT_DECIMALS = 6;
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
/** $HOTBOT is a Token-2022 mint with no transfer fee or hook: a transfer delivers the whole amount. */
export const HOTBOT_TOKEN_PROGRAM = TOKEN_2022_PROGRAM;
export { HOTBOT_MINT };
/** The program and decimals of each token a withdrawal from the HOTBOT wallet moves: the stake's $HOTBOT and the fee's USDC. */
export const TOKENS: Readonly<Record<string, { program: string; decimals: number }>> = {
  [HOTBOT_MINT]: { program: HOTBOT_TOKEN_PROGRAM, decimals: HOTBOT_DECIMALS }, [USDC_MINT]: { program: TOKEN_PROGRAM, decimals: USDC_DECIMALS } };

/** What a workspace stores of its pass: paid through `paidUntil`, free through `freeUntil`, the tier of its latest payment. `wallet`: the
 *  outside wallet that paid the running pass before the stake moved into the HOTBOT wallet, with its $HOTBOT (`held`, whole tokens) as
 *  read at `heldAt`; it counts as the stake until that pass ends. */
export type AccessFields = { paidUntil?: number; freeUntil?: number; tier?: AccessTier; wallet?: string; held?: number; heldAt?: number };
/** Why a team runs or is locked: `stake` is a paid pass whose stake is short of its tier's. */
export type AccessWhy = 'admin' | 'free' | 'paid' | 'unpaid' | 'lapsed' | 'stake';
/** `hotbot`: the stake held now; `outside`: the outside wallet that still counts for it; `locked`: the $HOTBOT the pass holds in the HOTBOT
 *  wallet, which a withdrawal leaves there. */
export type Access = { open: boolean; why: AccessWhy; until: number | null; tier: AccessTier; stake: number; hotbot: number; short: number; paidUntil: number | null;
  freeUntil: number | null; outside: string | null; locked: number };

/** The pass as it stands at `now`, from the workspace's fields and the HOTBOT wallet's $HOTBOT as last read (`vault`, whole tokens). While an
 *  outside wallet counts, the stake is whichever of the two holds more, and the HOTBOT wallet's $HOTBOT is not locked. */
export function accessOf(fields: AccessFields | undefined, vault: number, admin: boolean, now: number): Access {
  const tier = fields?.tier ?? DEFAULT_TIER, stake = ACCESS_TIERS[tier].hotbot, outside = fields?.wallet ?? null;
  const hotbot = outside ? Math.max(vault, fields?.held ?? 0) : vault, short = Math.max(0, stake - hotbot);
  const paidUntil = fields?.paidUntil ?? null, freeUntil = fields?.freeUntil ?? null, paid = paidUntil !== null && paidUntil > now;
  const base = { tier, stake, hotbot, short, paidUntil, freeUntil, outside, locked: paid && !outside ? Math.min(stake, vault) : 0 };
  if (admin) return { ...base, open: true, why: 'admin', until: null };
  if (freeUntil !== null && freeUntil > now) return { ...base, open: true, why: 'free', until: freeUntil };
  if (paid && short === 0) return { ...base, open: true, why: 'paid', until: paidUntil };
  return { ...base, open: false, why: paid ? 'stake' : paidUntil !== null ? 'lapsed' : 'unpaid', until: paid ? paidUntil : null };
}
export const DEPOSIT_RESERVE_LAMPORTS = 10_000_000;
/** What a wallet's activation takes when the person sends the stake in $HOTBOT and nothing is bought: the fee float, which stays theirs,
 *  and the network fees of the activation and of the fee. */
export const DEPOSIT_SETUP_LAMPORTS = 3_500_000;
/** The SOL Send it yourself asks for, in lamports, rounded up to 0.001 SOL: the fee, then the stake's price (`stakeCost`) with the platform
 *  fee, 2% for the price to move and the reserve; or, with the stake sent in $HOTBOT (`stakeCost` null), the activation alone. */
export function depositLamports(fee: number, stakeCost: bigint | null) {
  const total = BigInt(fee) + (stakeCost === null ? BigInt(DEPOSIT_SETUP_LAMPORTS)
    : stakeCost * BigInt(10_000 + PLATFORM_FEE_BPS) * 102n / 1_000_000n + BigInt(DEPOSIT_RESERVE_LAMPORTS));
  return (total + 999_999n) / 1_000_000n * 1_000_000n;
}
/** The tier's fee as the app names it: "$20", or "0.01 SOL". */
export function feeText(tier: AccessTier) {
  const { usd, sol } = ACCESS_TIERS[tier];
  return usd !== undefined ? `$${usd}` : `${sol} SOL`;
}
const SHOWN_DECIMALS: Record<PayCurrency, number> = { SOL: 4, USDC: 2 };
export const rawToUi = (currency: PayCurrency, raw: number) => raw / (currency === 'SOL' ? 1e9 : 10 ** USDC_DECIMALS);
export const amountText = (currency: PayCurrency, raw: number) => rawToUi(currency, raw).toFixed(SHOWN_DECIMALS[currency]);
