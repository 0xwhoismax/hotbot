import { EXTRA_KEYS, PRESETS, draftPatch, draftRules, planDraft, type Command, type Draft, type Intent, type StrategyPatch } from './team';
import { EXIT_PLAN_IDS, type ExitPlanId } from './exits';
import { STREAMS, validateRules, type Stream, type TeamRules } from './hotbot';
import { SHIELD_DEFAULTS, SHIELD_ROWS, type ShieldRules } from './shield';
import type { FunctionReturnType } from 'convex/server';
import type { pricedCoin } from './home';
import type { PublicApiType } from '../client/convex/api';

/** The same workspace follows text, choices and edits. Only the backend can turn it into an action. */
export type Focus = { page: 'home' | 'strategies' | 'strategy' | 'token' | 'account' | 'lab'; strategyId?: string; itemId?: string };
export type ScreenDraft = { name: string; rules: TeamRules; dip: number } & Record<string, unknown>;
/** The draft on screen as a strategy Jev can target ("this", "it"): changes to it come back as a proposal for the draft, never a saved update. */
export const DRAFT_TARGET = 'draft';
export type Choice = { label: string; detail: string; prompt: string };
export type Fact = { label: string; value: string; detail?: string };
export type StrategySummary = { id: string; name: string; status: string; budget: number; perCoin: number; held: number; found: number; bought: number; profit: number; returnPct: number; askFirst: boolean; dipPct: number; rules: Fact[]; execution: Fact[]; assessment: Fact[]; coins: { id: string; symbol: string; logo?: string; stage: string; reason: string }[] };
/** A Solana coin from Mobula's search: enough to show it and start research on it. */
export type CoinMatch = { address: string; symbol: string; name: string; logo?: string; decimals: number; price: number; marketCap: number; liquidity: number; volume24h: number; change24h?: number; createdAt?: number };
/** A coin's record at its mint's latest price (types/home `pricedCoin`), as its page and HOTBOT's coin card show it. */
export type CoinSnapshot = ReturnType<typeof pricedCoin<NonNullable<FunctionReturnType<PublicApiType['team']['item']>>>>;
export type SoldTrade = FunctionReturnType<PublicApiType['team']['trades']>[number];
export type HeldCoin = NonNullable<FunctionReturnType<PublicApiType['team']['home']>>['bags'][number];
/** A best or worst answer: the leaders by return and by SOL, then the next few by SOL. */
export type Ranking = { kind: 'ranking'; direction: 'best' | 'worst' } & ({ subject: 'sold'; coins: SoldTrade[] } | { subject: 'held'; coins: HeldCoin[] });
export type AssistantCard =
  | { kind: 'capabilities' }
  | { kind: 'preset'; draft: Draft }
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
  | { kind: 'draftChange'; patch: StrategyPatch; auto?: true };
/** Who produced the result: the readability filter, a coin search or Jev without a model call, the GLM chat model, or a button with no inference. */
export type AssistantRoute = 'filter' | 'search' | 'jev' | 'model' | 'button';
/** `highlight`: Settings rows the answer is about (`types/settingsGuide.ts` ids); the page on screen shows and marks them. */
export type AssistantResult = { kind: 'workspace'; sessionId: string; revision: number; title: string; summary: string; card: AssistantCard; route?: AssistantRoute; highlight?: string[] };
export type Interaction =
  | { type: 'draft'; revision: number; draft: Draft }
  | { type: 'apply' | 'dismiss'; revision: number };
export type AssistantShortcut = 'capabilities' | 'preset' | 'research' | 'performance' | 'decisions' | 'settings' | 'positions';

/** Product capabilities, also supplied to the model. UI examples are real requests, never a text matcher. */
export const CAPABILITIES = [
  { id: 'preset', title: 'Build a strategy', detail: 'Style, budget and entry rules', prompt: 'Help me build a strategy preset. Show me the choices before creating anything.', tools: ['createStrategy'] },
  { id: 'research', title: 'Check a coin', detail: 'Research and holder checks', prompt: 'Help me choose a coin to research against my strategy.', tools: ['research', 'coin', 'activity'] },
  { id: 'performance', title: 'Read the results', detail: 'Profit and strategy comparison', prompt: 'Show how my strategies are performing, with a comparison if I have more than one.', tools: ['portfolio', 'strategies', 'trades'] },
  { id: 'decisions', title: 'Understand a decision', detail: 'Bot verdicts and evidence', prompt: 'Help me understand a recent decision. Let me choose the coin if the page does not identify one.', tools: ['coin', 'activity'] },
  { id: 'settings', title: 'Tune the rules', detail: 'Limits and entry settings', prompt: 'Help me improve my strategy rules. Show proposed changes before applying them.', tools: ['update', 'pause', 'resume', 'resumeAll'] },
  { id: 'positions', title: 'Manage the team', detail: 'Positions and approvals', prompt: 'Show what needs my attention and the actions available for my positions.', tools: ['approve', 'skip', 'buyNow', 'cancel', 'sell', 'sellAll', 'stopAll', 'mode'] },
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

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
/** Display text: trimmed and cut to fit rather than refused for running long, so a wordy answer still renders. */
export function clip(value: unknown, max: number): string {
  const text = shortText(value, Number.MAX_SAFE_INTEGER);
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
export function shortText(value: unknown, max = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('A short, nonempty text is required.');
  return value.trim();
}
const number = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('That number is outside the supported range.');
  return value;
};
const list = (value: unknown, max: number) => { if (!Array.isArray(value)) throw new Error('Expected a list.'); return value.slice(0, max); };
const bool = (value: unknown) => { if (typeof value !== 'boolean') throw new Error('Choose on or off.'); return value; };
const PATCH_NUMBERS = ['minMarketCapUsd', 'maxMarketCapUsd', 'budgetSol', 'tradeSol', 'maxOpen', 'maxPoolSharePct', 'dipPct', 'minLiquidityUsd', 'minAgeMinutes', 'maxTop10Percent', 'minVolume24hUsd', 'stopLossPct', 'entryDelayMinutes', 'entryMaxUpPct', 'passMark', 'hourCrashLimit', 'recheckMovePct', 'sellModelPct', ...EXTRA_KEYS] as const;
/** Upper bounds for numbers whose name doesn't say percent-of-100; the rest follow their name. applyPatch and validateRules check them again. */
const PATCH_MAX: Partial<Record<string, number>> = { recheckMovePct: 500, minMove1hPct: 100000, maxMove1hPct: 100000, sweetMove1hLowPct: 100000, sweetMove1hHighPct: 100000 };
/** ShieldBot fields from outside, each in its own shape: a switch, a number up to its row's max, or a holder group's two shares. */
function readShield(value: unknown): Partial<ShieldRules> {
  const row = object(value), next: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (!Object.hasOwn(SHIELD_DEFAULTS, key)) throw new Error('Unsupported ShieldBot setting: ' + key);
    const field = SHIELD_ROWS[key as keyof ShieldRules];
    if (field.kind === 'switch') next[key] = bool(val);
    else if (field.kind === 'number') next[key] = number(val, 0, field.max);
    else { const holding = object(val); next[key] = { weighAbove: number(holding.weighAbove, 0, 100), refuseAt: number(holding.refuseAt, 0, 100) }; }
  }
  return next as Partial<ShieldRules>;
}
export function readPatch(value: unknown): StrategyPatch {
  const row = object(value), next: StrategyPatch = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === 'name') { next.name = shortText(val, 60); continue; }
    if (key === 'askFirst') { next.askFirst = bool(val); continue; }
    if (key === 'entryActivity') { next.entryActivity = bool(val); continue; }
    if (key === 'codeOnly') { next.codeOnly = bool(val); continue; }
    if (key === 'shield') { next.shield = readShield(val); continue; }
    if (key === 'streams') { const picked = list(val, STREAMS.length); if (!picked.length || picked.some(stream => !STREAMS.includes(stream as Stream))) throw new Error('Choose bonding, graduated or both.'); next.streams = STREAMS.filter(stream => picked.includes(stream)); continue; }
    if (key === 'takeProfits') { next.takeProfits = list(val, 4).map(value => { const tp = object(value); return { gainPct: number(tp.gainPct, 1, 100000), sellPct: number(tp.sellPct, 1, 100), ...(tp.pullbackPct !== undefined ? { pullbackPct: number(tp.pullbackPct, 1, 100) } : {}) }; }); continue; }
    if (key === 'exitPlan') { if (!EXIT_PLAN_IDS.includes(val as ExitPlanId)) throw new Error('Choose one of the exit plans.'); next.exitPlan = val as ExitPlanId; continue; }
    if (!(PATCH_NUMBERS as readonly string[]).includes(key)) throw new Error('Unsupported strategy setting: ' + key);
    const n = number(val, 0, PATCH_MAX[key] ?? (/Percent|Pct/.test(key) ? 100 : 1e12));
    if (['budgetSol', 'tradeSol', 'maxOpen'].includes(key) && n <= 0) throw new Error('Budget, size and coin count must be greater than zero.');
    if (key === 'maxOpen' && (!Number.isInteger(n) || n > 20)) throw new Error('Choose between 1 and 20 coins.');
    if (key === 'dipPct' && n > 50) throw new Error('Choose a dip of at most 50%.');
    Object.assign(next, { [key]: n });
  }
  return next;
}
/** A plan's intent from outside (the browser or a stored chat card): every field is checked, and budget, approval and name stay single controls a hidden number may never override. */
export function readIntent(value: unknown): Intent {
  const row = object(value);
  const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) => { if (!allowed.includes(value as T)) throw new Error('That plan could not be read. Build it again.'); return value as T; };
  const set = readPatch(row.set ?? {});
  delete set.budgetSol; delete set.askFirst; delete set.name; delete set.exitPlan;
  return { base: oneOf(row.base, PRESETS.map(preset => preset.id)), risk: oneOf(row.risk, ['low', 'medium', 'high'] as const), hold: oneOf(row.hold, ['quick', 'swing', 'moon'] as const),
    age: row.age === null ? null : oneOf(row.age, ['new', 'established'] as const), clean: row.clean === true, moving: row.moving === true, askFirst: bool(row.askFirst), budgetSol: number(row.budgetSol, 0.01, 1e6), set };
}
/** A plan from outside is rebuilt from its intent, so every rule is code's own; the person's name, the live count and HOTBOT's note ride along once checked. */
export function readDraft(value: unknown): Draft {
  const row = object(value), built = planDraft(readIntent(row.intent));
  validateRules(draftRules(built, built.budgetSol));
  const matches = row.matches === null || row.matches === undefined ? null : (() => { const m = object(row.matches); return { count: number(m.count, 0, 1e6), tokens: list(m.tokens, 4).map(value => { const t = object(value); return { symbol: clip(t.symbol, 40), logo: typeof t.logo === 'string' ? t.logo : null, address: typeof t.address === 'string' ? t.address.slice(0, 64) : '' }; }) }; })();
  const fixes = row.fixes === undefined ? built.fixes : list(row.fixes, 3).map(value => { const f = object(value); return { label: clip(f.label, 40), patch: readPatch(f.patch) }; });
  return { ...built, name: clip(row.name, 60), matches, note: typeof row.note === 'string' ? clip(row.note, 160) : built.note, fixes };
}
export function draftCommand(draft: Draft): Command {
  const checked = readDraft(draft);
  return { type: 'createStrategy', name: checked.name, description: checked.description, preset: checked.preset, budgetSol: checked.budgetSol, askFirst: checked.askFirst, patch: draftPatch(checked, checked.budgetSol) };
}

/** Runtime validation at the model boundary. Type assertions are never permission to execute. */
export function readAssistantCommand(value: unknown): Command {
  const row = object(value), type = row.type;
  if (type === 'pause' || type === 'resume') return { type, strategyId: shortText(row.strategyId, 100) };
  if (type === 'update') { const patch = readPatch(row.patch); if (!Object.keys(patch).length) throw new Error('No settings changed.'); return { type, strategyId: shortText(row.strategyId, 100), patch }; }
  if (type === 'approve' || type === 'skip' || type === 'cancel' || type === 'sell' || type === 'buyNow') return { type, itemId: shortText(row.itemId, 100) };
  if (type === 'sellAll' || type === 'stopAll' || type === 'resumeAll') return { type };
  if (type === 'mode' && (row.mode === 'paper' || row.mode === 'live')) return { type, mode: row.mode };
  // Creation and coin research use their dedicated visual builders, never invented model token metadata.
  throw new Error('That action needs its visual builder.');
}
