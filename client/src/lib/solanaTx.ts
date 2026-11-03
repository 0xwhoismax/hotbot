/** Solana transactions built the same way in the browser and on the website's server (a phone wallet's Solana Pay request, `/api/pay`). */
import { AccountRole, address, appendTransactionMessageInstructions, compileTransaction, compressTransactionMessageUsingAddressLookupTables, createSolanaRpc, createTransactionMessage,
  getAddressDecoder, getAddressEncoder, getProgramDerivedAddress, getTransactionEncoder, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  type Address, type Instruction } from '@solana/kit';
import { ConvexError } from 'convex/values';
import { ASSOCIATED_TOKEN_PROGRAM, HOTBOT_MINT, TOKENS, USDC_MINT } from '../../../types/access';

/** The site's Solana RPC: its own endpoint where it is set, else the public one (both in the CSP's connect-src). */
/** Solana reads: a page's go through HOTBOT's own server (app/api/rpc), since Solana's public RPC refuses calls from web pages; the server's
 *  (app/api/pay) go to SOLANA_RPC_URL. */
export const rpc = () => createSolanaRpc(typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
const COMPUTE_BUDGET_PROGRAM = address('ComputeBudget111111111111111111111111111111');

/** A System transfer of `lamports`; `extra` accounts ride along read-only (a Solana Pay reference, which finds the transfer on chain). */
export function solTransfer(from: string, to: string, lamports: bigint, extra: string[] = []): Instruction {
  // System program Transfer: u32 instruction 2, then the u64 lamports, little-endian.
  const data = new Uint8Array(12), view = new DataView(data.buffer);
  view.setUint32(0, 2, true); view.setBigUint64(4, lamports, true);
  return { programAddress: SYSTEM_PROGRAM, data, accounts: [{ address: address(from), role: AccountRole.WRITABLE_SIGNER }, { address: address(to), role: AccountRole.WRITABLE },
    ...extra.map(key => ({ address: address(key), role: AccountRole.READONLY }))] };
}

/** The associated token account of `owner` for `mint` ($HOTBOT or USDC, `TOKENS`): the HOTBOT wallet's vault, off the curve, has one too. */
export async function tokenAccount(owner: string, mint: string) {
  const encoder = getAddressEncoder();
  const [found] = await getProgramDerivedAddress({ programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
    seeds: [encoder.encode(address(owner)), encoder.encode(address(TOKENS[mint]!.program)), encoder.encode(address(mint))] });
  return found;
}
/** Opens `owner`'s token account of `mint` when it has none, `payer` paying its rent (CreateIdempotent). */
export async function openTokenAccount(payer: string, owner: string, mint: string): Promise<Instruction> {
  return { programAddress: address(ASSOCIATED_TOKEN_PROGRAM), data: new Uint8Array([1]), accounts: [
    { address: address(payer), role: AccountRole.WRITABLE_SIGNER }, { address: await tokenAccount(owner, mint), role: AccountRole.WRITABLE }, { address: address(owner), role: AccountRole.READONLY },
    { address: address(mint), role: AccountRole.READONLY }, { address: SYSTEM_PROGRAM, role: AccountRole.READONLY }, { address: address(TOKENS[mint]!.program), role: AccountRole.READONLY }] };
}
/** `raw` of `mint` from `from`'s token account (`source`) into `to`'s, which opens first when missing; `extra` accounts ride along read-only. */
export async function tokenTransfer(from: string, source: string, to: string, mint: string, raw: bigint, extra: string[] = []): Promise<Instruction[]> {
  const { program, decimals } = TOKENS[mint]!, data = new Uint8Array(10), view = new DataView(data.buffer);
  // TransferChecked: instruction 12, the u64 amount, then the mint's decimals.
  data[0] = 12; view.setBigUint64(1, raw, true); data[9] = decimals;
  return [await openTokenAccount(from, to, mint), { programAddress: address(program), data, accounts: [
    { address: address(source), role: AccountRole.WRITABLE }, { address: address(mint), role: AccountRole.READONLY }, { address: await tokenAccount(to, mint), role: AccountRole.WRITABLE },
    { address: address(from), role: AccountRole.READONLY_SIGNER }, ...extra.map(key => ({ address: address(key), role: AccountRole.READONLY }))] }];
}
/** A compute budget for one transaction: its unit limit and the price per unit, in micro-lamports. */
export function computeBudget(units: number, microLamports: bigint): Instruction[] {
  const limit = new Uint8Array(5), price = new Uint8Array(9);
  limit[0] = 2; new DataView(limit.buffer).setUint32(1, units, true);
  price[0] = 3; new DataView(price.buffer).setBigUint64(1, microLamports, true);
  return [{ programAddress: COMPUTE_BUDGET_PROGRAM, data: limit }, { programAddress: COMPUTE_BUDGET_PROGRAM, data: price }];
}

type TokenHolding = { account: string; raw: bigint };
/** What a Solana wallet holds: its SOL in lamports, and its largest $HOTBOT and USDC token accounts. */
export type Holdings = { address: string; lamports: bigint; hotbot: TokenHolding | null; usdc: TokenHolding | null };
export async function holdingsOf(owner: string): Promise<Holdings> {
  const client = rpc();
  const largest = async (mint: string) => {
    const { value } = await client.getTokenAccountsByOwner(address(owner), { mint: address(mint) }, { encoding: 'jsonParsed', commitment: 'confirmed' }).send();
    return value.map(row => ({ account: row.pubkey as string, raw: BigInt(row.account.data.parsed.info.tokenAmount.amount) })).sort((a, b) => Number(b.raw - a.raw))[0] ?? null;
  };
  const [lamports, hotbot, usdc] = await Promise.all([client.getBalance(address(owner), { commitment: 'confirmed' }).send(), largest(HOTBOT_MINT), largest(USDC_MINT)]);
  return { address: owner, lamports: lamports.value, hotbot, usdc };
}

/** An address lookup table's addresses: they follow its 56-byte header, 32 bytes each. */
async function lookupTables(tables: string[]): Promise<Record<Address, Address[]>> {
  if (!tables.length) return {};
  const { value } = await rpc().getMultipleAccounts(tables.map(table => address(table)), { encoding: 'base64', commitment: 'confirmed' }).send(), decoder = getAddressDecoder();
  return Object.fromEntries(value.map((account, at) => {
    if (!account) throw new ConvexError('A swap route table could not be read. Try again.');
    const bytes = Uint8Array.from(atob(account.data[0]), char => char.charCodeAt(0)), found: Address[] = [];
    for (let offset = 56; offset + 32 <= bytes.length; offset += 32) found.push(decoder.decode(bytes.subarray(offset, offset + 32)));
    return [address(tables[at]!), found];
  }));
}
/** `instructions` as one unsigned v0 transaction that `payer` pays for, shortened through `tables` (a swap route's address lookup tables),
 *  with the last block height it can land at. */
export async function transactionBytes(payer: string, instructions: Instruction[], tables: string[] = []) {
  const [{ value: lifetime }, found] = await Promise.all([rpc().getLatestBlockhash({ commitment: 'confirmed' }).send(), lookupTables(tables)]);
  const message = pipe(createTransactionMessage({ version: 0 }), tx => setTransactionMessageFeePayer(address(payer), tx), tx => setTransactionMessageLifetimeUsingBlockhash(lifetime, tx),
    tx => appendTransactionMessageInstructions(instructions, tx));
  const compiled = compileTransaction(tables.length ? compressTransactionMessageUsingAddressLookupTables(message, found) : message);
  return { bytes: new Uint8Array(getTransactionEncoder().encode(compiled)), lastValidBlockHeight: lifetime.lastValidBlockHeight };
}
