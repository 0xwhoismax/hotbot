"use client";
import { useHome } from './useHome';
import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConvexProvider } from 'convex/react';
import { useAtomValue } from 'jotai';
import { Flag, House, Plus, Route, ChevronRight, ArrowLeftRight, ShieldCheck, FlaskConical, Wallet, Wrench, PieChart } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Hotbot } from '@/components/hotbot/Hotbot';
import { api, convex, useQuery } from '@/lib/convex';
import { currentUserIdAtom, isAdminAtom, useSignedOut } from '@/store/user/atoms';
import { signedSol, usd } from './format';
import { TokenAvatar } from '@/components/token/TokenAvatar';
import { SOL_MINT } from '@/lib/solana';
import { SOL_LOGO } from './data';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TeamWallet } from './TeamWallet';
import { useReport } from './Report';
import { FirstTip } from './Parts';
import { viewAsAtom } from './state';
import { ADMIN_PATH } from '../../../../types/adminPath';
import s from './team.module.css';

const pages = [['/app', 'Home', House], ['/app/portfolios', 'Portfolios', PieChart], ['/app/strategies', 'Strategies', Route], ['/app/wallet-activity', 'Wallet activity', ArrowLeftRight], ['/app/lab', 'Lab', FlaskConical]] as const;
/** Admins also get the admin page: everyone's teams and the invites. */
const admin = [[`/app/${ADMIN_PATH}`, 'Admin', ShieldCheck]] as const;
/** Local builds only: one link to /dev, whose cards open the development pages (each is notFound in production, and this list is empty there). */
export const dev = process.env.NODE_ENV === 'development' ? [['/dev', 'Dev', Wrench]] as const : [];

/** Navigation, then your strategies like a chat list, then one account row. */
export function TeamSidebar({ accountControls }: { accountControls?: ReactNode }) {
  const pathname = usePathname(), { setOpenMobile } = useSidebar(), signedOut = useSignedOut(), isAdmin = useAtomValue(isAdminAtom), report = useReport();
  const lab = useRef<HTMLAnchorElement>(null);
  const active = (href: string) => href === '/app' ? pathname === '/app' || pathname.startsWith('/app/tokens') : href === '/app/strategies' ? pathname === '/app/strategies' || pathname === '/app/new' : href === '/app/portfolios' ? pathname === '/app/portfolios' || pathname === '/app/portfolios/new' : pathname.startsWith(href);
  return <Sidebar collapsible="icon" variant="floating">
    <SidebarHeader className="px-4 pt-4 pb-3 group-data-[collapsible=icon]:px-2"><div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col"><Link href="/app" aria-label="HOTBOT home" className="flex items-center gap-2.5" onClick={() => setOpenMobile(false)}><Hotbot size={30} shape="flame" color="#f47a38"/><span className="text-[0.875rem] font-semibold tracking-[0.14em] group-data-[collapsible=icon]:hidden">HOTBOT</span></Link>{!signedOut && <SidebarTrigger aria-label="Minimize or expand navigation"/>}</div></SidebarHeader>
    <SidebarContent className="gap-4">
      {!signedOut && <SidebarGroup className="py-0"><SidebarGroupContent><SidebarMenu className="gap-1">
        {[...pages, ...(isAdmin ? admin : []), ...dev].map(([href, label, Icon]) => <SidebarMenuItem key={href}><SidebarMenuButton asChild tooltip={label} isActive={active(href)} className={s.navBtn}><Link ref={href === '/app/lab' ? lab : undefined} href={href} onClick={() => setOpenMobile(false)}><Icon/><span>{label}</span>{href === '/app/portfolios' && <span className={`${s.navNew} group-data-[collapsible=icon]:hidden`}>New</span>}</Link></SidebarMenuButton></SidebarMenuItem>)}
        <SidebarMenuItem><SidebarMenuButton tooltip="Report a problem (F)" className={s.navBtn} aria-keyshortcuts="F" onClick={() => { setOpenMobile(false); report.pick(); }}><Flag className={s.reportFlag}/><span>Report a problem</span></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup>}
      {!signedOut && <FirstTip id="lab" anchor={lab} when={/^\/app\/strategies\/[^/]+$/.test(pathname)} side="right" title="Test changes in the Lab" text="It backtests any change to a strategy, and AI suggests improvements right on screen."/>}
      {convex && <ConvexProvider client={convex}><SidebarStrategies pathname={pathname} onNavigate={() => setOpenMobile(false)}/></ConvexProvider>}
    </SidebarContent>
    <SidebarFooter className="p-3 group-data-[collapsible=icon]:px-2"><div className="w-full">{accountControls}</div></SidebarFooter>
    {!signedOut && <SidebarRail/>}
  </Sidebar>;
}

function SidebarStrategies({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const userId = useAtomValue(currentUserIdAtom), data = useHome(Boolean(userId));
  if (!data) return null;
  const total = data.money.openPnl + data.workspace.realizedPnlSol;
  return <><SidebarPortfolios pathname={pathname} onNavigate={onNavigate}/>
  <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
    <SidebarGroupLabel className={s.navLabel}>Strategies<Link href="/app/new" onClick={onNavigate} className={s.navAdd} aria-label="New strategy"><Plus/></Link></SidebarGroupLabel>
    <SidebarGroupContent><SidebarMenu className="gap-0.5">
      {/* Running strategies first; paused ones (and any selling out to be archived) keep their order below. */}
      {[...data.strategies].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running')).map(row => { const pnl = row.realizedPnlSol + row.openPnlSol; return <SidebarMenuItem key={row.id}>
        <SidebarMenuButton asChild isActive={pathname === '/app/strategies/' + row.id} className={s.stratBtn}><Link href={'/app/strategies/' + row.id} onClick={onNavigate}>
          <span className="size-[0.4rem] shrink-0 rounded-full" style={{ background: row.status === 'running' ? 'var(--positive)' : row.status === 'archiving' ? 'var(--ember)' : 'color-mix(in oklab, var(--foreground) 30%, transparent)' }}/>
          <span className={`truncate ${s.stratName}`}>{row.name}</span>
          {/* Its profit is in the portfolio it trades in: the wallet marks the ones spending Real SOL. */}
          {row.mode === 'live' && <Wallet className="size-3 shrink-0" style={{ color: 'var(--ember)' }} aria-label="Trades Real SOL"><title>Trades Real SOL</title></Wallet>}
          <span className={s.stratPnl} style={{ color: Math.abs(pnl) < 1e-9 ? 'var(--muted-foreground)' : pnl > 0 ? 'var(--positive)' : 'var(--destructive)' }}>{signedSol(pnl).replace(' SOL', '')}</span>
        </Link></SidebarMenuButton>
      </SidebarMenuItem>; })}
      <SidebarMenuItem><SidebarMenuButton asChild className={`${s.stratBtn} ${s.stratNew}`}><Link href="/app/new" onClick={onNavigate}><Plus className="size-4"/><span>New strategy</span></Link></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarGroupContent>
  </SidebarGroup>
  <Dialog><DialogTrigger asChild><button type="button" className={`${s.navBalance} group-data-[collapsible=icon]:!m-0 group-data-[collapsible=icon]:!mt-auto group-data-[collapsible=icon]:!mx-auto group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!bg-transparent`} aria-label="Open team wallet">
    <TokenAvatar className="size-8 rounded-full" address={SOL_MINT} logoUrl={SOL_LOGO} symbol="SOL" network="solana" fallback="letter" disableDetailFallback/>
    <span className={`${s.navBalanceText} group-data-[collapsible=icon]:!hidden`}><b>{data.money.equity.toFixed(2)} SOL</b><small>{usd(data.money.equity * data.money.solUsd)} · <span className={s[Math.abs(total) < 1e-9 ? 'muted' : total > 0 ? 'up' : 'down']}>{signedSol(total, 2)}</span> · {data.workspace.mode === 'paper' ? 'Practice' : 'Real SOL'}</small></span>
    <ChevronRight size={14} className={`${s.navBalanceArrow} group-data-[collapsible=icon]:!hidden`}/>
  </button></DialogTrigger><DialogContent className={s.teamWalletDialog} aria-describedby={undefined}><DialogTitle className="sr-only">Team wallet</DialogTitle><TeamWallet data={data}/></DialogContent></Dialog></>;
}

/** The team's portfolios like the strategies below them: worth against the start, and the ember dot while one needs the person. Hidden until there is one. */
function SidebarPortfolios({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const rows = useQuery(api.portfolios.list, { ...useAtomValue(viewAsAtom) });
  if (!rows?.length) return null;
  return <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
    <SidebarGroupLabel className={s.navLabel}>Portfolios<Link href="/app/portfolios/new" onClick={onNavigate} className={s.navAdd} aria-label="New portfolio"><Plus/></Link></SidebarGroupLabel>
    <SidebarGroupContent><SidebarMenu className="gap-0.5">
      {rows.map(row => { const pnl = row.valueSol - row.startSol; return <SidebarMenuItem key={row.id}>
        <SidebarMenuButton asChild isActive={pathname === '/app/portfolios/' + row.id} className={s.stratBtn}><Link href={'/app/portfolios/' + row.id} onClick={onNavigate}>
          <span className="size-[0.4rem] shrink-0 rounded-full" style={{ background: row.asks ? 'var(--ember)' : row.status === 'running' || row.status === 'picking' ? 'var(--positive)' : 'color-mix(in oklab, var(--foreground) 30%, transparent)' }}/>
          <span className={`truncate ${s.stratName}`}>{row.name}</span>
          <span className={s.stratPnl} style={{ color: Math.abs(pnl) < 1e-9 ? 'var(--muted-foreground)' : pnl > 0 ? 'var(--positive)' : 'var(--destructive)' }}>{signedSol(pnl).replace(' SOL', '')}</span>
        </Link></SidebarMenuButton>
      </SidebarMenuItem>; })}
    </SidebarMenu></SidebarGroupContent>
  </SidebarGroup>;
}
