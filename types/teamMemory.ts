/** What HOTBOT remembers about a person: short lasting preferences from their own words in chat, kept per person and added to each model
 *  call that works for them (HOTBOT's chat, a portfolio's picks and wakes). Code bounds it: a fixed number of facts, merged by kind and
 *  subject, the weakest dropped at the cap, and only the best few in a call. The person sees and deletes them in Account. */

export const MEMORY_KINDS = ['avoid', 'like', 'risk', 'autonomy', 'style'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export const MEMORY_LABELS: Record<MemoryKind, string> = { avoid: 'Avoid', like: 'Likes', risk: 'Risk', autonomy: 'Autonomy', style: 'Answers' };

/** `max` facts per person; `text` and `subject` in characters; `perCall` facts in one model call; `perTalk` facts from one conversation,
 *  read once it has been idle `idleMs`. */
export const MEMORY = { max: 50, text: 120, subject: 40, perCall: 10, perTalk: 5, idleMs: 10 * 60_000 } as const;
