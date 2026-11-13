
/** How long the app and the Agent API wait for a queued command's answer before they show it as queued. */
export const COMMAND_WAIT_MS = 8_000;
/** A queued command's answer as the app and the Agent API read it: `coin` is the coin a research answer names (types/coinKey.ts `coinLink`). */
export type CommandAnswer = { ok: boolean; text: string | null; coin: string | null };
