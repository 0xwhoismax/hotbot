"use client";
import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAtom, useSetAtom } from 'jotai';
import { LoaderCircle, Mic, RotateCcw, Search, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { AppFlame } from '@/components/hotbot/AppFlame';
import { useDictation } from '@/hooks/useDictation';
import type { AssistantResult, AssistantShortcut, Focus, Interaction } from '../../../../types/teamAssistant';
import type { HomeData } from './data';
import { FirstTip, useNow } from './Parts';
import { Paged } from './Stream';
import { useCapacity } from './Limits';
import { checkCoinAtom, dockOpenAtom } from './state';
import { useAssistantWorkspace, type Turn, type WorkspaceController } from './useAssistantWorkspace';
import s from './team.module.css';

export type { Focus } from '../../../../types/teamAssistant';

// The answer cards (plans, settings, decisions) load the first time the conversation opens, not with every page.
const AssistantWorkspace = dynamic(() => import('./AssistantWorkspace').then(module => module.AssistantWorkspace), { ssr: false });

/** HOTBOT in the corner: a flame disc that peeks its live status on hover and opens into the conversation over the two-row composer.
 *  Phones have no disc: the bottom bar's Ask button opens it over a dimmed page, and the bar steps aside while it is open. */
export function Dock({ data, focus }: { data: HomeData; focus: Focus }) {
  return <DockBar key={data.workspace.mode + (focus.strategyId ?? focus.itemId ?? focus.page)} data={data} focus={focus}/>;
}

/** What the team is doing right now in the composer's scope, in one line, and whether it is actively working. */
function liveTask(data: HomeData, strategyId?: string) {
  const mine = <T extends { strategyId: string }>(rows: T[]) => strategyId ? rows.filter(row => row.strategyId === strategyId) : rows;
  const running = (strategyId ? data.strategies.filter(row => row.id === strategyId) : data.strategies).some(row => row.status === 'running');
  const [checking] = mine(data.researching), [waiting] = mine(data.watching), held = mine(data.bags).length;
  if (data.workspace.halted) return { text: 'Team stopped', live: false };
  if (!data.worker.online) return { text: 'Reconnecting', live: false };
  if (!data.worker.liveView) return { text: 'Live view down', live: false };
  const text = checking ? `ResearchBot checking ${checking.token.symbol}` : waiting ? `SniperBot waiting to buy ${waiting.token.symbol}`
    : held ? `TraderBot holding ${held} ${held === 1 ? 'coin' : 'coins'}` : running ? 'Scanning for new coins' : 'Team paused';
  return { text, live: running || !!checking || !!waiting || held > 0 };
}

function DockBar({ data, focus }: { data: HomeData; focus: Focus }) {
  const item = [...data.bags, ...data.watching, ...data.needs, ...data.researching].find(row => row.id === focus.itemId);
  const [scope, setScope] = useState(focus.strategyId ?? item?.strategyId ?? (data.strategies.length === 1 ? data.strategies[0].id : 'all'));
  const [open, setOpen] = useAtom(dockOpenAtom), dock = useRef<HTMLDivElement>(null), orb = useRef<HTMLButtonElement>(null), now = useNow();
  // The Lab plans the draft on screen, whatever the picker held elsewhere.
  const page = focus.page === 'lab' ? focus : { ...focus, strategyId: scope === 'all' ? undefined : scope };
  const workspace = useAssistantWorkspace(data, page, open);
  const needs = data.needs.length, task = liveTask(data, page.strategyId), full = useCapacity(orb);
  const acted = Object.values(data.team.acted).some(at => at != null && now > 0 && now - at < 90_000);
  const expand = () => setOpen(true);
  // `/` opens HOTBOT from anywhere; Escape or a click elsewhere tucks it back into the disc (the draft and workspace stay).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null, typing = target?.closest('input, textarea, select, [contenteditable=true]');
      if (!open && event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); expand(); }
      if (open && event.key === 'Escape' && dock.current?.contains(target)) { setOpen(false); orb.current?.focus(); }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (open && !dock.current?.contains(target) && !target.closest('[role=dialog], [role=listbox], [data-radix-popper-content-wrapper]')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, setOpen]);
  // However it opens (the disc, `/`, the phone bar's Ask button), the composer takes the focus.
  useEffect(() => { if (open) dock.current?.querySelector('textarea')?.focus(); }, [open]);
  const status = needs ? <span className={s.warnText}>{needs} {needs === 1 ? 'buy needs' : 'buys need'} you</span> : task.text;
  return <div ref={dock} className={s.dock} data-open={open || undefined}>
    <span className={s.dockScrim} aria-hidden onClick={() => setOpen(false)}/>
    <button ref={orb} type="button" className={s.orb} data-acted={acted || workspace.busy || undefined} data-capacity={full ? '' : undefined} onClick={expand} tabIndex={open ? -1 : undefined} aria-hidden={open || undefined} aria-label={needs ? `Open HOTBOT, ${needs} need you` : 'Open HOTBOT'} aria-keyshortcuts="/">
      <span className={s.orbPeek} role={full ? 'status' : undefined}>{full ? <><b>{full.title}</b><small>{full.detail}</small></> : <><b data-live={(!needs && task.live) || undefined}>{status}</b><small>Ask HOTBOT…</small></>}</span>
      {/* The disc sits in the page's bottom-right corner, so with no cursor to follow it looks up and left, into the page. */}
      <span className={s.orbFace}>
        <AppFlame size={40} faceLeft rest={[-0.8, -0.6]} mood={full ? 'shy' : undefined}/>
        {needs > 0 && <span className={s.orbBadge}>{needs}</span>}
      </span>
    </button>
    <FirstTip id="chat" anchor={orb} side="top" align="end" title="Chat with HOTBOT" text="Ask about your team, your coins or a strategy. Try it, try to break it, and tell us what you think."/>
    {/* A link in an answer (a strategy, a coin) takes the person there, so the composer tucks away. */}
    <div className={s.dockPanel} aria-hidden={!open || undefined} onClick={event => { if ((event.target as Element).closest('a')) setOpen(false); }}>
      <CommandBar data={data} focus={page} scope={scope} onScope={setScope} workspace={workspace} open={open}/>
    </div>
  </div>;
}

function CommandBar({ data, focus, scope, onScope, workspace, open }: { data: HomeData; focus: Focus; scope: string; onScope: (id: string) => void; workspace: WorkspaceController; open: boolean }) {
  const openCheck = useSetAtom(checkCoinAtom);
  const item = [...data.bags, ...data.watching, ...data.needs, ...data.researching].find(row => row.id === focus.itemId);
  const [text, setText] = useState(''), [hidden, setHidden] = useState(false);
  const scoped = data.strategies.find(row => row.id === scope);
  const { turns, pinned, plan, status, more, asking, answeredAt, tapped, busy, error, run, retryRequest } = workspace, newest = turns.at(-1), tapping = tapped !== null;
  // The open plan's turn: by its row, or by its version while a new plan's turn is on its way into the thread.
  const isPlan = (turn: Turn) => plan !== null && (turn.id === plan.id || (turn.result.sessionId === plan.result.sessionId && turn.result.revision === plan.result.revision));
  const submit = async (input: string) => {
    const value = input.trim();
    if (!value) return;
    setHidden(false);
    if (await run({ text: value })) setText(previous => previous.trim() === value ? '' : previous);
  };
  const interact = (interaction: Interaction) => void run({ interaction });
  const choose = (prompt: string) => { setHidden(false); void run({ text: prompt, choice: true }); };
  // The newest answer's buttons act, but a plan's only while it is the open one, wherever it sits.
  const acts = (turn: Turn, latest: boolean) => ({ ...(latest ? { onPrompt: choose, onShortcut: (shortcut: AssistantShortcut) => void run({ shortcut }) } : {}), ...((latest && turn.result.card.kind !== 'draft') || isPlan(turn) ? { onInteract: interact } : {}) });
  // Spoken words land after what is typed, to read and edit; only Send sends them.
  const dictation = useDictation(words => setText(previous => previous.trim() ? `${previous.trimEnd()} ${words}` : words));
  const voice = dictation.state === 'listening' ? 'Listening…' : dictation.state === 'working' ? 'Writing it down…' : null;
  // Tucking the composer away ends a clip, so the microphone never records out of sight.
  const { stop } = dictation;
  useEffect(() => { if (!open) stop(); }, [open, stop]);
  const shown = !hidden && (turns.length > 0 || pinned !== null || status === 'CanLoadMore' || busy || Boolean(error)), loaded = status !== 'LoadingFirstPage';
  // The conversation opens at its newest turn, and each answer that comes back shows from its start (the person's words, then HOTBOT's); words
  // on their way show at the end. Older turns page in above as the reader scrolls up.
  const scroll = useRef<HTMLDivElement>(null), last = useRef<HTMLElement>(null), placed = useRef(false);
  const toNewest = () => {
    const box = scroll.current;
    let top = 0;
    for (let node: HTMLElement | null = last.current; node && node !== box; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
    if (box && last.current) box.scrollTop = top;
  };
  useLayoutEffect(() => {
    if (!open) placed.current = false;
    else if (shown && loaded && !placed.current) { placed.current = true; toNewest(); }
  }, [open, shown, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (answeredAt) toNewest(); }, [answeredAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Words on their way show at the end of the thread, above the open plan kept apart from it.
  const sending = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = scroll.current, row = sending.current;
    if (busy && !tapping && box && row) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [busy, tapping]);
  const feedback = error && <div className={s.workspaceError} role="alert"><span>{error.message}{error.detail && <code>{error.detail}</code>}</span><Button size="xs" variant="outline" disabled={busy} onClick={retryRequest}><RotateCcw/>Try again</Button></div>;
  return <div className={s.commandWrap}>
    {shown && <section className={s.workspaceShell} aria-label="HOTBOT conversation" aria-busy={busy}>
      <header className={s.workspaceBar}><span><BotAvatar role="coordinator" size={20}/><b>HOTBOT</b><small>{busy ? 'Working on it' : newest?.result.card.kind === 'draft' ? 'Strategy studio' : focus.page === 'lab' ? 'Planning in the Lab' : 'Workspace'}</small></span><button type="button" className={s.workspaceClose} aria-label="Close workspace" onClick={() => setHidden(true)}><X size={16}/></button></header>
      <div ref={scroll} className={s.workspaceScroll} role="log">
        {(turns.length > 0 || status === 'CanLoadMore') && <Paged edge="start" status={status} onMore={more}>
          {/* The newest turn keeps one key, so an answer that lands in the saved thread stays the same card. */}
          {turns.map((turn, index) => { const latest = index === turns.length - 1; return <article key={latest ? 'newest' : turn.id} ref={latest ? last : undefined} className={s.workspaceTurn} data-busy={turn.result.revision === tapped || undefined}>
            {turn.asked && <p className={s.folioChatMine}>{turn.asked}</p>}
            <SavedCard result={turn.result}><AssistantWorkspace result={turn.result} busy={busy} fresh={turn.fresh} {...acts(turn, latest)}/></SavedCard>
          </article>; })}
        </Paged>}
        {busy && !tapping && <div ref={sending} className={s.workspaceTurn}>
          {asking && <p className={s.folioChatMine} data-pending>{asking}</p>}
          <div className={s.workspaceLoading} role="status"><LoaderCircle size={20} className="animate-spin"/><span>Working…</span></div>
        </div>}
        {feedback}
        {/* The open plan older than the turns read sits under its own label after the thread, out of its time order, so it never sits where
            older pages load and doesn't move while the reader acts on it. */}
        {pinned && <section className={`${s.workspaceTurn} ${s.workspacePinned}`} aria-label="Open plan" data-busy={pinned.result.revision === tapped || undefined}>
          <h3 className={s.label}>{isPlan(pinned) ? 'Open plan' : 'Plan'}</h3>
          <SavedCard result={pinned.result}><AssistantWorkspace result={pinned.result} busy={busy} fresh={pinned.fresh} {...acts(pinned, false)}/></SavedCard>
        </section>}
      </div>
      {tapping && <footer className={s.workspaceFoot}><LoaderCircle size={12} className="animate-spin"/>Updating…</footer>}
    </section>}
    <form className={s.chatComposer} onSubmit={event => { event.preventDefault(); submit(text); }}>
      {/* What a command changes, read before it is sent: every strategy or the one picked. The Lab plans the draft on screen. */}
      {focus.page !== 'lab' && <div className={s.composerScope}><Select value={scope} onValueChange={value => { onScope(value); setHidden(false); workspace.clearError(); }} disabled={busy}>
        <SelectTrigger size="sm" className={s.scope} aria-label="What your command changes"><BotAvatar role="coordinator" size={18}/><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="all">All strategies</SelectItem>{data.strategies.map(row => <SelectItem key={row.id} value={row.id}>{row.name}{row.status === 'paused' ? ' · paused' : ''}</SelectItem>)}</SelectContent>
      </Select></div>}
      <Textarea variant="composer" value={text} maxLength={2000} onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(text); } }}
        placeholder={focus.page === 'lab' ? 'Plan this draft with HOTBOT: ask why, or what to change…' : plan && !hidden ? 'Describe your strategy or refine this plan…' : item ? `Ask about ${item.token.symbol} or tell HOTBOT what to do…` : scoped && focus.page === 'strategy' ? `Change ${scoped.name} or ask about it…` : 'Describe a strategy or ask your team…'} aria-label="Tell HOTBOT"/>
      <div className={s.composerTools}>
        <span className={s.toolsRight}>
          {voice && <span className={s.voiceStatus} role="status">{voice}</span>}
          <Button size="icon" variant="ghost" type="button" className={s.mic} data-state={dictation.state} aria-pressed={dictation.state === 'listening'} disabled={dictation.state === 'working'}
            aria-label={dictation.state === 'listening' ? 'Stop and write it down' : 'Talk to HOTBOT'} title={dictation.state === 'listening' ? 'Stop and write it down' : 'Talk to HOTBOT'}
            onClick={dictation.state === 'listening' ? dictation.stop : () => void dictation.start()}>{dictation.state === 'working' ? <LoaderCircle className="animate-spin"/> : dictation.state === 'listening' ? <Square fill="currentColor"/> : <Mic/>}</Button>
          <Button size="icon" variant="ghost" aria-label="Check a coin" title="Check a coin" type="button" onClick={() => openCheck({ strategyId: scoped?.id })}><Search/></Button><Button className="rounded-full px-4" aria-label="Send" disabled={!text.trim() || busy} type="submit">{busy ? <LoaderCircle className="animate-spin"/> : 'Send'}</Button></span>
      </div>
    </form>
  </div>;
}

const version = (result: AssistantResult) => `${result.sessionId}:${result.revision}`;
/** A saved card that no longer renders (a shape from older code) shows its heading and words alone, and says so in the console; its next
 *  version, or the next card in its place, renders again. `failed`: the version that failed, '' until `componentDidCatch` names it. */
class SavedCard extends Component<{ result: AssistantResult; children: ReactNode }, { failed: string | null }> {
  state: { failed: string | null } = { failed: null };
  static getDerivedStateFromError() { return { failed: '' }; }
  componentDidCatch(error: Error) { console.error('HOTBOT card did not render', version(this.props.result), this.props.result.card.kind, error); this.setState({ failed: version(this.props.result) }); }
  render() {
    const { failed } = this.state;
    return failed === '' || failed === version(this.props.result) ? <AssistantWorkspace result={{ ...this.props.result, card: { kind: 'insight', facts: [], choices: [] } }}/> : this.props.children;
  }
}
