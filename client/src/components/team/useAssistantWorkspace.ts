"use client";
import { useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { atom, useAtom, useAtomValue } from 'jotai';
import { api } from '@/lib/convex';
import { currentUserIdAtom } from '@/store/user/atoms';
import { unreadable, UNREADABLE, type AssistantResult, type AssistantShortcut, type Focus } from '../../../../types/teamAssistant';
import type { HomeData } from './data';
import { draftBridgeAtom, failure, readOnly, viewedAtom } from './state';

const workspacesAtom = atom<Record<string, AssistantResult>>({});
type Request = { text: string } | { shortcut: AssistantShortcut } | { interaction: string };
export type WorkspaceController = ReturnType<typeof useAssistantWorkspace>;

/** One request controller for the composer and its result, wherever that result is rendered. */
export function useAssistantWorkspace(data: HomeData, focus: Focus) {
  const ask = useAction(api.team.ask), userId = useAtomValue(currentUserIdAtom), viewed = useAtomValue(viewedAtom), screen = useAtomValue(draftBridgeAtom);
  const [workspaces, setWorkspaces] = useAtom(workspacesAtom);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ReturnType<typeof failure> | null>(null);
  const inFlight = useRef(false), retry = useRef<{ request: Request; id: string; sessionId?: string } | null>(null);
  const key = [userId, data.workspace.mode, focus.page, focus.strategyId ?? '', focus.itemId ?? ''].join(':');
  const result = workspaces[key];
  const run = async (request: Request, source?: AssistantResult, requestId = crypto.randomUUID(), sessionId = source?.sessionId) => {
    if (inFlight.current) return false;
    // HOTBOT works for the admin's own team, so it stays quiet while an admin views someone else's.
    if (viewed) { setError({ message: readOnly(viewed), detail: null, fault: false, call: null }); retry.current = null; return false; }
    // Gibberish is refused on the spot.
    if ('text' in request && unreadable(request.text)) {
      setError(null); retry.current = null;
      setWorkspaces(previous => ({ ...previous, [key]: { kind: 'workspace', sessionId: previous[key]?.sessionId ?? '', revision: previous[key]?.revision ?? 0, ...UNREADABLE, card: { kind: 'capabilities' }, route: 'filter' } }));
      return true;
    }
    inFlight.current = true; setBusy(true); setError(null); retry.current = { request, id: requestId, sessionId };
    try {
      // On the Lab, and while a strategy's Settings is open, every request carries the draft and what is on screen, so HOTBOT plans against it.
      const context = screen?.context() ?? null, sent = !context ? {} : screen?.page === 'settings' ? { settings: context } : focus.page === 'lab' ? { lab: context } : {};
      const next = await ask({ requestId, focus, sessionId, ...request, ...sent });
      setWorkspaces(previous => previous[key]?.sessionId === next.sessionId && previous[key].revision > next.revision ? previous : { ...previous, [key]: next });
      retry.current = null;
      return true;
    } catch (cause) { setError(failure(cause)); return false; }
    finally { inFlight.current = false; setBusy(false); }
  };
  const retryRequest = () => { if (retry.current) void run(retry.current.request, undefined, retry.current.id, retry.current.sessionId); };
  const clearError = () => { setError(null); retry.current = null; };
  return { result, busy, error, run, retryRequest, clearError };
}
