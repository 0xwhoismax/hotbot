
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

export type IntelProfile = { header?: string; icon?: string; websites: string[]; socials: { type: string; url: string }[]; readAt: number };

/** A post on X about the coin. `followers` is the author's at the read; counts are X's at the read. `at` is milliseconds. */
export type IntelPost = { id: string; author: string; handle: string; followers: number; verified: boolean; text: string; at: number; likes: number; reposts: number; replies: number; views: number };

export type IntelX = { perHour: number; baseline: number; posts: IntelPost[]; readAt: number };

export type CoinIntel = { address: string; pump?: IntelPump; profile?: IntelProfile; x?: IntelX };

/** One line of talk about a coin for the chatter page (`teamIntel.chatter`): an X post or a pump.fun callout. `handle` is
 *  the author's X handle when the source knows it; `url` exists for X posts only. A count that the source does not give is 0. */
export type ChatterItem = {
  source: 'x' | 'pump'; id: string; address: string; author: string; handle?: string; verified: boolean; text: string; at: number;
  likes: number; replies: number; reposts: number; views: number; url?: string;
};

export const INTEL = {
  /** The biggest pump.fun holders, the callouts and the X posts kept per coin. */
  holders: 20, callouts: 20, posts: 10,
  /** How often a coin is read again: held coins, other coins in a pipeline, and token profiles. */
  heldMs: 30 * 60_000, otherMs: 2 * 60 * 60_000, profileMs: 6 * 60 * 60_000,
  /** An unchanged read is written again only after this long, so `readAt` stays close to the truth without a write per read. */
  touchMs: 60 * 60_000,
  xRead: 20, xCoinMs: 12 * 60 * 60_000, xAppDaily: 100, xKeyDaily: 200,
  /** The chatter page asks for at most this many coins at once and gets at most `chatterItems` lines. */
  chatterCoins: 8, chatterItems: 60,
} as const;
