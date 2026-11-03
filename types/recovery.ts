export type Recovery = { type: 'wallet'; address: string } | { type: 'email'; email: string };

/** Apple's Hide My Email relay delivers only mail from the domains HOTBOT registered with Apple, so Crossmint's recovery codes never reach it. */
export const appleRelay = (email: string) => email.trim().toLowerCase().endsWith('@privaterelay.appleid.com');

/** The person's own Solana sign-in, else an email sign-in, else the account's email (X's confirmed email); never an Apple relay address.
 *  `methods`: each way the person signs in, its provider and its id (the address for `solana`, the email for `email-code`). */
export function recoveryFrom(methods: readonly { provider: string; id: string }[], email?: string | null): Recovery | null {
  const wallet = methods.find(method => method.provider === 'solana');
  if (wallet) return { type: 'wallet', address: wallet.id };
  const own = [...methods.filter(method => method.provider === 'email-code').map(method => method.id), ...(email ? [email] : [])].find(address => !appleRelay(address));
  return own ? { type: 'email', email: own } : null;
}
