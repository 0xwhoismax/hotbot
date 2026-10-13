"use client";
import { useEffect, useRef, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { LoaderCircle, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { Hotbot } from '@/components/hotbot/Hotbot';
import type { Focus, Interaction } from '../../../../types/teamAssistant';
import type { HomeData } from './data';
import { AssistantWorkspace } from './AssistantWorkspace';
import { FirstTip, useNow } from './Parts';
import { checkCoinAtom, dockOpenAtom } from './state';
import { useAssistantWorkspace, type WorkspaceController } from './useAssistantWorkspace';
import s from './team.module.css';

export type { Focus } from '../../../../types/teamAssistant';

/** HOTBOT in the corner: a flame disc that peeks its live status on hover and opens into the two-row composer. Follow-ups update the workspace above it in place.
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
  const workspace = useAssistantWorkspace(data, page);
  const needs = data.needs.length, task = liveTask(data, page.strategyId);
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
    <button ref={orb} type="button" className={s.orb} data-acted={acted || workspace.busy || undefined} onClick={expand} tabIndex={open ? -1 : undefined} aria-hidden={open || undefined} aria-label={needs ? `Open HOTBOT, ${needs} need you` : 'Open HOTBOT'} aria-keyshortcuts="/">
      <span className={s.orbPeek}><b data-live={(!needs && task.live) || undefined}>{status}</b><small>Ask HOTBOT…</small></span>
      <span className={s.orbFace}>
        <Hotbot shape="flame" color="#f47a38" size={40}/>
        {needs > 0 && <span className={s.orbBadge}>{needs}</span>}
      </span>
    </button>
    <FirstTip id="chat" anchor={orb} side="top" align="end" title="Chat with HOTBOT" text="Ask about your team, your coins or a strategy. Try it, try to break it, and tell us what you think."/>
    {/* A link in an answer (a strategy, a coin) takes the person there, so the composer tucks away. */}
    <div className={s.dockPanel} aria-hidden={!open || undefined} onClick={event => { if ((event.target as Element).closest('a')) setOpen(false); }}>
      <CommandBar data={data} focus={page} scope={scope} onScope={setScope} workspace={workspace}/>
    </div>
  </div>;
}

function CommandBar({ data, focus, scope, onScope, workspace }: { data: HomeData; focus: Focus; scope: string; onScope: (id: string) => void; workspace: WorkspaceController }) {
  const openCheck = useSetAtom(checkCoinAtom);
  const item = [...data.bags, ...data.watching, ...data.needs, ...data.researching].find(row => row.id === focus.itemId);
  const [text, setText] = useState(''), [hidden, setHidden] = useState(false);
  const scoped = data.strategies.find(row => row.id === scope);
  const { result, busy, error, run, retryRequest } = workspace;
  const submit = async (input: string) => {
    const value = input.trim();
    if (!value) return;
    setHidden(false);
    if (await run({ text: value })) setText(previous => previous.trim() === value ? '' : previous);
  };
  const interact = (interaction: Interaction) => void run({ interaction: JSON.stringify(interaction) });
  const feedback = error && <div className={s.workspaceError} role="alert"><span>{error.message}{error.detail && <code>{error.detail}</code>}</span><Button size="xs" variant="outline" disabled={busy} onClick={retryRequest}><RotateCcw/>Try again</Button></div>;
  return <div className={s.commandWrap}>
    {!hidden && (result || busy || error) && <section className={s.workspaceShell} aria-label="HOTBOT workspace" aria-busy={busy}>
      <header className={s.workspaceBar}><span><BotAvatar role="coordinator" size={20}/><b>HOTBOT</b><small>{busy ? 'Working on it' : result?.card.kind === 'preset' ? 'Strategy studio' : focus.page === 'lab' ? 'Planning in the Lab' : 'Workspace'}</small></span><button type="button" className={s.workspaceClose} aria-label="Close workspace" onClick={() => setHidden(true)}><X size={16}/></button></header>
      <div className={s.workspaceScroll}>
        {result && <AssistantWorkspace key={result.sessionId} result={result} busy={busy} onPrompt={submit} onShortcut={shortcut => void run({ shortcut })} onInteract={interact}/>}
        {busy && !result && <div className={s.workspaceLoading} role="status"><LoaderCircle size={20} className="animate-spin"/><span>Working…</span></div>}
        {feedback}
      </div>
      {result && busy && <footer className={s.workspaceFoot}><LoaderCircle size={12} className="animate-spin"/>Updating…</footer>}
    </section>}
    <form className={s.chatComposer} onSubmit={event => { event.preventDefault(); submit(text); }}>
      <Textarea variant="composer" value={text} maxLength={2000} onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(text); } }}
        placeholder={focus.page === 'lab' ? 'Plan this draft with HOTBOT: ask why, or what to change…' : result?.card.kind === 'preset' && !hidden ? 'Describe your strategy or refine this plan…' : item ? `Ask about ${item.token.symbol} or tell HOTBOT what to do…` : scoped && focus.page === 'strategy' ? `Change ${scoped.name} or ask about it…` : 'Describe a strategy or ask your team…'} aria-label="Tell HOTBOT"/>
      <div className={s.composerTools}>
        <div className={s.toolsLeft}>
          {focus.page !== 'lab' && <Select value={scope} onValueChange={value => { onScope(value); setHidden(false); workspace.clearError(); }} disabled={busy}>
            <SelectTrigger size="sm" className={s.scope} aria-label="What your command changes"><BotAvatar role="coordinator" size={18}/><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem>{data.strategies.map(row => <SelectItem key={row.id} value={row.id}>{row.name}{row.status === 'paused' ? ' · paused' : ''}</SelectItem>)}</SelectContent>
          </Select>}
        </div>
        <span className={s.toolsRight}><Button size="icon" variant="ghost" aria-label="Check a coin" title="Check a coin" type="button" onClick={() => openCheck({ strategyId: scoped?.id })}><Search/></Button><Button className="rounded-full px-4" aria-label="Send" disabled={!text.trim() || busy} type="submit">{busy ? <LoaderCircle className="animate-spin"/> : 'Send'}</Button></span>
      </div>
    </form>
  </div>;
}
