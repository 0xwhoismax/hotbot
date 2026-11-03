

export const CLAIM_KINDS = ['why', 'wrong', 'add'] as const;
/** `why`: the reason to hold the coin. `wrong`: what would prove the pick wrong. `add`: when to add more. */
export type ClaimKind = typeof CLAIM_KINDS[number];
export const CLAIM_STATUSES = ['open', 'holding', 'weakening', 'refuted', 'right'] as const;
/** A claim's status as stored. Each kind gives these its own words (`CLAIM_WORDS`); `open` means no look judged the claim yet. */
export type ClaimStatus = typeof CLAIM_STATUSES[number];
/** Each claim kind's statuses as the model answers them and the page shows them, with the stored status of each, and the action each
 *  calls for:
 *  - why, the reason to hold: holding (hold), weakening (watch closer, no sale for this alone), broken (exit).
 *  - wrong, what proves the pick wrong: not met (hold), close (watch closer, no sale for this alone), met (exit).
 *  - add, when to add more: waiting (no add), met (add while the per-coin size and the free SOL leave room). */
export const CLAIM_WORDS = {
  why: { holding: 'holding', weakening: 'weakening', broken: 'refuted' },
  wrong: { 'not met': 'holding', close: 'weakening', met: 'right' },
  add: { waiting: 'holding', met: 'right' },
} as const satisfies Record<ClaimKind, Record<string, ClaimStatus>>;
/** A stored status in its kind's words: `open` before the first judgment. */
export function claimWord(kind: string, status: ClaimStatus | undefined): string {
  const words: Record<string, ClaimStatus> = (CLAIM_WORDS as Record<string, Record<string, ClaimStatus>>)[kind] ?? {};
  return Object.keys(words).find(word => words[word] === status) ?? 'open';
}
