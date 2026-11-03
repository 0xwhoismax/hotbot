import type { LegalKind } from '../../../../types/legal';

export interface UserProfileData {
  id: string; creationTime: number; email?: string; username?: string; avatar?: string | null; role: 'admin' | 'user';
  priceDisplay?: 'price' | 'marketCap';
  /** Every way this person signs in, in the order the server sets: the account row, the provider and what people read for it. */
  methods: { accountId: string; provider: string; id: string }[];
  /** How long ago this session began, by the server's clock when it was read: removing a way to sign in needs a recent one (`RECENT_SIGN_IN_MS`). */
  signedInFor: number | null;
  /** The newest Terms and Real SOL versions this person accepted, and when (types/legal.ts). */
  accepted: Record<LegalKind, { version: number; at: number } | null>;
  /** An admin banned this account: it keeps only its profile, and the server refuses everything else. */
  banned: boolean;
  /** When an admin gave this person the Lab page; admins have it without. */
  labAccessAt: number | null;
}
