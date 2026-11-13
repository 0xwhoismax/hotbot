/** A withdrawal from the HOTBOT wallet as Crossmint prepares it: read from the serialized transaction itself, so the person's browser
 *  (before the recovery approves) and Convex (before it shows the request) both see what goes where and how much. No dependency: the
 *  same code runs in the client and in Convex. */
import { ASSOCIATED_TOKEN_PROGRAM, TOKENS, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './access';

/** Crossmint's Solana smart wallet program; its `ExecuteTransaction` (instruction 4) runs the inner instructions from the vault. */
export const CROSSMINT_WALLET_PROGRAM = 'XmSwiXQsxSZYKVYbSAkkvQVvdrKo1nwwfvZBPQrLzbU';
const SYSTEM_PROGRAM = '11111111111111111111111111111111', COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
/** Lamports a prepared withdrawal may also move out of the vault besides the transfer itself: the network fee Crossmint has the vault
 *  repay its relayer. */
export const WITHDRAW_FEE_CAP_LAMPORTS = 2_000_000;
/** The smallest withdrawal. */
export const MIN_WITHDRAW_SOL = 0.001;
/** Days a new withdrawal address waits before SOL can go to it, and that a cancelled add freezes new ones. */
export const ADDRESS_LOCK_DAYS = 2;
/** How long a signed address approval stays valid. */
export const ADDRESS_SIGNATURE_MS = 10 * 60_000;

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes: Uint8Array) {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) { carry += digits[i]! * 256; digits[i] = carry % 58; carry = Math.floor(carry / 58); }
    while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + digits.reverse().map(digit => ALPHABET[digit]).join('');
}
export function unbase58(text: string) {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) throw new Error('Not base58');
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i]! * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}
/** Whether `text` is a Solana address: base58 of 32 bytes. */
export function isAddress(text: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try { return unbase58(text).length === 32; } catch { return false; }
}

/** A serialized Solana transaction: its signatures, the message's bytes (what each signer signs), its static keys and instructions. Only
 *  legacy and v0 messages; an instruction's account outside the static keys (an address lookup table's) reads as null. */
export type ParsedTransaction = { signatures: Uint8Array[]; message: Uint8Array; signers: string[]; keys: string[]; blockhash: string;
  instructions: { program: string | null; accounts: (string | null)[]; data: Uint8Array }[] };
export function parseTransaction(bytes: Uint8Array): ParsedTransaction {
  let at = 0;
  const byte = () => { if (at >= bytes.length) throw new Error('The transaction is cut short.'); return bytes[at++]!; };
  const compact = () => { let value = 0; for (let shift = 0; ; shift += 7) { const part = byte(); value |= (part & 0x7f) << shift; if (!(part & 0x80)) return value; } };
  const take = (length: number) => { if (at + length > bytes.length) throw new Error('The transaction is cut short.'); const part = bytes.subarray(at, at + length); at += length; return part; };
  const signatures = Array.from({ length: compact() }, () => take(64)), start = at;
  if (bytes[at]! & 0x80 && (bytes[at]! & 0x7f) !== 0) throw new Error('Crossmint prepared a transaction in a version HOTBOT cannot check yet, so it was not used. Try again later, or contact support.');
  if (bytes[at]! & 0x80) at++;
  const required = byte(); byte(); byte();
  const keys = Array.from({ length: compact() }, () => base58(take(32))), blockhash = base58(take(32));
  const key = (index: number) => keys[index] ?? null;
  const instructions = Array.from({ length: compact() }, () => {
    const program = key(byte()), accounts = Array.from({ length: compact() }, () => key(byte())), data = take(compact());
    return { program, accounts, data: Uint8Array.from(data) };
  });
  // A v0 message's lookups follow; nothing here reads them.
  const end = bytes[start]! & 0x80 ? bytes.length : at;
  return { signatures, message: bytes.subarray(start, end), signers: keys.slice(0, required), keys, blockhash, instructions };
}

/** Reads inside a buffer, refusing (throwing) a read past its end. */
function reader(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const need = (at: number, size: number) => { if (!Number.isInteger(at) || at < 0 || at + size > data.length) throw new Error('The wallet instruction is cut short.'); };
  return { u8: (at: number) => { need(at, 1); return data[at]!; }, u32: (at: number) => { need(at, 4); return view.getUint32(at, true); },
    u64: (at: number) => { need(at, 8); return Number(view.getBigUint64(at, true)); }, slice: (at: number, size: number) => { need(at, size); return data.subarray(at, at + size); } };
}
/** The accounts of Crossmint's `ExecuteTransaction` that its own instruction data indexes: those after the three fixed ones (config, vault,
 *  instructions sysvar). */
const FIXED_ACCOUNTS = 3;
export function withdrawalMoves(tx: ParsedTransaction, vault: string): { transfers: { to: string; lamports: number }[]; opened: { account: string; owner: string; mint: string; program: string }[];
  tokens: { program: string; mint: string; to: string; raw: number; decimals: number }[] } | { refused: string } {
  const transfers: { to: string; lamports: number }[] = [], opened: { account: string; owner: string; mint: string; program: string }[] = [];
  const tokens: { program: string; mint: string; to: string; raw: number; decimals: number }[] = [];
  for (const outer of tx.instructions) {
    if (outer.program === COMPUTE_BUDGET) continue;
    if (outer.program !== CROSSMINT_WALLET_PROGRAM || outer.data[0] !== 4) return { refused: `an instruction of ${outer.program ?? 'an unknown program'}` };
    if (outer.accounts[1] !== vault) return { refused: 'a wallet instruction for another wallet' };
    const data = reader(outer.data), account = (index: number) => { const found = outer.accounts[FIXED_ACCOUNTS + index]; if (found === undefined) throw new Error('A wallet instruction names an account it does not have.'); return found; };
    const count = data.u32(4);
    let at = 8;
    if (count > outer.data.length) throw new Error('The wallet instruction is cut short.');
    for (let n = 0; n < count; n++) {
      const program = account(data.u8(at)), size = data.u32(at + 1);
      if (size > outer.data.length) throw new Error('The wallet instruction is cut short.');
      const accounts = Array.from({ length: size }, (_, i) => account(data.u8(at + 5 + i * 2)));
      at += 5 + size * 2;
      const length = data.u32(at), inner = data.slice(at + 4, length);
      at += 4 + length;
      if (accounts.some(key => !key)) return { refused: 'an inner instruction with an account the transaction does not name' };
      const [first, second, third, fourth, , sixth] = accounts as string[];
      if (program === SYSTEM_PROGRAM && length === 12 && reader(inner).u32(0) === 2) {
        if (accounts.length !== 2 || first !== vault) return { refused: 'a transfer that is not from the HOTBOT wallet' };
        transfers.push({ to: second!, lamports: reader(inner).u64(4) });
      } else if (program === ASSOCIATED_TOKEN_PROGRAM && length === 1 && inner[0] === 1) {
        if (accounts.length !== 6 || first !== vault || fourth === undefined || sixth === undefined) return { refused: 'a token account that the HOTBOT wallet does not open' };
        opened.push({ account: second!, owner: third!, mint: fourth, program: sixth });
      } else if ((program === TOKEN_PROGRAM || program === TOKEN_2022_PROGRAM) && length === 10 && inner[0] === 12) {
        if (accounts.length !== 4 || fourth !== vault) return { refused: 'a token transfer that is not from the HOTBOT wallet' };
        tokens.push({ program, mint: second!, to: third!, raw: reader(inner).u64(1), decimals: inner[9]! });
      } else return { refused: `an inner instruction of ${program}` };
    }
  }
  return { transfers, opened, tokens };
}
/** Why a prepared withdrawal is not `lamports` to `to` from `vault` (one transfer of exactly that, plus at most the fee cap elsewhere, and
 *  no token), or null. */
export function withdrawalProblem(serialized: string, expected: { vault: string; to: string; lamports: number }) {
  try {
    const moves = withdrawalMoves(parseTransaction(unbase58(serialized)), expected.vault);
    if ('refused' in moves) return `It holds ${moves.refused}.`;
    if (moves.tokens.length || moves.opened.length) return 'It moves a token.';
    const main = moves.transfers.filter(row => row.to === expected.to), rest = moves.transfers.filter(row => row.to !== expected.to).reduce((sum, row) => sum + row.lamports, 0);
    if (main.length !== 1 || main[0]!.lamports !== expected.lamports) return 'It does not send the amount you asked to the address you chose.';
    if (rest > WITHDRAW_FEE_CAP_LAMPORTS) return 'It moves more SOL than the network fee elsewhere.';
    return null;
  } catch (error) { return error instanceof Error ? error.message : 'The transaction cannot be read.'; }
}
/** Why a prepared withdrawal is not `raw` of `mint` ($HOTBOT or USDC, `TOKENS`) from `vault` to `to`, or null: one TransferChecked of exactly
 *  that into the account it opens for `to`, which binds that account to `to`, and no SOL but the fee cap. */
export function tokenWithdrawalProblem(serialized: string, expected: { vault: string; to: string; mint: string; raw: number }) {
  try {
    const token = TOKENS[expected.mint], moves = withdrawalMoves(parseTransaction(unbase58(serialized)), expected.vault);
    if (!token) return 'It moves a token HOTBOT does not send.';
    if ('refused' in moves) return `It holds ${moves.refused}.`;
    const opened = moves.opened[0], sent = moves.tokens[0];
    if (moves.opened.length !== 1 || opened!.owner !== expected.to || opened!.mint !== expected.mint || opened!.program !== token.program) return 'It does not send to the address you chose.';
    if (moves.tokens.length !== 1 || sent!.program !== token.program || sent!.mint !== expected.mint || sent!.to !== opened!.account || sent!.decimals !== token.decimals || sent!.raw !== expected.raw)
      return 'It does not send the amount you asked to the address you chose.';
    if (moves.transfers.reduce((sum, row) => sum + row.lamports, 0) > WITHDRAW_FEE_CAP_LAMPORTS) return 'It moves more SOL than the network fee.';
    return null;
  } catch (error) { return error instanceof Error ? error.message : 'The transaction cannot be read.'; }
}
/** Whether two serialized transactions hold the same message, which is what a signature covers. */
export function sameMessage(a: Uint8Array, b: Uint8Array) {
  const left = parseTransaction(a).message, right = parseTransaction(b).message;
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}
/** The signature `address` put on a signed transaction, or null. */
export function signatureBy(signed: Uint8Array, address: string) {
  const tx = parseTransaction(signed), index = tx.signers.indexOf(address), signature = index < 0 ? undefined : tx.signatures[index];
  return signature && signature.some(byte => byte !== 0) ? base58(signature) : null;
}

/** The text the recovery wallet signs to let withdrawals go to a new address. Convex rebuilds it from its own facts. */
export const addressMessage = (args: { vault: string; address: string; nonce: string; expires: string }) =>
  `usehotbot.com: allow withdrawals from ${args.vault} to ${args.address} · nonce ${args.nonce} · expires ${args.expires}`;
