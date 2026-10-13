/** Applications to join HOTBOT (/join): the choices it offers, the limits, and the one check both the page and `applications.submit` run. */
export const TERMINALS = [
  { id: 'fomo', name: 'Fomo', icon: '/hotbot/brands/fomo.svg', profile: 'https://fomo.family/profile/' },
  { id: 'axiom', name: 'Axiom', icon: '/hotbot/brands/axiom.png', profile: null },
  { id: 'pumpfun', name: 'Pump.fun', icon: '/icons/launchpads/pumpfun.webp', profile: 'https://pump.fun/profile/' },
  { id: 'padre', name: 'Padre', icon: '/hotbot/brands/padre.svg', profile: null },
  { id: 'gmgn', name: 'GMGN', icon: '/hotbot/brands/gmgn.png', profile: null },
] as const;
export type TerminalId = typeof TERMINALS[number]['id'];
export const EXPERIENCE = [
  { id: 'new', name: 'Just starting', text: 'Under 3 months' },
  { id: 'months', name: 'Finding my feet', text: '3 to 12 months' },
  { id: 'years', name: 'Seasoned', text: '1 to 3 years' },
  { id: 'veteran', name: 'Veteran', text: '3+ years, a few cycles deep' },
] as const;
export type ExperienceId = typeof EXPERIENCE[number]['id'];
/** Order types and trading tools someone has used. */
export const TOOLS = [
  { id: 'stopLoss', name: 'Stop losses' },
  { id: 'takeProfit', name: 'Take profits' },
  { id: 'trailing', name: 'Trailing stops' },
  { id: 'dca', name: 'DCA' },
  { id: 'limit', name: 'Limit orders' },
  { id: 'copy', name: 'Copy trading' },
  { id: 'sniper', name: 'Snipers' },
  { id: 'bots', name: 'Trading bots' },
] as const;
export type ToolId = typeof TOOLS[number]['id'];
/** An admin's decision on an application; none yet means new. Accepting gives it a one-seat invite. */
export const APPLICATION_STATUSES = ['checked', 'accepted', 'rejected'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export const APPLICATION = { why: 280, whyMin: 10, toolsUsed: 500, terminalHandle: 120, comment: 200 } as const;

/** `wallet` null: holds no $HOTBOT. `terminals` null: trades on no other terminal; each picked one may carry a name or a link. */
export type Application = {
  wallet: string | null; x: string; telegram: string;
  terminals: { id: TerminalId; handle?: string }[] | null;
  experience: ExperienceId; tools: ToolId[]; toolsUsed: string; why: string;
  /** Link to their reply on the application post on X; optional. */
  comment: string;
};
/** The post applicants are asked to reply to. */
export const APPLICATION_POST = 'https://x.com/usehotbot/status/2106714742631109031?s=20';

export const isSolanaAddress = (text: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
/** A handle from what people paste: `@name`, `name` or a profile link. Empty when it isn't one. */
const handle = (text: string, hosts: RegExp, valid: RegExp) => {
  const name = text.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(hosts, '').replace(/^@/, '').split(/[/?#]/)[0];
  return valid.test(name) ? name : '';
};
export const xHandle = (text: string) => handle(text, /^(x|twitter)\.com\//i, /^[A-Za-z0-9_]{1,15}$/);
export const telegramHandle = (text: string) => handle(text, /^(t|telegram)\.me\//i, /^[A-Za-z0-9_]{5,32}$/);

/** What the page sends: the same fields, its choices as plain strings until checked. */
export type ApplicationInput = Omit<Application, 'terminals' | 'experience' | 'tools'> & { terminals: { id: string; handle?: string }[] | null; experience: string; tools: string[] };

/** The first problem with an application, in the words the page shows, or the application as stored (trimmed, handles without @). */
export function checkApplication(input: ApplicationInput): { problem: string } | { application: Application } {
  if (input.wallet !== null && !isSolanaAddress(input.wallet.trim())) return { problem: 'That isn’t a Solana wallet address.' };
  // Both are case-insensitive: stored lowercase, so applying again as @Name or @name is the same person.
  const x = xHandle(input.x).toLowerCase(), telegram = telegramHandle(input.telegram).toLowerCase();
  if (!x) return { problem: 'Add your X handle.' };
  if (!telegram) return { problem: 'Add your Telegram handle.' };
  if (input.terminals !== null && (!input.terminals.length || input.terminals.some(row => !TERMINALS.some(terminal => terminal.id === row.id)))) return { problem: 'Pick the terminals you trade on.' };
  if (!EXPERIENCE.some(row => row.id === input.experience)) return { problem: 'Pick how long you’ve been trading.' };
  if (input.tools.some(id => !TOOLS.some(row => row.id === id))) return { problem: 'Pick tools from the list.' };
  const why = input.why.trim();
  if (why.length < APPLICATION.whyMin) return { problem: 'Tell us why you should get access.' };
  if (why.length > APPLICATION.why) return { problem: `Keep it under ${APPLICATION.why} characters.` };
  if (input.toolsUsed.trim().length > APPLICATION.toolsUsed) return { problem: `Keep the tools under ${APPLICATION.toolsUsed} characters.` };
  if (input.comment.trim().length > APPLICATION.comment) return { problem: `Keep the comment link under ${APPLICATION.comment} characters.` };
  const terminals = input.terminals && [...new Map(input.terminals.map(row => [row.id, { id: row.id as TerminalId, ...(row.handle?.trim() ? { handle: row.handle.trim().slice(0, APPLICATION.terminalHandle) } : {}) }])).values()];
  return { application: { wallet: input.wallet?.trim() ?? null, x, telegram, terminals, experience: input.experience as ExperienceId, tools: [...new Set(input.tools as ToolId[])], toolsUsed: input.toolsUsed.trim(), why, comment: input.comment.trim() } };
}
