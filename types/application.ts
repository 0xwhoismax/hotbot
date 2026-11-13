/** Applications to join HOTBOT (/join): the choices it offers, the limits, and the one check both the page and `applications.submit` run. */
export const TERMINALS = [
  { id: 'fomo', name: 'Fomo', icon: '/hotbot/brands/fomo.webp', profile: 'https://fomo.family/profile/' },
  { id: 'axiom', name: 'Axiom', icon: '/hotbot/brands/axiom.webp', profile: null },
  { id: 'pumpfun', name: 'Pump.fun', icon: '/icons/launchpads/pumpfun.webp', profile: 'https://pump.fun/profile/' },
  { id: 'padre', name: 'Padre', icon: '/hotbot/brands/padre.svg', profile: null },
  { id: 'gmgn', name: 'GMGN', icon: '/hotbot/brands/gmgn.webp', profile: null },
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
export const APPLICATION = { why: 280, whyMin: 10, toolsUsed: 500, terminalHandle: 120, comment: 200 } as const;
/** The post applicants are asked to reply to. */
export const APPLICATION_POST = 'https://x.com/usehotbot/status/2106714742631109031?s=20';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const isSolanaAddress = (text: string) => {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  let value = BigInt(0);
  for (const char of text) value = value * BigInt(58) + BigInt(BASE58.indexOf(char));
  const leadingZeros = text.length - text.replace(/^1+/, '').length, hex = value === BigInt(0) ? '' : value.toString(16);
  return leadingZeros + Math.ceil(hex.length / 2) === 32;
};
export function whyProblem(text: string) {
  const why = text.trim();
  if (why.length < APPLICATION.whyMin || flat(why, 4)) return 'Tell us why in a sentence or two.';
  if (why.length > APPLICATION.why) return `Keep it under ${APPLICATION.why} characters.`;
  return null;
}
const flat = (text: string, distinct: number) => new Set(text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).size < distinct;
/** A handle from what people paste: `@name`, `name` or a profile link. Empty when it isn't one. */
const handle = (text: string, hosts: RegExp, valid: RegExp) => {
  const name = text.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(hosts, '').replace(/^@/, '').split(/[/?#]/)[0];
  return valid.test(name) && !flat(name, 3) ? name : '';
};
export const xHandle = (text: string) => handle(text, /^(x|twitter)\.com\//i, /^[A-Za-z0-9_]{1,15}$/);
export const telegramHandle = (text: string) => handle(text, /^(t|telegram)\.me\//i, /^[A-Za-z0-9_]{5,32}$/);
