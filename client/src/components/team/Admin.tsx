"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAction, useConvex, useMutation, useQuery as useLiveQuery, type PaginationStatus } from 'convex/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage, createJSONStorage, RESET } from 'jotai/utils';
import type { FunctionReturnType } from 'convex/server';
import { ArrowDown, ArrowUp, ArrowUpRight, AtSign, Check, ChevronRight, Copy, Download, Eye, Flag, Flame, Inbox, Layers, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw, Search, ThumbsUp, Ticket, Users, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, usePaginatedQuery, useQuery } from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { currentUserIdAtom, isAdminAtom } from '@/store/user/atoms';
import { formatNumber } from '@/utils/formatterUtils';
import { EXPERIENCE, TERMINALS, TOOLS } from '../../../../types/application';
import { REPORT_KIND_LABEL, REPORT_STATUSES, REPORT_STATUS_LABEL, type ReportStatus } from '../../../../types/report';
import { FEEDBACK_VERDICTS } from '../../../../types/feedback';
import { ADMIN_PATH } from '../../../../types/adminPath';
import { ago, pct, price, signedSol, sol, tone } from './format';
import { CoinPill, StrategyStatus } from './Parts';
import { failToast, viewedAtom, viewingAtom } from './state';
import { Paged } from './Stream';
import s from './team.module.css';

type Invite = FunctionReturnType<typeof api.invites.list>[number];
type Person = Invite['people'][number];
type Team = FunctionReturnType<typeof api.admin.people>[number];
type Strategy = FunctionReturnType<typeof api.admin.strategies>[number];
type Application = FunctionReturnType<typeof api.applications.page>['page'][number];
type Report = FunctionReturnType<typeof api.reports.list>[number];
type Rating = FunctionReturnType<typeof api.feedback.page>['rows'][number];
const VERDICT_TONE: Record<Rating['verdict'], string | undefined> = { want: 'up', untradable: 'warn', not: undefined };
const STATE: Record<Invite['state'], { label: string; tone?: string }> = { open: { label: 'Open', tone: 'up' }, full: { label: 'Full', tone: 'ember' }, closed: { label: 'Closed' }, expired: { label: 'Expired', tone: 'warn' } };
const SEATS = [1, 5, 25, 100], DAYS = [0, 1, 7, 30];
const since = (at: number) => ago(at) === 'now' ? 'just now' : `${ago(at)} ago`;
/** Codes are stored uppercase; the link shows them lowercase (an application's is its X handle), and every reader uppercases them again. */
const inviteLink = (code: string) => `${window.location.origin}/invite/${code.toLowerCase()}`;
const shortAddress = (value: string) => value.length > 14 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
/** How someone signs in, as the admin lists show it: a short wallet, an email or an X handle. */
const signedInWith = (person: Pick<Person, 'signIn' | 'email'>) => person.signIn ? person.signIn.provider === 'solana' ? shortAddress(person.signIn.id) : person.signIn.id : person.email;
function expiry(invite: Invite) {
  if (invite.expiresAt == null) return 'Never expires';
  const days = Math.ceil((invite.expiresAt - Date.now()) / 86_400_000);
  return days <= 0 ? `Expired ${since(invite.expiresAt)}` : days === 1 ? 'Expires within a day' : `Expires in ${days} days`;
}
/** Copies an invite's link. Safari allows a clipboard write only during the click, so a code still being made is written then and filled in when it arrives.
 *  A code that turns out null, or a failed request, copies nothing and says nothing; the caller reports those. */
async function copy(code: string | Promise<string | null>) {
  const link = Promise.resolve(code).then(value => value === null ? null : inviteLink(value));
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then(value => value === null ? Promise.reject(new Error('Nothing to copy')) : new Blob([value], { type: 'text/plain' })) })]);
    return true;
  } catch {
    if (await link.catch(() => null) !== null) toast.error('Could not copy the link.');
    return false;
  }
}

const nameOf = (person: Pick<Person, 'name' | 'signIn' | 'email'>) => person.name ?? signedInWith(person) ?? 'Unnamed account';
/** Applications by decision: Open is new and checked, the two that still need one. */
const APPLICATION_VIEWS = { open: 'Open', accepted: 'Accepted', rejected: 'Rejected' } as const;
type ApplicationView = keyof typeof APPLICATION_VIEWS;
const isLink = (text: string) => /^https?:\/\/\S+$/i.test(text);
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`Copied ${text}`); } catch { toast.error('Could not copy it.'); }
}
const PORTFOLIO = { paper: 'Practice', live: 'Real SOL' } as const;
/** The Admin tab open in this browser tab (sessionStorage), so Stop viewing comes back to the list a team was opened from. */
const adminTabAtom = atomWithStorage('hotbot-admin-tab', 'people',
  createJSONStorage<string>(() => { try { return sessionStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } }), { getOnInit: true });

/** The admin page (`ADMIN_PATH`): everyone's team (People), the invite links that let them in (Invites) and who applied on /join (Applications). From People an admin views a team as its owner sees it, read-only. */
export function AdminPage() {
  const isAdmin = useAtomValue(isAdminAtom), invites = useQuery(api.invites.list, isAdmin ? {} : 'skip'), people = usePeople(isAdmin);
  const [tab, setTab] = useAtom(adminTabAtom), [search, setSearch] = useState(''), [status, setStatus] = useState<ReportStatus>('open'), reports = useReports(isAdmin, status);
  const feedback = useFeedback(isAdmin && tab === 'feedback'), strategies = useStrategies(isAdmin && tab === 'strategies'), [shown, setShown] = useState<Shown>('all');
  const [view, setView] = useState<ApplicationView>('open'), [lookup, setLookup] = useState(''), applications = useApplications(isAdmin, view, lookup);
  if (!isAdmin) return null;
  const open = invites?.filter(row => row.state === 'open').length ?? 0, joined = invites?.reduce((sum, row) => sum + row.uses, 0) ?? 0;
  const real = people.teams?.filter(team => team.mode === 'live').length ?? 0, today = people.teams?.filter(team => people.at && people.at - team.seenAt < 86_400_000).length ?? 0;
  const ever = strategies.rows?.filter(row => (row.peak?.pnl ?? 0) > 0).length ?? 0, up = strategies.rows?.filter(row => row.pnlSol > 0).length ?? 0;
  const sub = tab === 'strategies' ? strategies.rows ? `${strategies.rows.length} ${strategies.rows.length === 1 ? 'strategy' : 'strategies'} · ${ever} ever up · ${up} up now` : 'Loading strategies…'
    : tab === 'people' ? people.teams ? `${people.teams.length} ${people.teams.length === 1 ? 'team' : 'teams'} · ${today} opened today · ${real} on Real SOL` : 'Loading people…'
    : tab === 'applications' ? applications.rows ? `${applications.rows.length}${applications.done ? '' : '+'} ${applications.searching ? 'matching' : APPLICATION_VIEWS[view].toLowerCase()} ${applications.rows.length === 1 ? 'application' : 'applications'}${applications.done ? ` · ${applications.rows.filter(row => (row.hotbot ?? 0) > 0).length} hold $HOTBOT` : ''}` : 'Loading applications…'
    : tab === 'feedback' ? feedback.rows ? `${feedback.rows.length}${feedback.done ? '' : '+'} ${feedback.rows.length === 1 ? 'rating' : 'ratings'} · ${feedback.rows.filter(row => row.verdict === 'want').length} would trade` : 'Loading ratings…'
    : tab === 'reports' ? reports.rows ? `${reports.rows.length}${reports.rows.length === 50 ? '+' : ''} ${REPORT_STATUS_LABEL[status].toLowerCase()} ${reports.rows.length === 1 ? 'report' : 'reports'}` : 'Loading reports…'
    : invites ? `${open} open · ${joined} ${joined === 1 ? 'person' : 'people'} joined` : 'Loading invites…';
  return <div className={s.page}>
    <header className={s.head}><div><h1 className={s.title}>Admin</h1><p className={s.sub}>{sub}</p></div></header>
    <Tabs value={tab} onValueChange={setTab} className={`${s.strategyTabs} ${s.homeTabs}`}>
      <div className={s.strategyTabsBar}>
        <TabsList variant="line" aria-label="Admin">
          <TabsTrigger value="people">People<TabsCount>{people.teams?.length || ''}</TabsCount></TabsTrigger>
          <TabsTrigger value="strategies">Strategies<TabsCount>{strategies.rows?.length || ''}</TabsCount></TabsTrigger>
          <TabsTrigger value="invites">Invites<TabsCount>{invites?.length || ''}</TabsCount></TabsTrigger>
          <TabsTrigger value="applications">Applications<TabsCount>{applications.waiting}</TabsCount></TabsTrigger>
          <TabsTrigger value="reports">Reports<TabsCount>{status === 'open' ? reports.rows?.length || '' : ''}</TabsCount></TabsTrigger>
          <TabsTrigger value="feedback">Feedback<TabsCount>{feedback.rows?.length || ''}</TabsCount></TabsTrigger>
        </TabsList>
        <div className={s.headActions}>{tab === 'strategies' ? <>
          <span className={s.seg} role="group" aria-label="Which strategies">{(Object.keys(SHOWN) as Shown[]).map(value => <button type="button" key={value} aria-pressed={value === shown} onClick={() => setShown(value)}>{SHOWN[value]}</button>)}</span>
          <label className={s.adminSearch}><Search aria-hidden/><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a strategy or person" aria-label="Find a strategy or person"/></label>
          <Button size="sm" variant="outline" disabled={strategies.busy} onClick={() => void strategies.load()} title={strategies.at ? `Last read ${since(strategies.at)}` : undefined}><RefreshCw className={strategies.busy ? 'animate-spin' : undefined}/>Refresh</Button>
        </> : tab === 'people' ? <>
          <label className={s.adminSearch}><Search aria-hidden/><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a person or strategy" aria-label="Find a person or strategy"/></label>
          <Button size="sm" variant="outline" disabled={people.busy} onClick={() => void people.load()} title={people.at ? `Last read ${since(people.at)}` : undefined}><RefreshCw className={people.busy ? 'animate-spin' : undefined}/>Refresh</Button>
        </> : tab === 'applications' ? <>
          <span className={s.seg} role="group" aria-label="Application state">{(Object.keys(APPLICATION_VIEWS) as ApplicationView[]).map(value => <button type="button" key={value} aria-pressed={!applications.searching && value === view} onClick={() => { setView(value); setLookup(''); }}>{APPLICATION_VIEWS[value]}</button>)}</span>
          <label className={s.adminSearch}><Search aria-hidden/><Input value={lookup} onChange={event => setLookup(event.target.value)} placeholder="Find an X, Telegram or wallet" aria-label="Find an application by X, Telegram or wallet"/></label>
          <CopyJoinLink/>
        </> : tab === 'reports' ? <>
          <span className={s.seg} role="group" aria-label="Report state">{REPORT_STATUSES.map(value => <button type="button" key={value} aria-pressed={value === status} onClick={() => setStatus(value)}>{REPORT_STATUS_LABEL[value]}</button>)}</span>
          <Button size="sm" variant="outline" disabled={reports.busy} onClick={() => void reports.load()}><RefreshCw className={reports.busy ? 'animate-spin' : undefined}/>Refresh</Button>
        </> : tab === 'feedback' ? <>
          <Button size="sm" variant="outline" disabled={feedback.busy} onClick={() => void feedback.exportAll()}><Download/>Export JSONL</Button>
          <Button size="sm" variant="outline" disabled={feedback.busy} onClick={() => void feedback.load()}><RefreshCw className={feedback.busy ? 'animate-spin' : undefined}/>Refresh</Button>
        </> : <NewInvite/>}</div>
      </div>
      <TabsContent value="people"><People teams={people.teams} search={search}/></TabsContent>
      <TabsContent value="strategies"><Strategies rows={strategies.rows} search={search} shown={shown}/></TabsContent>
      <TabsContent value="invites">
        {invites?.length === 0 && <section className={`${s.surface} ${s.inviteEmpty}`}>
          <span className={s.accountIcon}><Ticket size={18}/></span>
          <span className={s.grow}><b>No invites yet</b><small>HOTBOT is invite-only. Create an invite and share its link.</small></span>
        </section>}
        {invites && invites.length > 0 && <div className={s.inviteList}>{invites.map(row => <InviteCard key={row.id} invite={row}/>)}</div>}
      </TabsContent>
      <TabsContent value="reports"><Reports rows={reports.rows} status={status} reload={reports.load}/></TabsContent>
      <TabsContent value="feedback"><Feedback feedback={feedback}/></TabsContent>
      <TabsContent value="applications"><Applications list={applications} view={view} lookup={lookup}/></TabsContent>
    </Tabs>
  </div>;
}

/** Every team, read once when the page opens and again on Refresh: a live subscription would re-run on every scan of every team. */
function usePeople(enabled: boolean) {
  const convex = useConvex(), [teams, setTeams] = useState<Team[]>(), [busy, setBusy] = useState(false), [at, setAt] = useState<number>();
  const load = useCallback(async () => {
    setBusy(true);
    try { setTeams(await convex.query(api.admin.people, {})); setAt(Date.now()); } catch (cause) { failToast(cause); } finally { setBusy(false); }
  }, [convex]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { teams, busy, at, load };
}

/** Every team's strategies, read when the tab first opens and again on Refresh: their candles are written every 30 seconds, so a subscription would re-run all the time. */
function useStrategies(enabled: boolean) {
  const convex = useConvex(), [rows, setRows] = useState<Strategy[]>(), [busy, setBusy] = useState(false), [at, setAt] = useState<number>();
  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await convex.query(api.admin.strategies, {})); setAt(Date.now()); } catch (cause) { failToast(cause); } finally { setBusy(false); }
  }, [convex]);
  const opened = useRef(false);
  useEffect(() => { if (enabled && !opened.current) { opened.current = true; void load(); } }, [enabled, load]);
  return { rows, busy, at, load };
}

/** Which strategies the table lists: all, those whose recorded total was ever above zero, those above it now. */
const SHOWN = { all: 'All', ever: 'Ever up', now: 'Up now' } as const;
type Shown = keyof typeof SHOWN;
/** The table's figures, each a column it sorts by. */
const FIGURES = { peak: 'Peak', run: 'Best run', week: '7 days', day: '24 hours', now: 'Now', bought: 'Bought' } as const;
type Figure = keyof typeof FIGURES;
const figure = (row: Strategy, by: Figure) => by === 'peak' ? row.peak?.pnl ?? -Infinity : by === 'run' ? row.run?.pnl ?? 0 : by === 'week' ? row.week : by === 'day' ? row.day : by === 'now' ? row.pnlSol : row.bought;
const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const clock = (at: number) => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Who runs a strategy: as People names them, else their team's wallet. */
const ownerOf = (row: Strategy) => row.owner.name ?? signedInWith(row.owner) ?? (row.owner.wallet ? shortAddress(row.owner.wallet) : 'Unnamed account');
/** When a rise ran: its day and hours, or its two days. */
const stretch = ({ from, to }: { from: number; to: number }) => day(from) === day(to) ? `${day(from)} · ${clock(from)}–${clock(to)}` : `${day(from)} – ${day(to)}`;

/** Every strategy of every team as one table, sorted by the figure picked in its header (highest first, again for lowest first). A row opens the strategy's
 *  page as its owner sees it, read-only. */
function Strategies({ rows, search, shown }: { rows: Strategy[] | undefined; search: string; shown: Shown }) {
  const [by, setBy] = useState<Figure>('peak'), [low, setLow] = useState(false);
  const setViewing = useSetAtom(viewingAtom), router = useRouter();
  if (!rows) return <p className={`${s.empty} ${s.waiting}`} role="status">Loading strategies…</p>;
  if (!rows.length) return <section className={`${s.surface} ${s.inviteEmpty}`}>
    <span className={s.accountIcon}><Layers size={18}/></span>
    <span className={s.grow}><b>No strategy has traded yet</b><small>Strategies show up here once they find their first coin.</small></span>
  </section>;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const listed = rows.filter(row => (shown === 'all' || (shown === 'ever' ? (row.peak?.pnl ?? 0) > 0 : row.pnlSol > 0))
    && words.every(word => [row.name, row.preset, ownerOf(row), signedInWith(row.owner), row.owner.email, row.owner.wallet].filter(Boolean).join(' ').toLowerCase().includes(word)))
    .sort((a, b) => (figure(b, by) - figure(a, by)) * (low ? -1 : 1));
  const sort = (next: Figure) => { if (next === by) setLow(!low); else { setBy(next); setLow(false); } };
  const open = (row: Strategy) => { setViewing(row.you ? RESET : { userId: row.owner.id, name: ownerOf(row), avatar: row.owner.avatar }); router.push(`/app/strategies/${row.id}`); };
  const money = (value: number | undefined, note?: string) => <td><b className={value === undefined ? s.muted : s[tone(value) ?? 'muted']}>{value === undefined ? '—' : signedSol(value, 2).replace(' SOL', '')}</b>{note && <small>{note}</small>}</td>;
  if (!listed.length) return <p className={s.empty}>{words.length ? `No strategy matches “${search.trim()}”.` : shown === 'ever' ? 'No strategy was ever above zero.' : 'No strategy is above zero now.'}</p>;
  return <div className={`${s.surface} ${s.adminTableWrap}`}>
    <table className={s.adminTable}>
      <thead><tr>
        <th scope="col">Strategy</th>
        {(Object.keys(FIGURES) as Figure[]).map(key => <th key={key} scope="col" aria-sort={key === by ? low ? 'ascending' : 'descending' : undefined}>
          <button type="button" onClick={() => sort(key)}>{FIGURES[key]}{key === by && (low ? <ArrowUp aria-hidden/> : <ArrowDown aria-hidden/>)}</button>
        </th>)}
      </tr></thead>
      <tbody>{listed.map(row => {
        const owner = ownerOf(row);
        return <tr key={`${row.id}:${row.mode}`} tabIndex={0} aria-label={`Open ${row.name} by ${owner}`} onClick={() => open(row)} onKeyDown={event => { if (event.key === 'Enter') open(row); }}>
          <td><span className={s.adminStrategy}>
            <Avatar name={owner} avatar={row.owner.avatar}/>
            <span className={s.grow}><b>{row.name}</b><small>{owner}{row.preset === row.name ? '' : ` · ${row.preset}`} · {sol(row.budgetSol, 2)}</small></span>
            <span className={s.adminStrategyPills}>
              {row.status === 'archived' ? <span className={s.pill}>Archived</span> : <StrategyStatus status={row.status}/>}
              <span className={s.pill} data-tone={row.mode === 'live' ? 'ember' : undefined} title={row.current ? undefined : 'Their team is on the other account now: the page shows that one.'}>{PORTFOLIO[row.mode]}{row.current ? '' : ' · not current'}</span>
            </span>
          </span></td>
          {money(row.peak?.pnl, row.peak ? day(row.peak.at) : undefined)}
          {money(row.run?.pnl ?? 0, row.run ? stretch(row.run) : undefined)}
          {money(row.week)}
          {money(row.day)}
          {money(row.pnlSol, `sold ${signedSol(row.realizedPnlSol, 2).replace(' SOL', '')}`)}
          <td><b>{row.bought}</b><small>{row.wins} won</small></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/** People's coin ratings, newest first: the first page when the tab first opens, more on request, every page for the export. Read once, never
 *  subscribed: ratings arrive all day. */
function useFeedback(enabled: boolean) {
  const convex = useConvex(), [rows, setRows] = useState<Rating[]>(), [next, setNext] = useState<string | null>(null), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  const read = useCallback(async (cursor: string | null) => {
    setBusy(true);
    try { const page = await convex.query(api.feedback.page, { cursor }); setRows(prev => cursor ? [...(prev ?? []), ...page.rows] : page.rows); setNext(page.cursor); setDone(page.done); }
    catch (cause) { failToast(cause); } finally { setBusy(false); }
  }, [convex]);
  const opened = useRef(false);
  useEffect(() => { if (enabled && !opened.current) { opened.current = true; void read(null); } }, [enabled, read]);
  const exportAll = async () => {
    setBusy(true);
    try {
      const all: Rating[] = [];
      for (let cursor: string | null = null, end = false; !end;) { const page: FunctionReturnType<typeof api.feedback.page> = await convex.query(api.feedback.page, { cursor, size: 500 }); all.push(...page.rows); cursor = page.cursor; end = page.done; }
      const lines = all.map(({ from, ...row }) => JSON.stringify({ ...row, userId: from.id, user: nameOf(from) })).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([lines + '\n'], { type: 'application/x-ndjson' }));
      link.download = `coin-ratings-${new Date().toISOString().slice(0, 10)}.jsonl`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  return { rows, done, busy, load: () => read(null), more: () => read(next), exportAll };
}

function Feedback({ feedback }: { feedback: ReturnType<typeof useFeedback> }) {
  const { rows } = feedback;
  if (!rows) return <p className={`${s.empty} ${s.waiting}`} role="status">Loading ratings…</p>;
  if (!rows.length) return <section className={`${s.surface} ${s.inviteEmpty}`}>
    <span className={s.accountIcon}><ThumbsUp size={18}/></span>
    <span className={s.grow}><b>No ratings yet</b><small>People rate a coin with Rate on its page: where they would buy and sell, and whether they’d trade it.</small></span>
  </section>;
  return <div className={s.inviteList}>{rows.map(row => <RatingCard key={row.id} rating={row}/>)}
    {!feedback.done && <Button variant="outline" disabled={feedback.busy} onClick={() => void feedback.more()}>{feedback.busy ? <LoaderCircle className="animate-spin"/> : null}Show more</Button>}
  </div>;
}

/** One rating: who, which coin, the verdict, the marks and the move between them, and the coin as they saw it. */
function RatingCard({ rating }: { rating: Rating }) {
  const setViewing = useSetAtom(viewingAtom), router = useRouter(), me = useAtomValue(currentUserIdAtom), name = nameOf(rating.from);
  const verdict = FEEDBACK_VERDICTS.find(row => row.id === rating.verdict)!, gain = rating.buy && rating.sell ? (rating.sell.priceUsd / rating.buy.priceUsd - 1) * 100 : null;
  const at = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const see = () => { if (!rating.itemId) return router.push(`/app/lab?coin=${rating.mint}`); if (rating.from.id !== me) setViewing({ userId: rating.from.id, name, avatar: rating.from.avatar }); router.push(`/app/tokens/${rating.itemId}`); };
  return <section className={`${s.surface} ${s.inviteCard}`} aria-label={`${name} rated ${rating.symbol}`}>
    <div className={s.inviteTop}>
      <Avatar name={name} avatar={rating.from.avatar}/>
      <span className={s.grow}><b>{name}</b><small>{since(rating.updatedAt)}</small></span>
      <span className={s.pill} data-tone={VERDICT_TONE[rating.verdict]}>{verdict.title}</span>
    </div>
    <div className={s.reportFacts}>
      <CoinPill coins={[{ symbol: rating.symbol, address: rating.mint }]}/>
      {rating.buy && <span className={s.pill}>Buy · <b>{price(rating.buy.priceUsd)}</b> · {at(rating.buy.t)}</span>}
      {rating.sell && <span className={s.pill}>Sell · <b>{price(rating.sell.priceUsd)}</b> · {at(rating.sell.t)}</span>}
      {gain !== null && <span className={s.pill} data-tone={gain >= 0 ? 'up' : 'down'}>{pct(gain)}</span>}
    </div>
    {rating.note && <p className={s.reportComment}>{rating.note}</p>}
    <div className={s.inviteActions}><Button size="sm" variant="outline" onClick={see}><Eye/>See the coin as they did</Button></div>
  </section>;
}

/** Reports in one state, read once per visit, on a state change and on Refresh: testers file them all day, so a subscription would re-run with each. */
function useReports(enabled: boolean, status: ReportStatus) {
  const convex = useConvex(), [rows, setRows] = useState<Report[]>(), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await convex.query(api.reports.list, { status })); } catch (cause) { failToast(cause); } finally { setBusy(false); }
  }, [convex, status]);
  useEffect(() => { if (enabled) { setRows(undefined); void load(); } }, [enabled, load]);
  return { rows, busy, load };
}

function Reports({ rows, status, reload }: { rows: Report[] | undefined; status: ReportStatus; reload: () => Promise<void> }) {
  if (!rows) return <p className={`${s.empty} ${s.waiting}`} role="status">Loading reports…</p>;
  if (!rows.length) return <section className={`${s.surface} ${s.inviteEmpty}`}>
    <span className={s.accountIcon}><Flag size={18}/></span>
    <span className={s.grow}><b>{status === 'open' ? 'Nothing reported' : `No ${REPORT_STATUS_LABEL[status].toLowerCase()} reports`}</b><small>People report from Report a problem in the menu, the F key, or a coin’s decision dialog.</small></span>
  </section>;
  return <div className={s.inviteList}>{rows.map(row => <ReportCard key={row.id} report={row} reload={reload}/>)}</div>;
}

/** One report: who sent it, about what, what they said and picked, the screen's data on demand, and the way to see it as they did. */
function ReportCard({ report, reload }: { report: Report; reload: () => Promise<void> }) {
  const resolve = useMutation(api.reports.resolve), setViewing = useSetAtom(viewingAtom), router = useRouter(), me = useAtomValue(currentUserIdAtom);
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  const screen = useLiveQuery(api.reports.screen, open ? { id: report.id } : 'skip');
  const name = nameOf(report.from), owner = report.viewing ?? report.from;
  const set = async (status: ReportStatus) => { setBusy(true); try { await resolve({ id: report.id, status }); await reload(); } catch (cause) { failToast(cause); } finally { setBusy(false); } };
  // Their team, on the coin or strategy page the report names, else the page they reported from.
  const page = report.target ? `/app/${report.target.type === 'coin' ? 'tokens' : 'strategies'}/${report.target.id}` : report.route;
  const see = () => { if (owner.id !== me) setViewing({ userId: owner.id, name: nameOf(owner), avatar: owner.avatar }); router.push(page); };
  const pretty = (json: string | null) => { if (!json) return null; try { return JSON.stringify(JSON.parse(json), null, 1); } catch { return json; } };
  return <section className={`${s.surface} ${s.inviteCard}`} aria-label={`Report from ${name}`}>
    <div className={s.inviteTop}>
      <Avatar name={name} avatar={report.from.avatar}/>
      <span className={s.grow}><b>{name}</b><small>{since(report.createdAt)}{report.viewing ? ` · viewing ${nameOf(report.viewing)}` : ''}</small></span>
      <span className={s.pill} data-tone={report.kind === 'idea' ? undefined : 'warn'}>{REPORT_KIND_LABEL[report.kind]}</span>
    </div>
    {report.comment && <p className={s.reportComment}>{report.comment}</p>}
    {report.element && <q className={s.reportQuote}>{report.element}</q>}
    <div className={s.reportFacts}>
      {report.target && <span className={s.pill}>{report.target.type === 'coin' ? 'Coin' : 'Strategy'} · <b>{report.target.label}</b></span>}
      <span className={s.pill}>{report.route}</span>
      <span className={s.pill}>{report.viewport}</span>
      {report.appearance && <span className={s.pill}>{report.appearance}</span>}
    </div>
    <Collapsible className={`${s.exact} ${s.invitePeople}`} open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger><ChevronRight/>What the screen showed</CollapsibleTrigger>
      <CollapsibleContent>{screen === undefined ? <p className={s.inviteNobody}>Loading…</p> : !screen ? <p className={s.inviteNobody}>No data was attached.</p> : <>
        {screen.shown && <><p className={s.label}>On their screen</p><pre className={s.reportScreen}>{pretty(screen.shown)}</pre></>}
        {screen.server && <><p className={s.label}>On the server then</p><pre className={s.reportScreen}>{pretty(screen.server)}</pre></>}
      </>}</CollapsibleContent>
    </Collapsible>
    <div className={s.inviteActions}>
      <Button size="sm" variant="outline" onClick={see}><Eye/>See it as they did</Button>
      <span className={s.grow}/>
      {report.status === 'open' ? <>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set('wontfix')}>Won’t fix</Button>
        <Button size="sm" disabled={busy} onClick={() => void set('fixed')}>{busy ? <LoaderCircle className="animate-spin"/> : <Check/>}Fixed</Button>
      </> : <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set('open')}><RotateCcw/>Reopen</Button>}
    </div>
  </section>;
}
/** Opens someone's team in this tab as they see it, read-only, until Stop viewing. */
function useViewTeam() {
  const setViewing = useSetAtom(viewingAtom), router = useRouter();
  return (person: Pick<Person, 'id' | 'name' | 'signIn' | 'email' | 'avatar'>) => { setViewing({ userId: person.id, name: nameOf(person), avatar: person.avatar }); router.push('/app'); };
}

function Avatar({ name, avatar, size }: { name: string; avatar: string | null; size?: 'lg' }) {
  return <span className={s.inviteAvatar} data-size={size} aria-hidden>{avatar ? <img src={avatar} alt=""/> : name.replace(/^@/, '').slice(0, 1).toUpperCase()}</span>;
}

function People({ teams, search }: { teams: Team[] | undefined; search: string }) {
  if (!teams) return <p className={`${s.empty} ${s.waiting}`} role="status">Loading people…</p>;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? teams.filter(team => {
    const text = [nameOf(team), signedInWith(team), team.email, team.invite?.code, team.invite?.label, team.walletAddress, ...team.strategies.flatMap(row => [row.name, row.preset])].filter(Boolean).join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  }) : teams;
  if (!teams.length) return <section className={`${s.surface} ${s.inviteEmpty}`}>
    <span className={s.accountIcon}><Users size={18}/></span>
    <span className={s.grow}><b>No teams yet</b><small>People show up here once they start their first strategy.</small></span>
  </section>;
  if (!shown.length) return <p className={s.empty}>Nobody matches “{search.trim()}”.</p>;
  return <div className={`${s.inviteList} ${s.teamGrid}`}>{shown.map(team => <TeamCard key={team.id} team={team}/>)}</div>;
}

/** One person's team: who they are, what their portfolio made, a Strategies dialog, and a way in. */
function TeamCard({ team }: { team: Team }) {
  const view = useViewTeam(), [open, setOpen] = useState(false), handle = signedInWith(team), portfolio = PORTFOLIO[team.mode], profit = tone(team.realizedPnlSol);
  // An account with no name or sign-in on record still has its team's wallet.
  const name = team.name ?? handle ?? (team.walletAddress ? shortAddress(team.walletAddress) : 'Unnamed account');
  const about = [handle && handle !== name ? handle : null, team.invite ? `via ${team.invite.code}` : null, `joined ${new Date(team.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`].filter(Boolean).join(' · ');
  return <section className={`${s.surface} ${s.inviteCard}`} aria-label={`${name}’s team`}>
    <div className={s.inviteTop}>
      <Avatar name={name} avatar={team.avatar} size="lg"/>
      <span className={s.grow}><b>{name}</b><small title={team.invite?.label ?? undefined}>{about}</small></span>
      {team.you ? <span className={s.pill}>You</span> : <span className={s.pill} data-tone={team.mode === 'live' ? 'ember' : undefined}>{portfolio}</span>}
    </div>
    <div className={s.teamMoney}>
      <span><b className={profit ? s[profit] : undefined}>{signedSol(team.realizedPnlSol).replace(' SOL', '')}<small>SOL</small></b><small>Profit in {portfolio}</small></span>
      <span><b>{sol(team.cashSol).replace(' SOL', '')}<small>SOL</small></b><small>Cash</small></span>
    </div>
    <div className={s.teamFacts}>
      <span className={s.pill} data-tone={Date.now() - team.seenAt < 86_400_000 ? 'up' : undefined}>Opened {since(team.seenAt)}</span>
      <span className={s.pill}>{team.actedAt ? `Team acted ${since(team.actedAt)}` : 'Team hasn’t acted'}</span>
      {team.held > 0 && <span className={s.pill}>{team.held} held</span>}
      {team.halted && <span className={s.pill} data-tone="warn">Stopped</span>}
      {team.mode === 'paper' && team.wantLive && <span className={s.pill} data-tone="ember">Wants Real SOL</span>}
    </div>
    <div className={s.inviteActions}>
      <span className={s.inviteNobody}>{team.archived ? `${team.archived} archived` : ''}</span>
      <span className={s.teamButtons}>
        <Button size="sm" variant="secondary" disabled={!team.strategies.length} onClick={() => setOpen(true)}><Layers/>{team.strategies.length} {team.strategies.length === 1 ? 'strategy' : 'strategies'}</Button>
        {!team.you && <Button size="sm" onClick={() => view({ ...team, name })}><Eye/>View their team</Button>}
      </span>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[34rem]" aria-describedby={undefined}>
        <div className={s.decisionHead}><Avatar name={name} avatar={team.avatar}/><span className={s.grow}><DialogTitle asChild><b>{name}’s strategies</b></DialogTitle><small>{team.archived ? `${team.archived} archived not shown` : `${portfolio} portfolio`}</small></span></div>
        <div className={`${s.rows} ${s.teamStrategies}`}>{team.strategies.map(row => {
          const pnl = tone(row.realizedPnlSol);
          return <div key={row.id} className={s.row}>
            <span className={s.grow}><b>{row.name}</b><small>{row.preset === row.name ? '' : `${row.preset} · `}{sol(row.budgetSol, 2)} budget{row.askFirst ? ' · asks first' : ''} · {row.bought} bought · {row.wins} won{row.held ? ` · ${row.held} held` : ''}</small></span>
            <span className={s.teamStrategyEnd}><b className={pnl ? s[pnl] : undefined}>{signedSol(row.realizedPnlSol)}</b><StrategyStatus status={row.status}/></span>
          </div>;
        })}</div>
      </DialogContent>
    </Dialog>
  </section>;
}

/** Shown on every page while an admin views someone's team: whose it is, that it is read-only, and the way back. */
export function ViewingBar() {
  const viewed = useAtomValue(viewedAtom), setViewing = useSetAtom(viewingAtom), router = useRouter();
  if (!viewed) return null;
  return <div className={s.viewingBar} role="status">
    <Avatar name={viewed.name} avatar={viewed.avatar}/>
    <span className={s.viewingText}><Eye aria-hidden/><span><span className={s.viewingLong}>Viewing </span><b>{viewed.name}</b>’s team</span></span>
    <span className={`${s.pill} ${s.viewingPill}`} data-tone="ember">Read only</span>
    <Button size="sm" variant="secondary" className={s.viewingStop} onClick={() => { setViewing(RESET); router.push(`/app/${ADMIN_PATH}`); }}><X/>Stop<span className={s.viewingLong}>viewing</span></Button>
  </div>;
}

function InviteCard({ invite }: { invite: Invite }) {
  const update = useMutation(api.invites.update), [copied, setCopied] = useState(false), state = STATE[invite.state];
  const set = async (patch: { open?: boolean; maxUses?: number }) => { try { await update({ id: invite.id, ...patch }); } catch (cause) { failToast(cause); } };
  const fewest = Math.max(1, invite.uses);
  return <section className={`${s.surface} ${s.inviteCard}`} data-state={invite.state} aria-label={`Invite ${invite.code}`}>
    <div className={s.inviteTop}>
      <span className={s.accountIcon}><Ticket size={18}/></span>
      <span className={s.grow}><b className={s.inviteCode}>{invite.code}</b><small>{invite.label ?? 'No label'} · {since(invite.createdAt)}{invite.createdBy ? ` by ${invite.createdBy}` : ''}</small></span>
      <span className={s.pill} data-tone={state.tone}>{state.label}</span>
    </div>
    <div className={s.inviteSeats}>
      <div className={s.inviteMeter} role="meter" aria-valuemin={0} aria-valuemax={invite.maxUses} aria-valuenow={invite.uses} aria-label="Seats taken"><i style={{ width: `${Math.min(100, invite.uses / invite.maxUses * 100)}%` }}/></div>
      <span className={s.inviteTaken}><b>{invite.uses}</b> of <b>{invite.maxUses}</b> {invite.maxUses === 1 ? 'seat' : 'seats'} taken</span>
      <span className={s.inviteStepper} role="group" aria-label="Seats">
        <button type="button" aria-label="One seat fewer" disabled={invite.maxUses <= fewest} onClick={() => void set({ maxUses: invite.maxUses - 1 })}><Minus/></button>
        <button type="button" aria-label="One more seat" disabled={invite.maxUses >= 10_000} onClick={() => void set({ maxUses: invite.maxUses + 1 })}><Plus/></button>
        <button type="button" disabled={invite.maxUses > 9_990} onClick={() => void set({ maxUses: invite.maxUses + 10 })}>+10</button>
      </span>
      <span className={s.inviteExpiry}>{expiry(invite)}</span>
    </div>
    <div className={s.inviteActions}>
      <Button size="sm" variant="outline" onClick={async () => { if (await copy(invite.code)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } }}>{copied ? <Check/> : <Copy/>}{copied ? 'Copied' : 'Copy link'}</Button>
      <label className={s.inviteSwitch}><Switch checked={invite.state !== 'closed'} onCheckedChange={open => void set({ open })} aria-label={invite.state === 'closed' ? 'Reopen this invite' : 'Close this invite'}/>{invite.state === 'closed' ? 'Closed' : 'Accepting'}</label>
    </div>
    {invite.people.length > 0 ? <Collapsible className={`${s.exact} ${s.invitePeople}`}>
      <CollapsibleTrigger><ChevronRight/>Who joined<small>{invite.uses}</small></CollapsibleTrigger>
      <CollapsibleContent><div className={s.rows}>{invite.people.map(person => <PersonRow key={person.id} person={person}/>)}</div></CollapsibleContent>
    </Collapsible> : <p className={s.inviteNobody}>Nobody has joined with it yet.</p>}
  </section>;
}

function PersonRow({ person }: { person: Person }) {
  const view = useViewTeam(), me = useAtomValue(currentUserIdAtom), handle = signedInWith(person), name = nameOf(person);
  return <div className={s.row}>
    <Avatar name={name} avatar={person.avatar}/>
    <span className={s.grow}><b>{name}</b>{handle && handle !== name && <small>{handle}</small>}</span>
    <span className={s.pill} data-tone={person.team ? 'up' : undefined}>{person.team ? `${person.strategies} ${person.strategies === 1 ? 'strategy' : 'strategies'}` : 'No team yet'}</span>
    <time className={s.inviteWhen}>{since(person.at)}</time>
    {person.team && person.id !== me && <Button size="icon-sm" variant="ghost" aria-label={`View ${name}’s team`} title="View their team" onClick={() => view(person)}><Eye/></Button>}
  </div>;
}

const APPLICATION_PAGE = 30;
/** Applications for the admin page, live. A page reads only its own rows, so the list grows as the reader scrolls (`more`).
 *  Open is two decisions of one index, new and checked. They load as two lists, and the reader sees them as one in the order of last activity, down to the oldest row that both have loaded.
 *  Text finds applications in every decision by X, Telegram or wallet, once the reader stops typing. */
function useApplications(enabled: boolean, view: ApplicationView, lookup: string) {
  const fresh = usePaginatedQuery(api.applications.page, enabled ? { stage: 'new' } : 'skip', { initialNumItems: APPLICATION_PAGE });
  const checked = usePaginatedQuery(api.applications.page, enabled ? { stage: 'checked' } : 'skip', { initialNumItems: APPLICATION_PAGE });
  const closed = usePaginatedQuery(api.applications.page, enabled && view !== 'open' ? { stage: view } : 'skip', { initialNumItems: APPLICATION_PAGE });
  const [asked, setAsked] = useState('');
  useEffect(() => {
    const text = lookup.trim();
    if (!text) { setAsked(''); return; }
    const timer = setTimeout(() => setAsked(text), 250);
    return () => clearTimeout(timer);
  }, [lookup]);
  const found = useQuery(api.applications.find, enabled && asked ? { text: asked } : 'skip');
  const unread = (part: { status: PaginationStatus }) => part.status === 'CanLoadMore' || part.status === 'LoadingMore';
  const oldest = (part: { results: Application[] }) => part.results[part.results.length - 1]?.updatedAt ?? Infinity;
  const parts = [fresh, checked], more = parts.filter(unread), edge = Math.max(-Infinity, ...more.map(oldest)), binding = more.find(part => oldest(part) === edge);
  const open = parts.flatMap(part => part.results).filter(row => row.updatedAt >= edge).sort((a, b) => b.updatedAt - a.updatedAt);
  const searching = Boolean(lookup.trim());
  const shown = view === 'open' ? { rows: open, status: parts.some(part => part.status === 'LoadingFirstPage') ? 'LoadingFirstPage' as const : binding ? binding.status : 'Exhausted' as const, load: () => binding?.loadMore(APPLICATION_PAGE) }
    : { rows: closed.results, status: closed.status, load: () => closed.loadMore(APPLICATION_PAGE) };
  const waiting = parts.some(part => part.status === 'LoadingFirstPage') ? '' : `${open.length || ''}${open.length && binding ? '+' : ''}`;
  if (searching) return { rows: asked && found ? found.rows : undefined, done: !found?.capped, capped: Boolean(found?.capped), status: 'Exhausted' as const, more: () => {}, searching, waiting };
  return { rows: shown.status === 'LoadingFirstPage' ? undefined : shown.rows, done: shown.status === 'Exhausted', capped: false, status: shown.status, more: shown.load, searching, waiting };
}

/** The Applications tab: the cards of the view, or of the search, with the next page loading as the reader nears the end. */
function Applications({ list, view, lookup }: { list: ReturnType<typeof useApplications>; view: ApplicationView; lookup: string }) {
  const { rows } = list;
  if (!rows) return <p className={`${s.empty} ${s.waiting}`} role="status">{list.searching ? 'Searching…' : 'Loading applications…'}</p>;
  if (!rows.length) return list.searching ? <p className={s.empty}>No application matches “{lookup.trim()}”.</p>
    : view === 'open' ? <section className={`${s.surface} ${s.inviteEmpty}`}>
      <span className={s.accountIcon}><Inbox size={18}/></span>
      <span className={s.grow}><b>No open applications</b><small>People apply on /join. Copy its link and share it.</small></span>
    </section> : <p className={s.empty}>No {APPLICATION_VIEWS[view].toLowerCase()} applications.</p>;
  return <Paged status={list.status} onMore={list.more}>
    <div className={s.inviteList}>{rows.map(row => <ApplicationCard key={row.id} application={row}/>)}</div>
    {list.capped && <p className={s.empty}>These are the first matches. Type more of the name to narrow them.</p>}
  </Paged>;
}

/** The link to the application page, for sharing. */
function CopyJoinLink() {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/join`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { toast.error('Could not copy the link.'); }
  };
  return <Button size="sm" variant="outline" onClick={() => void copyLink()}>{copied ? <Check/> : <Copy/>}{copied ? 'Copied' : 'Copy /join link'}</Button>;
}

/** One application from /join: who (X, Telegram), the wallet with its balances as last read (after sending, or by Recheck), where and how long they trade, and why.
 *  The wallet opens on Orb, a terminal opens its profile (a stored link, or the terminal's profile address for a bare name; otherwise the name copies), a comment link opens.
 *  Check, then Accept (a one-seat invite whose link is copied) or Reject; Restore brings a rejected one back. */
function ApplicationCard({ application: row }: { application: Application }) {
  const decide = useMutation(api.applications.decide), accept = useMutation(api.applications.accept), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const recheck = useAction(api.applications.recheck), [reading, setReading] = useState(false);
  // The list is live, so the card shows the new balances and their time as soon as they are saved.
  const reread = async () => { setReading(true); try { await recheck({ id: row.id }); } catch (cause) { failToast(cause); } finally { setReading(false); } };
  const experience = EXPERIENCE.find(level => level.id === row.experience), holds = (row.hotbot ?? 0) > 0;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); try { await action(); } catch (cause) { failToast(cause); } finally { setBusy(false); } };
  const set = (status: 'checked' | 'rejected' | null) => run(() => decide({ id: row.id, status }));
  // The copy starts inside the click, before the invite exists (see `copy`).
  const admit = () => run(async () => {
    const accepting = accept({ id: row.id }), copied = copy(accepting.then(made => made.seated ? null : made.code));
    const made = await accepting;
    if (made.seated) toast.success(`@${row.x} already signs in with that wallet and is in`);
    else if (await copied) toast.success(`Invite for @${row.x} copied`);
  });
  const copyInvite = async (code: string) => { if (await copy(code)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } };
  return <section className={`${s.surface} ${s.inviteCard}`} aria-label={`Application from @${row.x}`}>
    <div className={s.inviteTop}>
      <span className={s.accountIcon}><AtSign size={18}/></span>
      <span className={s.grow}><b>@{row.x}</b><small>Telegram @{row.telegram} · {since(row.updatedAt)}{row.updatedAt - row.createdAt > 1000 ? ' · updated' : ''}</small></span>
      {row.status === 'checked' && <span className={s.pill}><Check size={13} aria-hidden/>Checked</span>}
      {row.status === 'accepted' && <span className={s.pill} data-tone="up">Accepted</span>}
      {row.status === 'rejected' && <span className={s.pill}>Rejected</span>}
      {experience && <span className={s.pill} data-tone={row.experience === 'veteran' ? 'ember' : row.experience === 'years' ? 'up' : undefined} title={experience.text}>{experience.name}</span>}
    </div>
    <div className={s.inviteSeats}>
      {row.wallet ? <>
        <a className={s.applicationLink} href={`https://orbmarkets.io/address/${row.wallet}`} target="_blank" rel="noopener noreferrer" title={`${row.wallet} on Orb`}><Wallet size={15} aria-hidden/>{shortAddress(row.wallet)}<ArrowUpRight aria-hidden/></a>
        {row.walletReadAt === undefined ? <span>Balance pending</span> : <>
          <span className={holds ? 'inline-flex items-center gap-1 font-semibold text-[var(--ember)]' : undefined}>{holds && <Flame size={14} aria-hidden/>}{holds ? `${formatNumber(row.hotbot, { compact: true })} $HOTBOT` : 'No $HOTBOT'}</span>
          <span>{formatNumber(row.sol, { precision: 2 })} SOL</span>
        </>}
        <Button size="xs" variant="ghost" disabled={reading} onClick={() => void reread()} title="Read this wallet's balance again" aria-label={`Recheck @${row.x}'s balance`}>
          <RefreshCw className={reading ? 'animate-spin' : undefined} aria-hidden/>{reading ? 'Reading' : row.walletReadAt === undefined ? 'Read' : since(row.walletReadAt)}
        </Button>
      </> : <span>No $HOTBOT wallet</span>}
    </div>
    {(row.terminals?.length || row.tools.length) ? <ul className={s.plainChips}>
      {row.terminals?.map(pick => {
        const terminal = TERMINALS.find(item => item.id === pick.id);
        if (!terminal) return null;
        const name = pick.handle?.replace(/^@/, ''), href = pick.handle && isLink(pick.handle) ? pick.handle : name && terminal.profile ? `${terminal.profile}${encodeURIComponent(name)}` : null;
        const inner = <><img src={terminal.icon} alt="" width={16} height={16} className="size-4 rounded-[28%]"/>{terminal.name}{pick.handle ? <span className="max-w-40 truncate text-muted-foreground">{pick.handle}</span> : null}</>;
        return <li key={pick.id}>{href ? <a className={s.plainChip} href={href} target="_blank" rel="noopener noreferrer" title={href}>{inner}<ArrowUpRight aria-hidden/></a>
          : name ? <button type="button" className={s.plainChip} title={`Copy ${name}`} onClick={() => void copyText(name)}>{inner}<Copy aria-hidden/></button>
          : <span className={s.plainChip}>{inner}</span>}</li>;
      })}
      {row.tools.map(id => <li key={id} className={s.plainChip} data-group="buys">{TOOLS.find(tool => tool.id === id)?.name ?? id}</li>)}
    </ul> : null}
    <p className="m-0 text-sm leading-relaxed [overflow-wrap:anywhere]">“{row.why}”</p>
    {row.toolsUsed && <p className={s.inviteNobody}>Uses {row.toolsUsed}</p>}
    {row.comment && <p className={`${s.inviteNobody} [overflow-wrap:anywhere]`}>Comment {isLink(row.comment) ? <a className={s.applicationLink} href={row.comment} target="_blank" rel="noopener noreferrer">{row.comment}</a> : row.comment}</p>}
    {row.invite && <p className={s.inviteLink}>{inviteLink(row.invite.code)}</p>}
    <div className={s.inviteActions}>
      <span className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><a href={`https://x.com/${row.x}`} target="_blank" rel="noopener noreferrer">X<ArrowUpRight/></a></Button>
        <Button asChild size="sm" variant="outline"><a href={`https://t.me/${row.telegram}`} target="_blank" rel="noopener noreferrer">Telegram<ArrowUpRight/></a></Button>
      </span>
      <span className="flex flex-wrap gap-2">{row.status === 'accepted' ? row.invite && (row.invite.uses > 0
        ? <span className={s.pill} data-tone="up"><Check size={13} aria-hidden/>Joined</span>
        : <Button size="sm" variant="outline" onClick={() => void copyInvite(row.invite!.code)}>{copied ? <Check/> : <Copy/>}{copied ? 'Copied' : 'Copy invite'}</Button>)
      : row.status === 'rejected' ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set(null)}><RotateCcw/>Restore</Button>
      : <>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set('rejected')}><X/>Reject</Button>
        {row.status === 'checked'
          ? <Button size="sm" disabled={busy} onClick={() => void admit()}>{busy ? <LoaderCircle className="animate-spin"/> : <Ticket/>}Accept</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => void set('checked')}>{busy ? <LoaderCircle className="animate-spin"/> : <Check/>}Check</Button>}
      </>}</span>
    </div>
  </section>;
}

/** New invite: who it is for, how many seats, when it stops working and, optionally, its own code. Ends on the link to share. */
function NewInvite() {
  const create = useMutation(api.invites.create), [open, setOpen] = useState(false);
  const [label, setLabel] = useState(''), [seats, setSeats] = useState(5), [days, setDays] = useState(0), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [made, setMade] = useState<string | null>(null), [copied, setCopied] = useState(false);
  const close = (next: boolean) => { setOpen(next); if (!next) { setLabel(''); setSeats(5); setDays(0); setCode(''); setMade(null); setCopied(false); } };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try { setMade(await create({ maxUses: seats, ...(label.trim() ? { label: label.trim() } : {}), ...(days ? { days } : {}), ...(code.trim() ? { code: code.trim() } : {}) })); }
    catch (cause) { failToast(cause); } finally { setBusy(false); }
  };
  return <>
    <Button size="sm" onClick={() => setOpen(true)}><Plus/>New invite</Button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[28rem]" aria-describedby={undefined}>
        {made ? <div className={s.decision}>
          <div className={s.decisionHead}><span className={s.accountIcon}><Check size={18}/></span><span className={s.grow}><DialogTitle asChild><b>Invite ready</b></DialogTitle><small>{seats} {seats === 1 ? 'seat' : 'seats'}{label.trim() ? ` · ${label.trim()}` : ''}</small></span></div>
          <p className={s.inviteLink}>{inviteLink(made)}</p>
          <div className={s.accountActions}>
            <DialogClose asChild><Button variant="secondary">Done</Button></DialogClose>
            <Button onClick={async () => { if (await copy(made)) setCopied(true); }}>{copied ? <Check/> : <Copy/>}{copied ? 'Copied' : 'Copy link'}</Button>
          </div>
        </div> : <form className={s.decision} onSubmit={submit}>
          <div className={s.decisionHead}><span className={s.accountIcon}><Ticket size={18}/></span><span className={s.grow}><DialogTitle asChild><b>New invite</b></DialogTitle><small>Anyone with the link can join until the seats run out</small></span></div>
          <div className={s.inviteField}><Label htmlFor="invite-label">For</Label><Input id="invite-label" value={label} maxLength={80} placeholder="Who or where it’s for (optional)" onChange={event => setLabel(event.target.value)}/></div>
          <div className={s.inviteField}>
            <Label htmlFor="invite-seats">Seats</Label>
            <div className={s.inviteChoice}><Input id="invite-seats" type="number" min={1} max={10_000} value={seats} onChange={event => setSeats(Math.max(1, Math.min(10_000, Math.round(Number(event.target.value) || 1))))}/><span className={s.seg}>{SEATS.map(n => <button type="button" key={n} aria-pressed={n === seats} onClick={() => setSeats(n)}>{n}</button>)}</span></div>
          </div>
          <div className={s.inviteField}><span className={s.inviteFieldLabel} id="invite-expiry">Expires</span><span className={s.seg} role="group" aria-labelledby="invite-expiry">{DAYS.map(n => <button type="button" key={n} aria-pressed={n === days} onClick={() => setDays(n)}>{n ? `${n} ${n === 1 ? 'day' : 'days'}` : 'Never'}</button>)}</span></div>
          <div className={s.inviteField}><Label htmlFor="invite-code">Code</Label><Input id="invite-code" className={s.inviteCodeInput} value={code} maxLength={24} placeholder="Generated for you" autoComplete="off" spellCheck={false} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/></div>
          <div className={s.accountActions}>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin"/> : <Ticket/>}Create invite</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
