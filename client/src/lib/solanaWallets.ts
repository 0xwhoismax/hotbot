"use client";
import { useSyncExternalStore } from 'react';
import { ConvexError } from 'convex/values';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import { SolanaSignAndSendTransaction, SolanaSignIn, SolanaSignMessage, SolanaSignTransaction, type SolanaSignAndSendTransactionFeature, type SolanaSignInFeature, type SolanaSignInInput, type SolanaSignTransactionFeature } from '@solana/wallet-standard-features';
import { SolanaMobileWalletAdapterWalletName, createDefaultAuthorizationCache, createDefaultChainSelector, registerMwa } from '@solana-mobile/wallet-standard-mobile';
import { getBase58Decoder, signature as asSignature, type Instruction } from '@solana/kit';
import { rpc, solTransfer, transactionBytes } from './solanaTx';
import { base58, sameMessage, signatureBy, unbase58 } from '../../../types/withdrawal';
import { signText } from './walletSign';

let mobileRegistered = false;
/** On Android, Solana Mobile Wallet Adapter joins the list as one more Wallet Standard wallet that opens the installed wallet app. */
function registerMobileWallet() {
  if (mobileRegistered || typeof window === 'undefined' || !/android/i.test(navigator.userAgent)) return;
  mobileRegistered = true;
  registerMwa({
    appIdentity: { name: 'HOTBOT', uri: window.location.origin, icon: '/favicon.ico' },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    // Our own row explains a missing wallet app; connect() still rejects so the row shows it.
    onWalletNotFound: async () => {},
  });
}

/** Installed Solana wallets that can connect and sign a message (browser extensions, in-app wallet browsers, Android wallet apps). */
export function solanaWallets(): readonly Wallet[] {
  registerMobileWallet();
  return getWallets().get().filter(wallet => wallet.chains.some(chain => chain.startsWith('solana:')) && StandardConnect in wallet.features && SolanaSignMessage in wallet.features);
}

export function onWalletsChange(listener: () => void) {
  const { on } = getWallets();
  const offRegister = on('register', listener), offUnregister = on('unregister', listener);
  return () => { offRegister(); offUnregister(); };
}

/** Connect, sign the server's one-time Sign In With Solana request, and return the credentials for `signIn('solana', …)`. A wallet with `solana:signIn`
 *  builds the message from its fields and checks their domain itself. The server checks the signature over its own text from the connected address,
 *  so when that wallet signs other text or with another account, or has no `solana:signIn`, it signs the server's text with `signMessage`. */
/** `only`: the addresses allowed, refused before anything is signed. */
export async function walletCredentials(wallet: Wallet, challenge: (args: { address: string }) => Promise<{ nonce: string; message: string; fields: SolanaSignInInput }>, only?: string[]) {
  const { accounts } = await (wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect]).connect();
  const account: WalletAccount | undefined = accounts.find(item => item.chains.some(chain => chain.startsWith('solana:')));
  if (!account) throw new Error(`${wallet.name} did not share a Solana account.`);
  if (only && !only.includes(account.address)) throw new ConvexError(`That ${wallet.name} wallet isn’t on your account. Switch to one that is.`);
  const { nonce, message, fields } = await challenge({ address: account.address });
  const signIn = (wallet.features as Partial<SolanaSignInFeature>)[SolanaSignIn];
  const [built] = signIn ? await signIn.signIn(fields) : [];
  const signature = built && built.account.address === account.address && new TextDecoder().decode(built.signedMessage) === message
    ? getBase58Decoder().decode(built.signature) : await signText(wallet, account, message);
  return { address: account.address, nonce, signature };
}

/** Installed Solana wallets that can connect and send a transaction themselves (`solana:signAndSendTransaction`): a deposit's source. */
export function payingWallets(): readonly Wallet[] {
  registerMobileWallet();
  return getWallets().get().filter(wallet => wallet.chains.some(chain => chain.startsWith('solana:')) && StandardConnect in wallet.features && SolanaSignAndSendTransaction in wallet.features);
}

const NO_WALLETS: readonly Wallet[] = [];
let paying = NO_WALLETS;
/** `payingWallets` as a store snapshot: the same array until the wallets change. */
function payingSnapshot() {
  const next = payingWallets();
  if (next.length !== paying.length || next.some((wallet, at) => wallet !== paying[at])) paying = next;
  return paying;
}
/** The wallets in this browser that can pay, kept up to date as wallets register. */
export const usePayingWallets = () => useSyncExternalStore(onWalletsChange, payingSnapshot, () => NO_WALLETS);
/** Phone wallets whose own browser opens a page with the wallet inside it, and their logos in `public/wallets`. */
export const WALLET_APPS = { Phantom: '/wallets/phantom.svg', Solflare: '/wallets/solflare.svg' } as const;
export type WalletApp = keyof typeof WALLET_APPS;
/** A page of HOTBOT's (this one by default), opened in `app`'s browser on a phone. */
export function openInWallet(app: WalletApp, url?: string) {
  if (typeof window === 'undefined') return '';
  const page = encodeURIComponent(url ?? window.location.href), ref = encodeURIComponent(window.location.origin);
  return app === 'Phantom' ? `https://phantom.app/ul/browse/${page}?ref=${ref}` : `https://solflare.com/ul/v1/browse/${page}?ref=${ref}`;
}

/** The wallet's Solana account, once the person connects it. */
export async function payingAccount(wallet: Wallet) {
  const { accounts } = await (wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect]).connect();
  const account = accounts.find(item => item.chains.some(chain => chain.startsWith('solana:')));
  if (!account) throw new Error(`${wallet.name} did not share a Solana account.`);
  return account;
}
/** Sends `instructions` in one transaction that `account` pays for and the wallet signs and sends itself, shortened through `tables` (a swap
 *  route's address lookup tables). Returns its signature (base58) and the last block height it can land at. */
export async function sendInstructions(wallet: Wallet, account: WalletAccount, instructions: Instruction[], tables: string[] = []) {
  const { bytes: transaction, lastValidBlockHeight } = await transactionBytes(account.address, instructions, tables);
  const [sent] = await (wallet.features[SolanaSignAndSendTransaction] as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction])
    .signAndSendTransaction({ account, transaction, chain: 'solana:mainnet' });
  if (!sent) throw new Error(`${wallet.name} did not send the transaction.`);
  return { signature: getBase58Decoder().decode(sent.signature), lastValidBlockHeight };
}
/** Sends `lamports` from the wallet's connected account to `to` with one System transfer. */
export async function sendSol(wallet: Wallet, to: string, lamports: bigint) {
  const account = await payingAccount(wallet);
  return await sendInstructions(wallet, account, [solTransfer(account.address, to, lamports)]);
}

/** Where a sent transaction stands: `landed`, `failed` on chain, `gone` once the chain is past its last valid height without it, else `pending`. */
export async function sentStatus(signature: string, lastValidBlockHeight: bigint) {
  const client = rpc(), [{ value: [status] }, height] = await Promise.all([client.getSignatureStatuses([asSignature(signature)]).send(), client.getBlockHeight({ commitment: 'confirmed' }).send()]);
  if (status?.err) return 'failed';
  if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return 'landed';
  return height > lastValidBlockHeight ? 'gone' : 'pending';
}

/** Installed Solana wallets that can connect, sign a message and sign a transaction: the recovery's way to approve a withdrawal and a new address. */
export function recoveryWallets(): readonly Wallet[] {
  registerMobileWallet();
  return getWallets().get().filter(wallet => wallet.chains.some(chain => chain.startsWith('solana:')) && StandardConnect in wallet.features && SolanaSignMessage in wallet.features && SolanaSignTransaction in wallet.features);
}

/** Whether the wallet is an app the browser opens (Android's Mobile Wallet Adapter): Chrome opens an app only from a fresh tap, once per tap. */
export const opensApp = (wallet: Wallet) => wallet.name === SolanaMobileWalletAdapterWalletName;

/** The wallet's account for `address`, the recovery's; the wallet is asked to switch when it shares another. */
export async function recoveryAccount(wallet: Wallet, address: string) {
  const { accounts } = await (wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect]).connect();
  const account = accounts.find(item => item.address === address);
  if (!account) throw new ConvexError(`Switch ${wallet.name} to ${address.slice(0, 4)}…${address.slice(-4)}, the wallet that recovers your HOTBOT wallet.`);
  return account;
}

/** `transaction` (base58, as Crossmint prepared it) signed by the recovery's account: its signature, base58, for Crossmint's approval. */
export async function signPrepared(wallet: Wallet, account: WalletAccount, transaction: string) {
  const [signed] = await (wallet.features[SolanaSignTransaction] as SolanaSignTransactionFeature[typeof SolanaSignTransaction]).signTransaction({ account, transaction: unbase58(transaction), chain: 'solana:mainnet' });
  // What the wallet signed must be the message that was checked.
  if (signed && !sameMessage(unbase58(transaction), signed.signedTransaction)) throw new ConvexError(`${wallet.name} signed a different transaction, so it was not used.`);
  const signature = signed && signatureBy(signed.signedTransaction, account.address);
  if (!signature) throw new ConvexError(`${wallet.name} did not sign the transaction.`);
  if (base58(unbase58(signature)) !== signature) throw new ConvexError(`${wallet.name} gave a signature that cannot be read.`);
  return signature;
}
