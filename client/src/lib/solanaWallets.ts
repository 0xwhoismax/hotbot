"use client";
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { createDefaultAuthorizationCache, createDefaultChainSelector, registerMwa } from '@solana-mobile/wallet-standard-mobile';
import { getBase58Decoder } from '@solana/kit';

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

/** Connect, sign the server's one-time message, and return the credentials for `signIn('solana', …)`. */
export async function walletCredentials(wallet: Wallet, challenge: (args: { address: string }) => Promise<{ nonce: string; message: string }>) {
  const { accounts } = await (wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect]).connect();
  const account: WalletAccount | undefined = accounts.find(item => item.chains.some(chain => chain.startsWith('solana:')));
  if (!account) throw new Error(`${wallet.name} did not share a Solana account.`);
  const { nonce, message } = await challenge({ address: account.address });
  const [signed] = await (wallet.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage]).signMessage({ account, message: new TextEncoder().encode(message) });
  if (!signed) throw new Error(`${wallet.name} did not sign the message.`);
  return { address: account.address, nonce, signature: getBase58Decoder().decode(signed.signature) };
}
