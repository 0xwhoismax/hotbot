import { AccountRole, address, type Instruction } from '@solana/kit';
import { ConvexError } from 'convex/values';
import { HOTBOT_MINT, USDC_MINT, amountText, type PayCurrency } from '../../../types/access';
import { computeBudget, openTokenAccount, solTransfer, tokenAccount, tokenTransfer, type Holdings } from './solanaTx';

/** What one payment is for, as Convex quoted it: the fee and where it goes, the HOTBOT wallet (`vault`) and the tier's stake in whole tokens. */
export type PayQuote = { currency: PayCurrency; amount: number; recipient: string; reference: string; vault: string; stake: number };

const JUPITER = 'https://lite-api.jup.ag/swap/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
/** The swap's slippage, in basis points. */
const SLIPPAGE_BPS = 100;
/** The first amount quoted, which gives the rate: 0.1 SOL, or 10 USDC. */
const PROBE: Record<PayCurrency, bigint> = { SOL: 100_000_000n, USDC: 10_000_000n };
/** SOL for the transaction's network fee and the token accounts it may open, on top of what it sends. */
const NETWORK_LAMPORTS = 10_000_000n;
/** Compute units for a payment with a swap, and without one; and the price per unit, in micro-lamports. */
const UNITS = { swap: 600_000, plain: 100_000 }, UNIT_PRICE = 50_000n;

type JupiterInstruction = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
const fromJupiter = (ix: JupiterInstruction): Instruction => ({ programAddress: address(ix.programId), data: Uint8Array.from(atob(ix.data), char => char.charCodeAt(0)),
  accounts: ix.accounts.map(key => ({ address: address(key.pubkey),
    role: key.isSigner ? key.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER : key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY })) });
/** Jupiter's free API takes a handful of requests a minute from one address: a refused request waits for the window's reset once, when
 *  that is near. */
const RESET_WAIT_MS = 30_000;
async function jupiter<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const response = await fetch(`${JUPITER}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
  if (response.status === 429 && !retried && reset > 0 && reset <= RESET_WAIT_MS) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, reset + 250);
    await promise;
    return jupiter<T>(path, init, true);
  }
  const body = await response.json() as T & { error?: string };
  if (!response.ok || body.error) throw new ConvexError('Buying $HOTBOT isn’t possible right now. Try again in a moment.');
  return body;
}
type JupiterQuote = { inAmount: string; otherAmountThreshold: string };

/** How long the last quote's rate sizes the next one without a probe, and how long the last quote itself pays. */
const RATE_MS = 60_000, QUOTE_MS = 15_000;
const lastQuote = new Map<PayCurrency, { at: number; amount: bigint; found: JupiterQuote }>();

/** The SOL or USDC that buys at least `raw` $HOTBOT, as Jupiter quotes it now. $HOTBOT's pools take no exact output, so the input is sized
 *  from the last quote so that its slippage floor still leaves `raw`, with 1% to spare for the price moving between quotes; what is over
 *  stays in the HOTBOT wallet. */
export async function stakeCost(currency: PayCurrency, raw: bigint) {
  const inputMint = currency === 'SOL' ? SOL_MINT : USDC_MINT, last = lastQuote.get(currency), age = last ? Date.now() - last.at : Infinity;
  const floor = (quote: JupiterQuote) => BigInt(quote.otherAmountThreshold), sized = (from: { amount: bigint; found: JupiterQuote }) => from.amount * raw * 101n / (floor(from.found) * 100n) + 1n;
  if (last && age < QUOTE_MS && floor(last.found) >= raw && last.amount <= sized(last) + sized(last) / 50n) return last.found;
  const quote = (amount: bigint) => jupiter<JupiterQuote>(`/quote?inputMint=${inputMint}&outputMint=${HOTBOT_MINT}&amount=${amount}&swapMode=ExactIn&slippageBps=${SLIPPAGE_BPS}`);
  let amount = last && age < RATE_MS ? sized(last) : PROBE[currency], found = await quote(amount);
  for (let tries = 0, probe = !(last && age < RATE_MS); tries < 3 && (probe || floor(found) < raw); tries++, probe = false) {
    amount = sized({ amount, found });
    found = await quote(amount);
  }
  lastQuote.set(currency, { at: Date.now(), amount, found });
  if (floor(found) < raw) throw new ConvexError('$HOTBOT’s price is moving fast. Try again in a moment.');
  return found;
}
/** A swap of the payer's SOL or USDC into at least `raw` $HOTBOT, straight into the HOTBOT wallet's token account (`into`). */
async function buyStake(payer: string, currency: PayCurrency, raw: bigint, into: string) {
  const found = await stakeCost(currency, raw);
  const built = await jupiter<{ setupInstructions?: JupiterInstruction[]; swapInstruction: JupiterInstruction; cleanupInstruction?: JupiterInstruction | null; addressLookupTableAddresses?: string[] }>(
    '/swap-instructions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteResponse: found, userPublicKey: payer, destinationTokenAccount: into, wrapAndUnwrapSol: true }) });
  const instructions = [...(built.setupInstructions ?? []), built.swapInstruction, ...(built.cleanupInstruction ? [built.cleanupInstruction] : [])].map(fromJupiter);
  return { spent: BigInt(found.inAmount), instructions, tables: built.addressLookupTableAddresses ?? [] };
}

/** One transaction's instructions and lookup tables for what is still owed: the stake the HOTBOT wallet is short of (`stakeRaw`, raw $HOTBOT)
 *  and the fee (`fee`). The payer's own $HOTBOT goes first; without enough, the payment buys it. Refuses what the payer's wallet can't
 *  cover, before anything is signed. */
export async function payInstructions(payer: Holdings, quote: PayQuote, need: { stakeRaw: bigint; fee: boolean }) {
  const out: Instruction[] = [], tables: string[] = [];
  let lamports = NETWORK_LAMPORTS, usdc = 0n, swap = false;
  if (need.stakeRaw > 0n) {
    if (payer.hotbot && payer.hotbot.raw >= need.stakeRaw) out.push(...await tokenTransfer(payer.address, payer.hotbot.account, quote.vault, HOTBOT_MINT, need.stakeRaw));
    else {
      const bought = await buyStake(payer.address, quote.currency, need.stakeRaw, await tokenAccount(quote.vault, HOTBOT_MINT));
      out.push(await openTokenAccount(payer.address, quote.vault, HOTBOT_MINT), ...bought.instructions);
      tables.push(...bought.tables);
      if (quote.currency === 'SOL') lamports += bought.spent; else usdc += bought.spent;
      swap = true;
    }
  }
  if (need.fee && quote.currency === 'SOL') { out.push(solTransfer(payer.address, quote.recipient, BigInt(quote.amount), [quote.reference])); lamports += BigInt(quote.amount); }
  if (need.fee && quote.currency === 'USDC') {
    if (!payer.usdc) throw new ConvexError('This wallet holds no USDC. Pay in SOL instead.');
    out.push(...await tokenTransfer(payer.address, payer.usdc.account, quote.recipient, USDC_MINT, BigInt(quote.amount), [quote.reference]));
    usdc += BigInt(quote.amount);
  }
  if (payer.lamports < lamports) throw new ConvexError(`This wallet needs about ${amountText('SOL', Number(lamports))} SOL for this. It holds ${amountText('SOL', Number(payer.lamports))}.`);
  if (usdc > (payer.usdc?.raw ?? 0n)) throw new ConvexError(`This wallet needs ${amountText('USDC', Number(usdc))} USDC for this. It holds ${amountText('USDC', Number(payer.usdc?.raw ?? 0n))}.`);
  return { instructions: [...computeBudget(swap ? UNITS.swap : UNITS.plain, UNIT_PRICE), ...out], tables };
}
