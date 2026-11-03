
/** `twitterapi` is HOTBOT's own key (`TWITTERAPI_IO_KEY`); a person saves only an `x` key. */
export const RESEARCH_PROVIDERS = [
  { id: 'twitterapi', label: 'twitterapi.io' },
  { id: 'x', label: 'X API' },
] as const;
export type ResearchProvider = typeof RESEARCH_PROVIDERS[number]['id'];

/** `ok` reads. `refused`: the provider refused the key (401 or 403), so it stays unused until the person saves a key again. `empty`: the
 *  account has no credit (402), so it waits for the next UTC day. `limited`: the provider's rate limit (429), so it waits for the
 *  provider's reset time, or one hour when the provider gives none. */
export const RESEARCH_STATUSES = ['ok', 'refused', 'empty', 'limited'] as const;
export type ResearchStatus = typeof RESEARCH_STATUSES[number];

/** A pasted key: printable ASCII with no spaces. */
export const KEY_PATTERN = /^[\x21-\x7e]{16,512}$/;
