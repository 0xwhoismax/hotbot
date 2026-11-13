"use client";
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { getBase58Decoder } from '@solana/kit';

/** `text` signed by the wallet's `account` (Wallet Standard `solana:signMessage`), as a base58 signature. */
export async function signText(wallet: Wallet, account: WalletAccount, text: string) {
  const [signed] = await (wallet.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage]).signMessage({ account, message: new TextEncoder().encode(text) });
  if (!signed) throw new Error(`${wallet.name} did not sign the message.`);
  return getBase58Decoder().decode(signed.signature);
}
