"use client";
import { useMemo, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { useAtomValue } from 'jotai';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import { CAPABILITIES, unreadable, UNREADABLE, type AssistantResult, type AssistantShortcut, type Focus, type Interaction } from '../../../../types/teamAssistant';
import type { HomeData } from './data';
import { askFreshCode, draftBridgeAtom, failure, readOnly, viewAsAtom, viewedAtom } from './state';
import { FRESH_CODE_ERROR } from '../../../../types/twoFactor';

/** `choice`: the text is a tapped button's prompt, not words the person typed. */
type Request = { text: string; choice?: true } | { shortcut: AssistantShortcut } | { interaction: Interaction };
export type WorkspaceController = ReturnType<typeof useAssistantWorkspace>;
/** One turn of the conversation: the words it answered, HOTBOT's card as it stands, and `fresh` when the answer came back to this tab, so it
 *  may point at Settings rows and put a plainly asked change in the draft. */
export type Turn = { id: string; asked: string | null; result: AssistantResult; fresh: boolean };
/** Turns the dock reads first, and adds each time the reader scrolls up to the oldest. */
const PAGE = 6;

/** HOTBOT's conversation in the selected portfolio and the one request controller for it: the saved turns, read only while the dock is open,
 *  then what was just sent until the thread holds it. */
export function useAssistantWorkspace(data: HomeData, focus: Focus, open: boolean) {
  const ask = useAction(api.team.ask), viewed = useAtomValue(viewedAtom), as = useAtomValue(viewAsAtom), screen = useAtomValue(draftBridgeAtom);
  const pages = usePaginatedQuery(api.team.assistant.thread, open ? { mode: data.workspace.mode, ...as } : 'skip', { initialNumItems: PAGE });
  // The plan open in chat, which may be older than the turns read: its turn is the one whose plan buttons act.
  const plan = useQuery(api.team.assistant.planTurn, open ? { mode: data.workspace.mode, ...as } : 'skip') ?? null;
  const [busy, setBusy] = useState(false), [error, setError] = useState<ReturnType<typeof failure> | null>(null);
  // The request on its way: its words, or the revision of the card a tap acted on (`tapped`).
  const [pending, setPending] = useState<{ asked: string | null; tapped?: number } | null>(null);
  // The last answer that came back to this tab (`at`: when), shown until the thread holds it and kept until the next one comes back, so a failed
  // request leaves it as it was. `tapped`: it is a new version of that card; `pin`: that card was the open plan pinned outside the turns read;
  // `local` (the readability filter's refusal) is never saved.
  const [answer, setAnswer] = useState<{ asked: string | null; result: AssistantResult; at: number; tapped?: number; pin?: { id: string; asked: string | null }; local?: true } | null>(null);
  const inFlight = useRef(false), retry = useRef<{ request: Request; id: string } | null>(null);
  const turns = useMemo(() => {
    const saved: Turn[] = pages.results.map(row => ({ id: row.id, asked: row.asked, result: row.result, fresh: false })).reverse();
    if (!answer) return saved;
    if (answer.local) return [...saved, { id: 'local', asked: answer.asked, result: answer.result, fresh: false }];
    const same = (turn: Turn) => turn.result.sessionId === answer.result.sessionId;
    // Saved already, or overtaken: only the turn it became is fresh, never a newer one another tab added.
    if (saved.some(turn => same(turn) && turn.result.revision >= answer.result.revision)) return saved.map(turn => same(turn) && turn.result.revision === answer.result.revision ? { ...turn, fresh: true } : turn);
    const shown = { id: 'sent', asked: answer.asked, result: answer.result, fresh: true };
    // A tap's answer takes its card's place; any other answer is a new turn.
    return answer.tapped === undefined ? [...saved, shown] : saved.map(turn => same(turn) && turn.result.revision === answer.tapped ? { ...shown, id: turn.id, asked: turn.asked } : turn);
  }, [pages.results, answer]);
  // The open plan when it is older than the turns read, shown apart from them; a tap on it shows its answer there (a Create's receipt, a
  // closed plan) until the thread holds that turn or the next answer comes back.
  const pinned = useMemo((): Turn | null => {
    if (answer?.pin && !turns.some(turn => turn.id === answer.pin!.id)) return { ...answer.pin, result: answer.result, fresh: true };
    if (!plan || turns.some(turn => turn.id === plan.id || (turn.result.sessionId === plan.result.sessionId && turn.result.revision === plan.result.revision))) return null;
    return { ...plan, fresh: false };
  }, [turns, plan, answer]);
  const run = async (request: Request, requestId = crypto.randomUUID()) => {
    if (inFlight.current) return false;
    // HOTBOT works for the admin's own team, so it stays quiet while an admin views someone else's.
    if (viewed) { setError({ message: readOnly(viewed), detail: null, fault: false, call: null }); retry.current = null; return false; }
    // Gibberish is refused on the spot.
    if ('text' in request && unreadable(request.text)) {
      setError(null); retry.current = null;
      const newest = turns.at(-1)?.result;
      setAnswer({ asked: request.text, result: { kind: 'workspace', sessionId: newest?.sessionId ?? '', revision: newest?.revision ?? 0, ...UNREADABLE, card: { kind: 'capabilities' }, route: 'filter' }, at: Date.now(), local: true });
      return true;
    }
    const tapped = 'interaction' in request ? { tapped: request.interaction.revision, ...(pinned && pinned.result.revision === request.interaction.revision ? { pin: { id: pinned.id, asked: pinned.asked } } : {}) } : {};
    const asked = 'text' in request ? request.text : 'shortcut' in request ? CAPABILITIES.find(row => row.id === request.shortcut)?.title ?? null : null;
    inFlight.current = true; setBusy(true); setError(null); retry.current = { request, id: requestId };
    setPending({ asked, ...tapped });
    // The filter's refusal is never saved, so it gives way to the request that follows it.
    setAnswer(previous => previous?.local ? null : previous);
    try {
      // On the Lab, and while a strategy's Settings is open, every request carries the draft and what is on screen, so HOTBOT plans against it.
      const context = screen?.context() ?? null, shown = !context ? {} : screen?.page === 'settings' ? { settings: context } : focus.page === 'lab' ? { lab: context } : {};
      const result = await ask({ requestId, focus, ...('interaction' in request ? { interaction: JSON.stringify(request.interaction) } : request), ...shown });
      setAnswer({ asked, result, at: Date.now(), ...tapped });
      retry.current = null;
      return true;
    } catch (cause) {
      // A Real SOL step that needs a fresh two-factor code asks for it, then sends the request again.
      if (failure(cause).message === FRESH_CODE_ERROR) { void askFreshCode().then(entered => { if (entered) retryRequest(); else setError(failure(cause)); }); return false; }
      setError(failure(cause)); return false;
    }
    finally { inFlight.current = false; setBusy(false); setPending(null); }
  };
  const retryRequest = () => { if (retry.current) void run(retry.current.request, retry.current.id); };
  const clearError = () => { setError(null); retry.current = null; };
  // The words on their way show under the thread until their answer comes back; a tap waits on its card instead.
  const asking = pending && pending.tapped === undefined ? pending.asked : null, answeredAt = answer && answer.tapped === undefined ? answer.at : null;
  return { turns, pinned, plan, status: pages.status, more: () => pages.loadMore(PAGE), asking, answeredAt, tapped: pending?.tapped ?? null, busy, error, run, retryRequest, clearError };
}
