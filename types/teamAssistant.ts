import { type Command, type Draft, type StrategyPatch } from './team';
import type { FunctionReturnType } from 'convex/server';
import type { PublicApiType } from '../client/convex/api';
import type { pricedCoin } from './home';

/** The same workspace follows text, choices and edits. Only the backend can turn it into an action. */
export type Focus = { page: 'home' | 'strategies' | 'strategy' | 'token' | 'account' | 'lab'; strategyId?: string; itemId?: string };
export type Choice = { label: string; detail: string; prompt: string };
export type Fact = { label: string; value: string; detail?: string };
export type StrategySummary = { id: string; name: string; status: string; budget: number; perCoin: number; held: number; found: number; bought: number; profit: number; returnPct: number; askFirst: boolean; dipPct: number; rules: Fact[]; execution: Fact[]; assessment: Fact[]; coins: { id: string; symbol: string; address: string; stage: string; reason: string }[] };
/** A Solana coin from a search: enough to show it and start research on it. */
export type CoinMatch = { address: string; symbol: string; name: string; decimals: number; price: number; marketCap: number; liquidity: number; volume24h: number; change24h?: number; createdAt?: number };
/** A coin's record at its mint's latest price (types/home `pricedCoin`), as its page and HOTBOT's coin card show it. */
export type CoinSnapshot = ReturnType<typeof pricedCoin<NonNullable<FunctionReturnType<PublicApiType['team']['item']>>>>;
export type SoldTrade = FunctionReturnType<PublicApiType['team']['trades']>[number];
export type HeldCoin = NonNullable<FunctionReturnType<PublicApiType['team']['home']>>['bags'][number];
/** A best or worst answer: the leaders by return and by SOL, then the next few by SOL. */
export type Ranking = { kind: 'ranking'; direction: 'best' | 'worst' } & ({ subject: 'sold'; coins: SoldTrade[] } | { subject: 'held'; coins: HeldCoin[] });
export type AssistantCard =
  | { kind: 'capabilities' }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'clarify'; choices: Choice[] }
  | { kind: 'insight'; facts: Fact[]; choices: Choice[] }
  | { kind: 'portfolio'; equity: number; profit: number; cash: number; invested: number; research: number; watching: number; held: number; approvals: number; mode: 'paper' | 'live' }
  | { kind: 'strategies'; strategies: StrategySummary[]; rank?: 'best' | 'worst' }
  | Ranking
  | { kind: 'coin'; item: CoinSnapshot }
  | { kind: 'research'; query: string; strategyId?: string; coins?: CoinMatch[] }
  | { kind: 'action'; command: Command; changes: Fact[]; status: 'pending' | 'applied' | 'dismissed'; eventId?: string; href?: string }
  /** A change for the draft on screen (the Lab's or Settings'): the page replays it and the person tries it there; nothing is saved from chat.
   *  `auto`: a plainly asked change goes straight into the draft. */
  | { kind: 'draftChange'; patch: StrategyPatch; auto?: true }
  /** The person's HOTBOT wallet, rendered from live team data: where to deposit, its balance and Withdraw. */
  | { kind: 'wallet' };
/** Who produced the result: the readability filter, a coin search or Jev without a model call, the GLM chat model, or a button with no inference. */
export type AssistantRoute = 'filter' | 'search' | 'jev' | 'model' | 'button';
/** `highlight`: Settings rows the answer is about (`types/settingsGuide.ts` ids); the page on screen shows and marks them. */
export type AssistantResult = { kind: 'workspace'; sessionId: string; revision: number; title: string; summary: string; card: AssistantCard; route?: AssistantRoute; highlight?: string[] };
export type Interaction =
  | { type: 'draft'; revision: number; draft: Draft }
  | { type: 'apply' | 'dismiss'; revision: number };
export type AssistantShortcut = 'capabilities' | 'draft' | 'research' | 'performance' | 'decisions' | 'settings' | 'positions';

/** Product capabilities, also supplied to the model. UI examples are real requests, never a text matcher. */
export const CAPABILITIES = [
  { id: 'draft', title: 'Build a strategy', detail: 'Style, budget and entry rules', prompt: 'Help me build a strategy. Show me the choices before creating anything.', tools: ['createStrategy'] },
  { id: 'research', title: 'Check a coin', detail: 'Research and holder checks', prompt: 'Help me choose a coin to research against my strategy.', tools: ['research', 'coin', 'activity'] },
  { id: 'performance', title: 'Read the results', detail: 'Profit and strategy comparison', prompt: 'Show how my strategies are performing, with a comparison if I have more than one.', tools: ['portfolio', 'strategies', 'trades'] },
  { id: 'decisions', title: 'Understand a decision', detail: 'Bot verdicts and evidence', prompt: 'Help me understand a recent decision. Let me choose the coin if the page does not identify one.', tools: ['coin', 'activity'] },
  { id: 'settings', title: 'Tune the rules', detail: 'Limits and entry settings', prompt: 'Help me improve my strategy rules. Show proposed changes before applying them.', tools: ['update', 'pause', 'resume', 'resumeAll'] },
  { id: 'positions', title: 'Manage the team', detail: 'Positions, approvals and wallet', prompt: 'Show what needs my attention and the actions available for my positions.', tools: ['approve', 'skip', 'buyNow', 'cancel', 'sell', 'sellAll', 'stopAll', 'mode', 'wallet', 'withdraw'] },
] as const;

/** Refusal for text with no readable request; shown with the tools card. */
export const UNREADABLE = { title: 'I didn’t catch that', summary: 'Ask about your team, your coins or trading.' };

// Keyboard rows both ways: "asd", "poi" and "zxcv" are typed along a row.
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].flatMap(row => [row, [...row].reverse().join('')]);
const keyRun = (w: string) => w.length >= 3 && ROWS.some(row => row.includes(w));
// Four keys in a row anywhere in a word; 'erty' and 'trew' are left out because "property" and "strewn" contain them.
const MASH = ROWS.flatMap(row => [...row.slice(3)].map((_, i) => row.slice(i, i + 4))).filter(run => run !== 'erty' && run !== 'trew');
// Letter pairs words and coin names almost never contain: j or q before a consonant, a rare consonant before j or q, and a few more.
const ODD = /^(?:j[^aeiouyj]|q[^aeiouy]|[^aeiouycnrsq]q|[^aeiouybdfjn]j|[fgkvw][jqxz]|x[jqz]|z[jqx]|v[kw]|w[vx])$/;
// How surprising each letter is after the previous one, ^ marking a word edge: -log2 P in quarter bits as base62, counted over the
// macOS word list plus verified Solana token names. Words average about 3.6 bits a letter; keyboard mashes 6 and up.
const PAIRS = 'ZfieijkkjjtrlhljdvidhgootywgFigkmtlwnEqbjbCjEdhcnquvsvpcmuscAEybwK9wAdyPdnsfADXqPdbRoMdVUcfZikJBbQEhvghZRZlL8eyBo9xrvaAKkuoeCShrDkxvUnLaisjgorqwqEBhjdnlzaehpstpwDieEGFcfICaOIdEEbHZfzkdUCRmPbdzIBaCmjcSJepjfEYdtyhVyVjOfbyDC9xGDbTImrpbASiyllLvTdRqfochmmmCAJrhlaflCmcerlJzLlt8FIyaPPAgFFFFCazPxPF7PIIyP9fsAA7tDobDwirljsSpmsnIqSlPccwtqawvDbVwesudsUFunkuBUdNc9jEGaAJEbSKxlqcgXEvGjHEUkUcfuhgcpeudArstofrAsjcptvIszopnhkrrivlHrffalgDdghfmosxykdBDIbCHaePHgAvdlYclikTBWnZtGQJQGQQQzQQQQJEJxGQG0JQQQQdbqmmbuprbGsqknboImmjltwTjJaiAiCeADheLsojqiivDdaiHuWoSdeAsHawFf9NLowxdCTeumkKvZjEtkjklmtoGkIxdf9sjMdagKyNyEBzbQOT4TTZ9ZQKOHfZZAGZpFZZwOh9rzqbuAgaRtltjbwOkotuRwRsFdevhBgwEpaULuwCfgDDbenLxFfO4lukmnypxpREgjklhRkikyKwxSynaCDB5LFDfVHoFIbJVECCrLDVjk';
const ALPHABET = '^abcdefghijklmnopqrstuvwxyz', B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const surprise = (w: string) => [...w, '^'].reduce((bits, c, i) => bits + B62.indexOf(PAIRS[ALPHABET.indexOf(i ? w[i - 1] : '^') * 27 + ALPHABET.indexOf(c)]) / 4, 0);
const pairs = (w: string, test: (pair: string) => boolean) => [...w.slice(1)].filter((_, i) => test(w.slice(i, i + 2))).length;
const plain = (word: string) => word.toLowerCase().replace(/(.)\1{2,}/g, '$1');
const ticker = (word: string) => /[A-Z].*[A-Z]/.test(word);
function mashed(word: string) {
  if (!/^[a-z]+$/i.test(word) || (word.length >= 32 && /[A-Z]/.test(word) && /[a-z]/.test(word))) return false;
  const w = plain(word);
  const chunk = [2, 3, 4].map(n => w.slice(0, n)).find(c => w.length >= 6 && w.length >= 2 * c.length && w === c.repeat(Math.ceil(w.length / c.length)).slice(0, w.length));
  // In any case: four keys along a row, long home-row sweeps, and a keyboard chunk typed over and over ("asdasd"; "nomnom" passes).
  if (MASH.some(run => w.includes(run)) || /^[asdfghjkl]{7,}$/.test(w) || (chunk !== undefined && (keyRun(chunk) || !/[aeiouy]/.test(chunk)))) return true;
  // TICKERS and cbBTC-style symbols stop here. Lowercase: a whole row run ("sdf"), then from six letters odd pairs, no vowels or unlikely letters.
  if (ticker(word)) return false;
  return keyRun(w) || (w.length >= 6 && (pairs(w, pair => ODD.test(pair)) >= 2 || !/[aeiouy]/.test(w) || /[^aeiouy]{6,}/.test(w) || surprise(w) / (w.length + 1) > 6));
}
/** Character structure, not intent: symbols only, one repeated sound or keyboard mashes never reach Jev. The composer and ask both check it. Numbers, tickers, addresses, short words and other scripts pass. */
export function unreadable(text: string): boolean {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [], letters = words.filter(word => !ticker(word)).join('').toLowerCase().replace(/\p{N}/gu, '');
  if (!words.length || (letters.length >= 5 && new Set(letters).size <= 2) || words.every(mashed)) return true;
  // Several plain words that are unlikely together ("sigotd okejgd"), scored as one.
  const plainWords = words.length >= 2 && words.every(word => /^[A-Za-z][a-z]{3,}$/.test(word)) ? words.map(plain) : [];
  return plainWords.length > 0 && plainWords.reduce((bits, w) => bits + surprise(w), 0) / plainWords.reduce((steps, w) => steps + w.length + 1, 0) > 6.25;
}
