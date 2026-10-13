/** What HOTBOT reads about a coin outside the chain stream, shared by every team: pump.fun's holder profiles and callouts, Fomo's theses
 *  and DexScreener's token profile. The agents service writes it; the coin page reads it. Every value is what its source reported at
 *  `readAt`; nothing here is derived from our own data. */

/** A pump.fun account that holds the coin, with pump.fun's own accounting of its position. Token amounts are UI units; money is USD. */
export type IntelHolder = { wallet: string; name: string; x?: string; verified: boolean; held: number; costUsd: number; pnlUsd: number; pnlPct: number; realizedUsd: number };

/** A public call on the coin, by a pump.fun account that still holds it. `multiple` is the price now over the price at the call;
 *  `maxMultiple` is the best since. `capUsd` is the market cap at the call. `at` is milliseconds. */
export type IntelCallout = {
  id: string; wallet: string; name: string; x?: string; text: string; at: number; capUsd: number; multiple: number; maxMultiple: number;
  likes: number; views: number; replies: number; reposts: number; pnlUsd: number;
};

/** pump.fun's view of the coin. `users` is how many pump.fun accounts hold it: not the chain's holder count. Empty lists for a coin that
 *  pump.fun does not know. */
export type IntelPump = { users: number; holders: IntelHolder[]; callouts: IntelCallout[]; readAt: number };

/** A Fomo thesis: a comment that a trader posts with a trade. `capUsd` is the market cap when it was written; `positionUsd` and `pnlUsd`
 *  are the author's position in the coin and its profit (realized and unrealized) as Fomo reports them. */
export type IntelThesis = {
  id: string; name: string; handle: string; x?: string; verified: boolean; text: string; at: number; capUsd: number;
  likes: number; replies: number; positionUsd: number; pnlUsd: number;
};

/** Fomo's view of the coin. `count` is every thesis Fomo holds for it; `theses` keeps the most liked of them. */
export type IntelFomo = { count: number; theses: IntelThesis[]; readAt: number };

/** DexScreener's token profile. `header` exists only for a paid profile; it is the coin creator's own image. */
export type IntelProfile = { header?: string; icon?: string; websites: string[]; socials: { type: string; url: string }[]; readAt: number };

export type CoinIntel = { address: string; pump?: IntelPump; fomo?: IntelFomo; profile?: IntelProfile };

export const INTEL = {
  /** The biggest pump.fun holders, the callouts and the Fomo theses kept per coin. */
  holders: 20, callouts: 20, theses: 20,
  /** How often a coin is read again: held coins, other coins in a pipeline, and DexScreener profiles. */
  heldMs: 30 * 60_000, otherMs: 2 * 60 * 60_000, profileMs: 6 * 60 * 60_000,
  /** An unchanged read is written again only after this long, so `readAt` stays close to the truth without a write per read. */
  touchMs: 60 * 60_000,
} as const;
