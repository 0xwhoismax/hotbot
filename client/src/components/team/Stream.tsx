"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { plainReason } from './Decision';
import { useMutation, type PaginationStatus } from 'convex/react';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { Archive, ArchiveRestore, Check, ChevronRight, HelpCircle, ListFilter, LoaderCircle, Minus, Pause, Play, Settings2, Trash2, User, Wallet, X } from 'lucide-react';
import { api, usePaginatedQuery } from '@/lib/convex';
import { useTabVisible } from '@/hooks/useTabVisible';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { QUEUE, type Command } from '../../../../types/team';
import type { AgentRole } from '../../../../types/hotbot';
import { change, type Bag, type HomeData } from './data';
import { ago, appHref, pct, sol, signedSol, tone } from './format';
import { CoinPill, DecisionDialog, Loading } from './Parts';
import { alertAction } from './AlertToast';
import { CopyError } from './Report';
import { failToast, readOnly, useCommand, viewAsAtom, viewedAtom, type ShownError } from './state';
import { SignedPercentText } from './SignedPercentText';
import { usePriceDisplay } from '@/hooks/usePriceDisplay';
import s from './team.module.css';

export type StreamEvent = FunctionReturnType<typeof api.team.activity>['page'][number];
/** A feed row: one event, a run of scans (`group`), one coin's events newest first (`trail`), or a run of queued coins (`queue`). */
type Row = StreamEvent & { group?: StreamEvent[]; trail?: StreamEvent[]; queue?: Row[] };
export type Show = NonNullable<FunctionArgs<typeof api.team.activity>['show']>;

/** The feed's views: everything, one bot's rows or one kind of trade, each with the face its rows carry. */
const SHOWS: { value: Show | 'all'; label: string; bot?: AgentRole }[] = [
  { value: 'all', label: 'All' }, { value: 'research', label: 'Research', bot: 'research' }, { value: 'buys', label: 'Buys', bot: 'trader' }, { value: 'sells', label: 'Sells', bot: 'trader' }, { value: 'hotbot', label: 'HOTBOT', bot: 'coordinator' },
];
const SHOW_EMPTY: Record<Show, string> = { research: 'ResearchBot hasn’t checked a coin yet.', buys: 'No buys yet.', sells: 'No sells yet.', hotbot: 'Nothing from HOTBOT yet. It speaks up when something needs a look.' };

/** The dropdown in the top-right corner of a feed's header that picks what it shows (the feed reads only that view).
 *  `iconOnly` is a round button for a tab bar, lit while a view is picked. */
export function ActivityFilter({ value, onChange, iconOnly }: { value?: Show; onChange: (show?: Show) => void; iconOnly?: boolean }) {
  const picker = <Select value={value ?? 'all'} onValueChange={next => onChange(next === 'all' ? undefined : next as Show)}>
    <SelectTrigger size="sm" className={iconOnly ? s.feedIcon : s.feedFilter} data-active={iconOnly && value || undefined} aria-label="Show activity">{iconOnly ? <><ListFilter/><span className="sr-only"><SelectValue/></span></> : <SelectValue/>}</SelectTrigger>
    <SelectContent position="popper" align="end">{SHOWS.map(row => <SelectItem key={row.value} value={row.value}>{row.bot ? <BotAvatar role={row.bot} size={16}/> : <ListFilter size={14}/>}{row.label}</SelectItem>)}</SelectContent>
  </Select>;
  return iconOnly ? picker : <div className={s.feedControls}>{picker}</div>;
}

/** The picks a full queue let go, listed on one SniperBot row. */
const cut = (event: StreamEvent) => event.kind === 'expired' && !event.itemId && event.turnedDownTotal > 0;
/** A coin's own steps from research to sale; HOTBOT's notes, second opinions and proposals about it stay rows of their own. */
const COIN_STEPS = new Set<StreamEvent['kind']>(['found', 'passed', 'armed', 'queued', 'approval', 'bought', 'sold', 'expired', 'skipped', 'blocked', 'failed']);
/** One row per coin: its newest step holds the row's place and its older steps fold into `trail`, across every page loaded so far, so a coin
 *  never shows twice. Consecutive scans from the same strategy collapse into one row with every coin they turned down, and a run of coins
 *  waiting for room into one queue row. */
function group(events: StreamEvent[]): Row[] {
  const rows: Row[] = [], coins = new Map<string, Row>();
  const chatter = (event: StreamEvent) => event.kind === 'found' && !event.itemId;
  for (const event of events) {
    if (event.itemId && COIN_STEPS.has(event.kind)) {
      const row = coins.get(event.itemId);
      if (row) row.trail!.push(event);
      else { const next = { ...event, trail: [event] }; coins.set(event.itemId, next); rows.push(next); }
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && chatter(event) && chatter(last) && last.strategyId === event.strategyId && last.at - event.at < 20 * 60_000) { (last.group ??= [last]).push(event); continue; }
    rows.push({ ...event });
  }
  const out: Row[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (row.kind === 'queued' && last?.kind === 'queued') { if (last.queue) last.queue.push(row); else out[out.length - 1] = { ...last, itemId: null, trail: undefined, queue: [last, row] }; continue; }
    out.push(row);
  }
  return out;
}
/** How far a coin got: picked, bought, sold. */
const reached = (trail: StreamEvent[], held: boolean) => {
  const kinds = new Set(trail.map(event => event.kind));
  const bought = held || kinds.has('bought') || kinds.has('sold');
  return { picked: bought || kinds.has('passed') || kinds.has('armed') || kinds.has('queued') || kinds.has('approval'), bought, sold: kinds.has('sold') };
};

const PAGE = 40;

/** One portfolio's feed newest first: everything since the practice reset, then the team-level activity before it, a page at a time.
 *  A filtered view is one range of its own, with no earlier part. A hidden tab lets go of the feed and keeps showing what it had; coming back reloads it from the newest page. */
function useActivity(scope: { mode: HomeData['workspace']['mode']; strategyId?: string; team?: true; show?: Show }, skip = false) {
  const as = useAtomValue(viewAsAtom), args = { ...scope, ...as }, visible = useTabVisible() && !skip, key = JSON.stringify(args);
  const recent = usePaginatedQuery(api.team.activity, visible ? args : 'skip', { initialNumItems: PAGE });
  const tail = recent.status === 'Exhausted' && !args.show, older = usePaginatedQuery(api.team.activity, visible && tail ? { ...args, earlier: true } : 'skip', { initialNumItems: PAGE });
  const live = useMemo(() => recent.status === 'LoadingFirstPage' ? undefined : tail ? [...recent.results, ...older.results] : recent.results, [recent.status, recent.results, older.results, tail]);
  const [kept, setKept] = useState<{ key: string; events: StreamEvent[] }>();
  if (live && (kept?.key !== key || kept.events !== live)) setKept({ key, events: live });
  return { events: live ?? (kept?.key === key ? kept.events : undefined), status: tail ? older.status : recent.status, more: () => (tail ? older : recent).loadMore(PAGE) };
}

/** A list that loads its next page as the reader nears its end (its top for oldest-first feeds), in whichever pane scrolls it. */
export function Paged({ status, onMore, edge = 'end', className, ref, children }: { status: PaginationStatus; onMore: () => void; edge?: 'start' | 'end'; className?: string; ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  const zone = useRef<HTMLSpanElement>(null), more = useRef(onMore), done = status === 'Exhausted';
  useLayoutEffect(() => { more.current = onMore; });
  // A fresh observer each time a page lands measures the list as it is now: short or collapsed pages keep loading, a full pane waits for the reader.
  useEffect(() => {
    if (status !== 'CanLoadMore' || !zone.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) more.current(); });
    observer.observe(zone.current);
    return () => observer.disconnect();
  }, [status]);
  // Above an oldest-first feed the row keeps its space while more can load, so rows never shift as loading starts.
  const busy = status === 'LoadingMore' || status === 'LoadingFirstPage', loading = (busy || (edge === 'start' && !done)) && <p className={s.pageLoading} role="status">{busy && <><LoaderCircle size={14} className="motion-safe:animate-spin"/>Loading more</>}</p>;
  return <div ref={ref} className={`${s.paged} ${className ?? ''}`}>
    {edge === 'start' && loading}{children}{edge === 'end' && loading}
    {!done && <span ref={zone} className={s.pageZone} data-edge={edge} aria-hidden/>}
  </div>;
}

const shows = (event: StreamEvent, show: Show) => show === 'research' ? event.actor === 'research' : show === 'hotbot' ? event.actor === 'coordinator' : event.kind === (show === 'buys' ? 'bought' : 'sold');

export function Stream({ data, strategyId, show, replay, empty = 'Your team’s moves show up here.' }: { data: HomeData; strategyId?: string; show?: Show; replay?: { events: StreamEvent[]; now: number }; empty?: string }) {
  const [selected, setSelected] = useState<Row | null>(null);
  const live = useActivity({ mode: data.workspace.mode, ...(strategyId ? { strategyId } : {}), team: true as const, ...(show ? { show } : {}) }, Boolean(replay));
  const { events, status, more } = replay ? { events: show ? replay.events.filter(event => shows(event, show)) : replay.events, status: 'Exhausted' as const, more: () => {} } : live;
  const [, tick] = useState(0), newest = useRef<number | null>(null);
  useEffect(() => { const timer = setInterval(() => tick(value => value + 1), 30_000); return () => clearInterval(timer); }, []);
  if (events === undefined) return <Loading label="Loading activity"/>;
  if (!events.length && status === 'Exhausted') return <p className={s.empty}>{show ? SHOW_EMPTY[show] : empty}</p>;
  // Only events newer than the last render arrive with a glow; older pages load quietly.
  const since = newest.current;
  newest.current = Math.max(since ?? 0, events[0]?.at ?? 0);
  const actionable = new Set<string>(), latest = new Set<string>(), stages = new Map<string, string>(replay ? [] : [...data.needs, ...data.watching, ...data.bags].map(item => [item.id, item.stage]));
  const bags = new Map(replay ? [] : data.bags.map(bag => [bag.id, bag]));
  for (const event of events) if (event.itemId && !latest.has(event.itemId)) { latest.add(event.itemId); actionable.add(event.id); }
  const rows = group(events);
  return <Paged className={s.rows} status={status} onMore={more}>{rows.map(row => <EventRow key={row.id} row={row} stage={actionable.has(row.id) && row.itemId ? stages.get(row.itemId) : undefined} bag={row.itemId ? bags.get(row.itemId) : undefined} fresh={since !== null && row.at > since} now={replay?.now} onOpen={setSelected}/>)}{selected && <EventPanel row={selected} onClose={() => setSelected(null)} onOpen={setSelected}/>}</Paged>;
}

/** One coin's own events, newest first, beside its chart on the coin page: the feed's rows, with only a failed row's Copy error as a button (the page header carries the rest); a row opens the coin's decisions. */
/** `onOpen` gets the row, so a row from an earlier pick of the coin opens that pick's decision; `onHover` names the row under the pointer or focus (null when it leaves). */
export function Trail({ events, onOpen, onHover }: { events: StreamEvent[] | undefined; onOpen: (row: StreamEvent) => void; onHover?: (row: StreamEvent | null) => void }) {
  const newest = useRef<number | null>(null);
  if (events === undefined) return <Loading label="Loading activity"/>;
  if (!events.length) return <p className={s.empty}>Nothing yet. ResearchBot’s check shows up here first.</p>;
  const since = newest.current;
  newest.current = Math.max(since ?? 0, events[0]?.at ?? 0);
  return <div className={s.rows}>{events.map(row => <EventRow key={row.id} row={row} own fresh={since !== null && row.at > since} onOpen={onOpen} onHover={onHover}/>)}</div>;
}

/** `own`: the row sits on its coin's own page, so the coin is never named; its figure (amount, profit, score) stays as a plain value.
 *  A coin's row reads as its newest step, or "Holding" with its live move while TraderBot holds it, over a bar of how far it got. */
function EventRow({ row, stage, bag, own = false, fresh, now, onOpen, onHover }: { row: Row; stage?: string; bag?: Bag; own?: boolean; fresh: boolean; now?: number; onOpen?: (row: Row) => void; onHover?: (row: Row | null) => void }) {
  const { describe: price } = usePriceDisplay();
  const command = useCommand(), resolve = useMutation(api.team.resolve), viewed = useAtomValue(viewedAtom);
  const run = (next: Command) => (event: React.MouseEvent) => { event.stopPropagation(); void command(next); };
  const decide = (apply: boolean) => async (event: React.MouseEvent) => { event.stopPropagation(); if (viewed) { toast.error(readOnly(viewed)); return; } try { await resolve({ eventId: row.id, apply }); } catch (cause) { failToast(cause); } };
  const coin = (note?: ReactNode, noteTone?: 'up' | 'down' | 'warn') => own ? note ? <span className={s.ownNote} data-tone={noteTone}>· {note}</span> : null : row.symbol ? <CoinPill coins={[{ symbol: row.symbol, logo: row.logoUri, address: undefined }]} note={note} tone={noteTone}/> : null;
  // A scan (or a run of them) carries the coins ResearchBot turned down, and a full queue the picks SniperBot let go; a coin you asked about carries its own verdict.
  const scans = row.group ?? [row], turned = row.kind === 'found' || cut(row) ? scans.flatMap(event => event.turnedDown) : [], checked = scans.reduce((sum, event) => sum + (event.count ?? 0), 0);
  const many = turned.length ? <CoinPill coins={turned.map(coin => ({ symbol: coin.symbol, logo: coin.logoUri }))} total={scans.reduce((sum, event) => sum + event.turnedDownTotal, 0)}/> : null;
  const score = row.count ? `score ${row.count}` : undefined;
  let text: ReactNode = row.detail, sub: ReactNode = null, buttons: ReactNode = null;
  switch (row.kind) {
    case 'found':
      if (row.itemId) { text = turned.length ? <>Turned down {coin(turned[0].score != null ? `score ${turned[0].score}` : undefined)}</> : <>Checking {coin() ?? 'it'}</>; sub = turned.length ? plainReason(turned[0].reason).replace(/ · score \d+(of \d+)?$/, '') : row.detail; }
      else { text = row.group || turned.length ? <>Checked {checked} {checked === 1 ? 'coin' : 'coins'}{turned.length ? <>, turned down {many}</> : null}</> : <>Found {row.count} new {row.count === 1 ? 'coin' : 'coins'}</>; sub = row.group || turned.length ? null : row.detail?.split(', ').join(' · '); }
      break;
    case 'paused': text = row.count != null ? <>You stopped the team</> : <>You paused <strong>{row.detail}</strong></>; sub = row.count != null ? row.detail : null; break;
    case 'resumed': text = <>You resumed <strong>{row.detail}</strong></>; break;
    case 'archived': text = <>You archived <strong>{row.detail}</strong></>; sub = 'Its profit stays in your totals'; break;
    case 'restored': text = <>You restored <strong>{row.detail}</strong></>; sub = 'Paused until you resume it'; break;
    case 'deleted': text = <>You deleted <strong>{row.detail}</strong></>; break;
    case 'started': text = <>You started <strong>{row.detail?.split(' · ')[0]}</strong></>; sub = row.detail?.split(' · ').slice(1).join(' · '); break;
    case 'updated': text = <>You changed <strong>{row.detail?.split(' · ')[0]}</strong></>; sub = row.detail?.split(' · ').slice(1).join(' · '); break;
    case 'mode': text = row.detail; break;
    case 'passed': text = <>Picked {coin(score)}</>; sub = plainReason(row.detail).replace(/ · score \d+$/, ''); break;
    case 'armed': text = <>Waiting to buy {coin(row.priceUsd ? `under ${price(row.priceUsd, row.supply)}` : 'at market')}</>; sub = row.detail && row.detail !== 'Buying at market' ? row.detail : null; break;
    case 'queued': text = row.queue ? <>Queued <CoinPill coins={row.queue.map(item => ({ symbol: item.symbol ?? '?', logo: item.logoUri }))}/></> : <>Queued {coin(sol(row.amountSol))}</>; sub = row.detail; break;
    case 'approval': text = <>Wants to buy {coin(`${sol(row.amountSol)}${row.priceUsd ? ' at ' + price(row.priceUsd, row.supply) : ''}`, 'warn')}</>; sub = 'Needs your OK'; break;
    case 'bought': text = <>Bought {coin(`${sol(row.amountSol)}${row.priceUsd ? ' at ' + price(row.priceUsd, row.supply) : ''}`)}</>; break;
    case 'sold': text = <>Sold {coin(signedSol(row.pnlSol), tone(row.pnlSol))}</>; sub = row.detail; break;
    case 'expired': text = many ? <>Let {many} go</> : <>Let {coin() ?? 'it'} go</>; sub = row.detail ?? 'The entry price never came'; break;
    case 'skipped': text = <>Skipped {coin() ?? 'it'}</>; break;
    case 'blocked': text = <>Held back on {coin() ?? 'it'}</>; sub = row.detail; break;
    case 'failed': text = <>Couldn’t finish with {coin() ?? (own ? 'it' : 'a task')}</>; sub = row.detail?.replace(/^The operation timed out\.?$/i, 'It took too long; retrying on its own'); break;
    case 'wallet': text = <>Live wallet ready</>; sub = row.detail ? row.detail.slice(0, 4) + '…' + row.detail.slice(-4) : null; break;
    case 'proposal': text = headline(row.detail); sub = [rest(row.detail), row.status === 'pending' ? 'Waiting for you' : row.status === 'applied' ? 'Applied' : 'Dismissed'].filter(Boolean).join(' · '); break;
    case 'watch': case 'alert': text = headline(row.detail); sub = rest(row.detail); break;
    case 'review': text = <>Got a second opinion on {coin() ?? 'it'}</>; sub = [headline(row.detail), rest(row.detail)].filter(Boolean).join(' · '); break;
  }
  // A coin TraderBot holds reads as its live move, with the buy under it.
  const bought = row.trail?.find(event => event.kind === 'bought'), holding = stage === 'held' && bag && !own;
  if (holding) { const move = change(bag); text = <>Holding {coin(pct(move), tone(move))}</>; sub = bought ? `Bought ${sol(bought.amountSol)}${bought.priceUsd ? ' at ' + price(bought.priceUsd, bought.supply) : ''}` : sub; }
  const steps = row.trail ? reached(row.trail, stage === 'held') : null;
  const answer = row.kind === 'alert' && row.alert ? alertAction(row.alert, row.itemId) : null;
  if (row.kind === 'proposal' && row.status === 'pending') buttons = <><Button size="xs" onClick={decide(true)}><Check/>Apply</Button><Button size="xs" variant="ghost" onClick={decide(false)}>Dismiss</Button></>;
  // A HOTBOT alert carries the one action that answers it, as its notification does.
  else if (answer) buttons = <Button size="xs" variant="secondary" asChild><Link href={answer.href} onClick={event => event.stopPropagation()}>{answer.label}</Link></Button>;
  // Only a buy waiting on the person carries a button here; the rest of a coin's actions live on its page.
  else if (stage === 'approval' && row.itemId) buttons = <Button size="xs" onClick={run({ type: 'approve', itemId: row.itemId })}><Check/>Buy</Button>;
  // A failure the row still reads as (not one a held coin's live move covers) carries its Copy button.
  else if (row.kind === 'failed' && !holding) buttons = <CopyError error={eventError(row)}/>;
  const open = onOpen ? () => onOpen(row) : undefined;
  return <div className={`${s.event} ${fresh ? s.new : ''}`} data-pending={row.kind === 'proposal' && row.status === 'pending' ? true : undefined} data-alert={row.kind === 'alert' || undefined} data-link={open ? true : undefined} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined} onClick={open} onKeyDown={open ? event => { if (event.key === 'Enter') open(); } : undefined}
    onMouseEnter={onHover && (() => onHover(row))} onMouseLeave={onHover && (() => onHover(null))} onFocus={onHover && (() => onHover(row))} onBlur={onHover && (() => onHover(null))}>
    <span className={s.eventIcon}>{icon(row)}</span>
    <span className={s.grow}><span>{typeof text === 'string' ? <SignedPercentText>{text}</SignedPercentText> : text}</span>{sub && <small>{typeof sub === 'string' ? <SignedPercentText>{sub}</SignedPercentText> : sub}</small>}
      {steps?.picked && <span className={s.eventSteps} title={['Picked', steps.bought && 'bought', steps.sold && 'sold'].filter(Boolean).join(', ')}><i data-on/><i data-on={steps.bought || undefined}/><i data-on={steps.sold || undefined}/></span>}</span>
    {buttons && <span className={s.actions}>{buttons}</span>}
    <time>{ago(row.at, now)}</time>
  </div>;
}

/** What the agent decided and why: one coin's decisions, or each coin in a grouped row with its own reason. */
function EventPanel({ row, onClose, onOpen }: { row: Row; onClose: () => void; onOpen: (row: Row) => void }) {
  if (row.itemId && !row.group) return <DecisionDialog id={row.itemId} onClose={onClose}/>;
  if (row.queue) return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-[30rem]">
      <DialogTitle className="sr-only">Coins waiting for room</DialogTitle>
      <div className={s.decision}>
        <div className={s.decisionHead}><BotAvatar role="sniper" size={40}/><span className={s.grow}><b>{row.queue.length} coins wait for room</b><small>SniperBot buys the best one when a sale or a change frees a slot. Open one for its research.</small></span></div>
        <div className={s.panelList}>{row.queue.map(item => <button type="button" key={item.id} className={s.panelRow} onClick={() => onOpen({ ...item, queue: undefined })}>
          <TokenAvatar className="size-8 rounded-[28%]" logoUrl={item.logoUri ?? undefined} symbol={item.symbol ?? '?'} network="solana" fallback="letter" disableDetailFallback/>
          <span className={s.grow}><b>{item.symbol}</b><small>{sol(item.amountSol)} · {ago(item.at)}</small></span><ChevronRight size={16}/>
        </button>)}</div>
      </div>
    </DialogContent>
  </Dialog>;
  const scans = row.group ?? [row], turned = (row.kind === 'found' && !row.itemId) || cut(row) ? scans.flatMap(event => event.turnedDown) : [], total = turned.length ? scans.reduce((sum, event) => sum + event.turnedDownTotal, 0) : 0;
  const role = cut(row) ? 'sniper' : 'research';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-[30rem]">
      <DialogTitle className="sr-only">Activity detail</DialogTitle>
      {turned.length ? <div className={s.decision}>
          <div className={s.decisionHead}><BotAvatar role={role} size={40}/><span className={s.grow}>{role === 'sniper'
            ? <><b>Let {total} {total === 1 ? 'pick' : 'picks'} go</b><small>The queue keeps its {QUEUE.max} best picks; these ranked below them. Open one for its research.</small></>
            : <><b>Turned down {total} {total === 1 ? 'coin' : 'coins'}</b><small>Each missed your rules. Open one for the full check.</small></>}</span></div>
          <div className={s.panelList}>{turned.map(coin => <button type="button" key={coin.itemId} className={s.panelRow} onClick={() => onOpen({ ...row, group: undefined, itemId: coin.itemId, symbol: coin.symbol, logoUri: coin.logoUri ?? null })}>
            <TokenAvatar className="size-8 rounded-[28%]" logoUrl={coin.logoUri} symbol={coin.symbol} network="solana" fallback="letter" disableDetailFallback/>
            <span className={s.grow}><b>{coin.symbol}</b><small>{role === 'sniper' ? coin.score != null ? `Fit ${coin.score}` : 'Ranked below the queue' : <SignedPercentText>{plainReason(coin.reason)}</SignedPercentText>}</small></span><ChevronRight size={16}/>
          </button>)}
          {total > turned.length && <Link className={s.panelRow} href={`${appHref('bots', role)}${row.strategyId ? `?strategy=${encodeURIComponent(row.strategyId)}` : ''}`}><span className={s.grow}><b>{total - turned.length} more</b><small>{role === 'sniper' ? 'Every pick is on SniperBot’s page' : 'Every verdict is on ResearchBot’s page'}</small></span><ChevronRight size={16}/></Link>}</div>
        </div>
        : <div className={s.decision}>
          <div className={s.decisionHead}><span className={s.eventIcon}>{icon(row)}</span><span className={s.grow}><b>{row.actor === 'you' ? 'You' : BOT_LABEL[row.actor]}</b><small>{row.detail ?? row.kind} · {new Date(row.at).toLocaleString()}</small></span></div>
          {row.judgement && <Judged judgement={row.judgement}/>}
        </div>}
    </DialogContent>
  </Dialog>;
}
/** What HOTBOT asked Jev before a note or proposal, and how sure Jev was: the answer it acted on is ticked. */
function Judged({ judgement }: { judgement: NonNullable<Row['judgement']> }) {
  const options = Object.entries(judgement.probabilities ?? {}).sort((a, b) => b[1] - a[1]), unsure = judgement.confidence != null && judgement.confidence < 0.8;
  return <div>
    <p className={s.label}>Jev’s read</p>
    <div className={s.evidence}>
      {options.map(([option, chance]) => <span key={option} className={s.fact} data-tone={option === judgement.choice ? undefined : 'muted'}>{option === judgement.choice ? <Check/> : <Minus/>}{option[0].toUpperCase() + option.slice(1)} <b>{Math.round(chance * 100)}%</b></span>)}
      {judgement.confidence != null && <span className={s.fact} data-tone={unsure ? 'warn' : undefined}>{unsure ? <HelpCircle/> : <Check/>}Confidence <b>{Math.round(judgement.confidence * 100)}%</b></span>}
    </div>
    <p className={s.judgedQuestion}>{judgement.question}</p>
  </div>;
}
/** A bot's failed step, with what an admin needs to find it in the worker and Convex logs. */
const eventError = (row: Row): ShownError => ({ title: `Couldn’t finish with ${row.symbol ?? 'a task'}`, error: row.detail ?? undefined, key: `event:${row.id}`, report: true,
  target: row.itemId ? { type: 'coin', id: row.itemId, label: row.symbol ?? 'This coin' } : row.strategyId ? { type: 'strategy', id: row.strategyId, label: 'This strategy' } : undefined,
  context: { happened: new Date(row.at).toISOString(), bot: BOT_LABEL[row.actor] ?? row.actor, coin: row.symbol, item: row.itemId, strategy: row.strategyId, event: row.id, amountSol: row.amountSol, priceUsd: row.priceUsd } });
/** HOTBOT's notes are a headline, then the detail on the next line. */
const headline = (detail: string | null) => detail?.split('\n')[0] ?? '';
const rest = (detail: string | null) => detail?.split('\n').slice(1).join(' ') || null;
const BOT_LABEL: Record<string, string> = { coordinator: 'HOTBOT', research: 'ResearchBot', sniper: 'SniperBot', trader: 'TraderBot', launch: 'LaunchBot' };

function icon(row: Row) {
  if (row.actor === 'you') return row.kind === 'paused' ? <Pause size={16}/> : row.kind === 'resumed' ? <Play size={16}/> : row.kind === 'updated' || row.kind === 'proposal' ? <Settings2 size={16}/> : row.kind === 'skipped' ? <X size={16}/> : row.kind === 'mode' ? <Wallet size={16}/>
    : row.kind === 'archived' ? <Archive size={16}/> : row.kind === 'restored' ? <ArchiveRestore size={16}/> : row.kind === 'deleted' ? <Trash2 size={16}/> : <User size={16}/>;
  return <BotAvatar role={row.actor} size={26}/>;
}
