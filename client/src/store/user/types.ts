export interface UserProfileData {
  id: string; creationTime: number; email?: string; username?: string; avatar?: string | null; role: 'admin' | 'user';
  priceDisplay?: 'price' | 'marketCap';
  /** Joined with an invite; HOTBOT is invite-only, so a first team needs one (admins excepted). */
  invited: boolean;
  /** Sign-in provider and its display identifier. */
  signIn: { provider: string; id: string } | null;
}
