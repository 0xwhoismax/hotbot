"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAtom, useAtomValue } from 'jotai';
import { ArrowLeft, ArrowLeftRight, Flag, FlaskConical, House, Menu, Plus, Route, ShieldCheck } from 'lucide-react';
import { SavedAppearancePicker } from '@/components/account/SavedAppearancePicker';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { Hotbot } from '@/components/hotbot/Hotbot';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useScrollDirection } from '@/lib/scroll-context';
import { currentUserIdAtom, isAdminAtom, userStateAtom } from '@/store/user/atoms';
import type { Bag, HomeData } from './data';
import { pct, signedSol, sol, tone } from './format';
import { useDayChange } from './ProfitChart';
import { FirstTip, useNow } from './Parts';
import { dockOpenAtom, launchingAtom, pendingPlanAtom, settingsEditingAtom, viewedAtom } from './state';
import { BOTS, type Role } from './TeamPanel';
import { useHome } from './useHome';
import { useReport } from './Report';
import { dev } from './TeamSidebar';
import { ADMIN_PATH } from '../../../../types/adminPath';
import s from './team.module.css';

type Coin = Bag['token'];
/** One thing the live line says: which bot, about which coin, what it did or is doing. */
type Line = { key: string; role: Role | 'coordinator'; coin?: Coin; text: string; amount?: { value: string; tone?: string }; warn?: boolean };
type Moment = Line & { at: number };

/** How long each line stays before the header moves on, and how long something that just happened stays in the rotation. */
const SLOT = 3500, FRESH = 30_000;
const pages = [['/app/wallet-activity', 'Wallet activity', ArrowLeftRight], ['/app/lab', 'Lab', FlaskConical], ['/app/new', 'New strategy', Plus]] as const;
const admin = [[`/app/${ADMIN_PATH}`, 'Admin', ShieldCheck]] as const;

/** Phones have no side panels. The header is HOTBOT's live line (what the team is doing right now; it opens Home, where the activity is) with the balance and its
 *  all-time profit on the right (Home's own header is the balance); scrolling down tucks it away. A strategy page has no such header: its own
 *  carries back, Pause/Run and Settings. The bottom bar is one capsule of tabs: Home,
 *  Strategies, HOTBOT in the middle (its composer over any page; the bar steps aside while it is up), Profile and Menu (account row, the other
 *  pages, Theme last) that shrinks while scrolling down. Typing hides
 *  the bar; unsaved Settings edits slide it away and their Reset/Save bar slides up in its place. Everything is read from the home the pages already watch. */
export function MobileNav({ accountControls }: { accountControls?: ReactNode }) {
  const mobile = useIsMobile(), pathname = usePathname(), userId = useAtomValue(currentUserIdAtom), pending = useAtomValue(pendingPlanAtom), launching = useAtomValue(launchingAtom);
  const data = useHome(Boolean(mobile && userId));
  // New strategy is a focused flow with its own Cancel and a button pinned to the bottom, so the header and the bar step aside there.
  // While the team loads (undefined) the bar is already there and the header holds its place; no team (null) means onboarding.
  if (!mobile || !userId || data === null || pending || launching || !pathname.startsWith('/app') || pathname === '/app/new') return null;
  return <Nav data={data} pathname={pathname} accountControls={accountControls}/>;
}

/** What just happened between two snapshots of home: buys that filled, take-profits, sales and new picks. A sale's profit is what its strategy
 *  realized in the same update, shown only when that strategy sold one coin in it. */
function moments(before: HomeData, after: HomeData, at: number): Moment[] {
  if (before.workspace.mode !== after.workspace.mode) return [];
  const held = new Map(before.bags.map(bag => [bag.id, bag])), still = new Set(after.bags.map(bag => bag.id));
  const sales: { bag: Bag; text: string; rung: number }[] = [], found: Moment[] = [];
  for (const bag of after.bags) {
    const was = held.get(bag.id);
    if (bag.stage === 'held' && (!was || was.stage === 'buying')) found.push({ key: bag.id + ':bought', at, role: 'trader', coin: bag.token, text: 'Bought', amount: bag.entry ? { value: sol(bag.entry.sol, 2) } : undefined });
    else if (was && (bag.sold?.rungs ?? 0) > (was.sold?.rungs ?? 0)) sales.push({ bag, text: 'Took profit', rung: bag.sold?.rungs ?? 0 });
  }
  for (const bag of before.bags) if (!still.has(bag.id) && bag.stage !== 'buying') sales.push({ bag, text: 'Sold', rung: -1 });
  const realized = (data: HomeData, id: string) => data.strategies.find(row => row.id === id)?.realizedPnlSol;
  for (const { bag, text, rung } of sales) {
    const a = realized(before, bag.strategyId), b = realized(after, bag.strategyId), alone = sales.filter(row => row.bag.strategyId === bag.strategyId).length === 1;
    const pnl = alone && a != null && b != null && Math.abs(b - a) > 1e-9 ? b - a : null;
    found.push({ key: `${bag.id}:${rung}`, at, role: 'trader', coin: bag.token, text, amount: pnl == null ? undefined : { value: signedSol(pnl).replace(' SOL', ''), tone: tone(pnl) } });
  }
  // A pick that goes straight to an ask shows as SniperBot's "Wants your OK" instead.
  const waiting = new Set([...before.needs, ...before.watching].map(item => item.id));
  for (const item of after.watching) if (!waiting.has(item.id)) found.push({ key: item.id + ':picked', at, role: 'research', coin: item.token, text: 'Picked' });
  return found;
}

/** What the team is doing right now: buys waiting on you first, then coins in flight, checks and waits, then what is held or the team's state. */
function current(data: HomeData): Line[] {
  if (data.workspace.halted) return [{ key: 'halted', role: 'coordinator', text: 'Team stopped' }];
  if (!data.worker.online) return [{ key: 'offline', role: 'coordinator', text: 'Reconnecting to your team' }];
  const lines: Line[] = [
    ...data.needs.slice(0, 2).map(item => ({ key: item.id + ':ask', role: 'sniper' as const, coin: item.token, text: 'Wants your OK', warn: true })),
    ...data.bags.filter(bag => bag.stage !== 'held').map(bag => ({ key: bag.id + ':' + bag.stage, role: 'trader' as const, coin: bag.token, text: bag.stage === 'buying' ? 'Buying…' : 'Selling…' })),
    ...data.researching.map(item => ({ key: item.id + ':check', role: 'research' as const, coin: item.token, text: 'Checking' })),
    ...data.watching.slice(0, 3).map(item => ({ key: item.id + ':wait', role: 'sniper' as const, coin: item.token, text: 'Waiting to buy' })),
  ];
  const held = data.bags.filter(bag => bag.stage === 'held').length;
  if (held) lines.push({ key: 'held', role: 'trader', text: `Watching ${held} ${held === 1 ? 'coin' : 'coins'}` });
  if (!lines.length) lines.push(data.strategies.some(row => row.status === 'running') ? { key: 'scan', role: 'research', text: 'Scanning for new coins' } : { key: 'paused', role: 'coordinator', text: 'Team paused' });
  return lines;
}

/** One rolling copy of the live line: the bot's face (and the coin's), then who and what. */
function Slot({ line, small, role, onDone }: { line: Line; small: boolean; role: 'in' | 'out'; onDone?: () => void }) {
  const who = line.role === 'coordinator' ? 'HOTBOT' : BOTS[line.role].name, text = useRef<HTMLSpanElement>(null), [clipped, setClipped] = useState(false);
  // The edge fade shows only when the text really runs past the line; a line that fits is never dimmed.
  useLayoutEffect(() => {
    const node = text.current;
    if (!node) return;
    const measure = () => setClipped(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [line]);
  return <span className={s.mSlot} data-in={role === 'in' || undefined} data-out={role === 'out' || undefined} onAnimationEnd={role === 'out' ? onDone : undefined} aria-hidden>
    <span className={s.mFaces}>
      <span><BotAvatar role={line.role} size={small ? 22 : 28}/></span>
      {line.coin && <span className={s.mCoin}><TokenAvatar className="size-6 rounded-full" address={line.coin.address} logoUrl={line.coin.logoUri} symbol={line.coin.symbol} network="solana" fallback="letter" disableDetailFallback/></span>}
    </span>
    <span ref={text} className={s.mLine} data-warn={line.warn || undefined} data-clipped={clipped || undefined}>
      <small>{who}{line.coin && ' · ' + line.coin.symbol}</small>
      <span>{line.text}{line.amount && <> <em className={line.amount.tone ? s[line.amount.tone] : s.muted}>{line.amount.value}</em></>}</span>
    </span>
  </span>;
}

function Nav({ data, pathname, accountControls }: { data?: HomeData; pathname: string; accountControls?: ReactNode }) {
  const visible = useScrollDirection(), isAdmin = useAtomValue(isAdminAtom), profile = useAtomValue(userStateAtom).profileData, viewing = Boolean(useAtomValue(viewedAtom)), userId = useAtomValue(currentUserIdAtom);
  const [asking, setAsking] = useAtom(dockOpenAtom);
  const [menu, setMenu] = useState(false), [lastAt, setLastAt] = useState(0), report = useReport();
  const askButton = useRef<HTMLButtonElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const name = profile?.username || 'Your account', needs = data?.needs.length ?? 0;
  const home = pathname === '/app' || pathname.startsWith('/app/tokens'), strategies = pathname.startsWith('/app/strategies');
  // A strategy page has no header here: its own carries back, Pause/Run and Settings.
  const editing = useAtomValue(settingsEditingAtom), strategyPage = /^\/app\/strategies\/[^/]+$/.test(pathname), hidden = !visible || strategyPage;
  // iOS raises the keyboard only for a focus inside the tap, so the composer opens synchronously and takes the focus here.
  const ask = () => { flushSync(() => setAsking(true)); document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Tell HOTBOT"]')?.focus(); };
  // Which tab holds the highlight; it slides between them and keeps its last place while no tab is current.
  const at = menu ? 4 : pathname === '/app/account' ? 3 : strategies ? 1 : home ? 0 : null;
  if (at !== null && at !== lastAt) setLastAt(at);
  return <>
    {/* A strategy page carries its own header, so this one slides away (and back) instead of unmounting. Until the team loads it holds the live line's and the balance's places. */}
    {data ? <Header data={data} pathname={pathname} hidden={hidden} strategyPage={strategyPage}/>
      : <header className={s.mTop} data-hidden={hidden || undefined} inert={strategyPage || undefined}><span className={`${s.ghost} ${s.mGhost}`} role="status" aria-label="Loading your team"><i/><i/><i/></span></header>}
    {/* Scrolling down shrinks the bar, as it tucks the header away; scrolling up brings it back to full size. */}
    <div className={s.mBar} data-away={asking || editing || undefined}>
      <nav className={s.mTabs} data-compact={!visible || undefined} data-lit={at !== null || undefined} style={{ '--at': at ?? lastAt } as CSSProperties} aria-label="Main">
        <span className={s.mPillTrack} aria-hidden><i className={s.mTabHilite}/></span>
        <Link href="/app" className={s.mTab} aria-label="Home" aria-current={home ? 'page' : undefined}><House/></Link>
        <Link href="/app/strategies" className={s.mTab} aria-label="Strategies" aria-current={strategies ? 'page' : undefined}><Route/></Link>
        {/* HOTBOT in the middle; it works for the admin's own team, so it is off while viewing someone else's, and until the team (and its composer) has loaded. */}
        <button ref={askButton} type="button" className={s.mTab} data-hotbot onClick={ask} disabled={viewing || !data} aria-label={needs ? `Ask HOTBOT, ${needs} need you` : 'Ask HOTBOT'}>
          <Hotbot shape="flame" color="#f47a38" size={36}/>
          {needs > 0 && <span className={s.mBadge} aria-hidden>{needs}</span>}
        </button>
        <Link href="/app/account" className={s.mTab} data-avatar aria-label={`Profile, ${name}`} aria-current={pathname === '/app/account' ? 'page' : undefined}>
          <Avatar className="size-7"><AvatarImage src={profile?.avatar ?? undefined} alt=""/><AvatarFallback className="text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
        </Link>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger asChild><button ref={menuButton} type="button" className={s.mTab} aria-label="Menu" data-open={menu || undefined}><Menu/></button></PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={10} className={s.mMenu} onClick={event => { if ((event.target as Element).closest('a')) setMenu(false); }}>
            {accountControls}
            <nav className={s.mMenuLinks} aria-label="More">{[...pages, ...(isAdmin ? admin : []), ...dev].map(([href, label, Icon]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon/>{label}</Link>)}
              <button type="button" onClick={() => { setMenu(false); report.pick(); }}><Flag className={s.reportFlag}/>Report a problem</button>
            </nav>
            {userId && <SavedAppearancePicker key={userId} iconOnly={false}/>}
          </PopoverContent>
        </Popover>
      </nav>
      <FirstTip id="chat" anchor={askButton} when={Boolean(data) && !viewing} side="top" title="Chat with HOTBOT" text="Ask about your team, your coins or a strategy. Try it, try to break it, and tell us what you think."/>
      <FirstTip id="lab" anchor={menuButton} when={strategyPage} side="top" align="end" title="Test changes in the Lab" text="Open the menu, then Lab. It backtests any change, and AI suggests improvements right on screen."/>
    </div>
  </>;
}

/** The header's live line and balance, read from the loaded home. */
function Header({ data, pathname, hidden, strategyPage }: { data: HomeData; pathname: string; hidden: boolean; strategyPage: boolean }) {
  const now = useNow(1000);
  const [seen, setSeen] = useState(data), [events, setEvents] = useState<Moment[]>([]), [laps, setLaps] = useState(0);
  // Each new snapshot of home is compared with the last one; what changed becomes the line's newest entries.
  if (seen !== data) {
    setSeen(data);
    const found = now ? moments(seen, data, now) : [];
    // A moment seen again in a later snapshot keeps its first time, so it neither jumps back nor flashes again.
    const added = found.filter(next => !events.some(row => row.key === next.key));
    if (added.length) { setEvents([...added, ...events].slice(0, 6)); setLaps(laps + 1); }
  }
  const fresh = events.filter(row => now - row.at < FRESH), lines = [...fresh, ...current(data)], newest = fresh[0];
  const line = newest && now - newest.at < SLOT ? newest : lines[Math.floor(now / SLOT) % lines.length];
  const day = useDayChange(data);
  const who = line.role === 'coordinator' ? 'HOTBOT' : BOTS[line.role].name, report = useReport();
  const [last, setLast] = useState(line), [out, setOut] = useState<Line | null>(null);
  if (last.key !== line.key) { setOut(last); setLast(line); }
  // Inside a coin the header is a round back button and a smaller line, with no balance.
  const coin = pathname.match(/^\/app\/tokens\/([^/]+)$/), coinId = coin ? decodeURIComponent(coin[1]) : null;
  const detail = Boolean(coinId), owner = coinId ? [...data.bags, ...data.watching, ...data.needs, ...data.researching].find(row => row.id === coinId)?.strategyId : undefined;
  const backHref = owner ? `/app/strategies/${owner}` : '/app', backLabel = owner ? 'Back to the strategy' : 'Back to Home';
  return <header className={s.mTop} data-hidden={hidden || undefined} inert={strategyPage || undefined}>
    {/* The round back button grows in from nothing, so the line eases aside instead of jumping. */}
    <Link href={backHref} className={s.mBack} data-on={detail || undefined} aria-label={backLabel} aria-hidden={!detail || undefined} tabIndex={detail ? undefined : -1}><ArrowLeft/></Link>
    <Link href="/app" className={s.mLive} data-small={detail || undefined} data-lap={laps ? (laps % 2 ? 'a' : 'b') : undefined} aria-current={pathname === '/app' ? 'page' : undefined} aria-label={`Team activity. ${who}${line.coin ? ' on ' + line.coin.symbol : ''}: ${line.text}${line.amount ? ' ' + line.amount.value : ''}`}>
      {/* A new event rolls up from below while the last one rolls out above. */}
      <span className={s.mRoll} data-rolling={out ? true : undefined}>
        <Slot line={line} small={detail} key={'in:' + line.key} role="in"/>
        {out && <Slot line={out} small={detail} key={'out:' + out.key} role="out" onDone={() => setOut(null)}/>}
      </span>
    </Link>
    {/* Home's own header is the balance; every other page keeps it in this corner; it folds away and back instead of unmounting. */}
    <Link href="/app/account" className={s.mMoney} data-away={pathname === '/app' || undefined} inert={pathname === '/app' || undefined} aria-label={`Team wallet: ${data.money.equity.toFixed(2)} SOL${day == null ? '' : `, ${pct(day)} in 24 hours`}`}>
      <b>{data.money.equity.toFixed(2)}<small>SOL</small></b><small className={s[tone(day) ?? 'muted']}>{pct(day)}</small>
    </Link>
    <Button variant="ghost" size="icon" className={s.mFlag} onClick={() => report.pick()} aria-label="Report a problem"><Flag className={s.reportFlag} fill="currentColor"/></Button>
  </header>;
}
