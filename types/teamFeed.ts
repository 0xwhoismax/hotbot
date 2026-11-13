
/** The gateway speaks to every link this often; the worker's beat carries when it last did (`gwOkAt`). A fresh beat with a `gwOkAt` older
 *  than LINK_QUIET_MS: the team trades, and its live view is down. */
export const LINK_OK_MS = 10_000, LINK_QUIET_MS = 30_000;
/** A browser's token lasts TEAM_TOKEN_MS; the browser sends a new one every TEAM_REAUTH_MS over the open socket. */
export const TEAM_TOKEN_MS = 10 * 60_000, TEAM_REAUTH_MS = 5 * 60_000;

export type TeamToken = { ws: string; viewer: string; admin?: boolean; exp: number };
/** A token's body as it reads, signed or not. */
const bodyOf = (body: string) => JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as Partial<TeamToken>;
/** The team a token names, read without its signature ('' when it names none): what a browser's feed and the gateway's refusal of a token
 *  are routed by, never what lets a browser in. */
export function teamTokenWs(text: string) {
  try { const { ws } = bodyOf(text.split('.')[0] ?? ''); return typeof ws === 'string' ? ws : ''; } catch { return ''; }
}
