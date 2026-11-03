"use client";
import { useContext, useEffect, useLayoutEffect, ViewTransition } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { useHome } from './useHome';
import { ConvexProvider } from 'convex/react';
import { useAtomValue } from 'jotai';
import { convex } from '@/lib/convex';
import { Loading } from './Parts';
import { bannedAtom, labAtom } from '@/store/user/atoms';
import { takeNavigationScroll, useShellPathname } from '@/lib/appNavigation';
import { MainScrollContext } from '@/lib/scroll-context';
import { LegalGate } from './LegalDialog';
import { AddressNotice } from './Withdraw';
import { launchingAtom, pendingPlanAtom, useStepPreview, useSession, viewedAtom } from './state';
import s from './team.module.css';

// Each page's code loads when the address names it, so one page's charts and editors never weigh on another's first paint.
const loading = () => <Waiting/>;
const Home = dynamic(() => import('./Home').then(module => module.Home), { loading });
const NewStrategy = dynamic(() => import('./NewStrategy').then(module => module.NewStrategy), { loading });
const Onboarding = dynamic(() => import('./Onboarding').then(module => module.Onboarding), { loading });
const StrategiesPage = dynamic(() => import('./Pages').then(module => module.StrategiesPage), { loading });
const StrategyPage = dynamic(() => import('./Pages').then(module => module.StrategyPage), { loading });
const TokenPage = dynamic(() => import('./TokenPage').then(module => module.TokenPage), { loading });
const AccountPage = dynamic(() => import('./Account').then(module => module.AccountPage), { loading });
const BannedPage = dynamic(() => import('./Account').then(module => module.BannedPage), { loading });
const ConnectAgent = dynamic(() => import('./AgentKeys').then(module => module.ConnectAgent));
const BotPage = dynamic(() => import('./BotPage').then(module => module.BotPage), { loading });
const WalletActivityPage = dynamic(() => import('./WalletActivity').then(module => module.WalletActivityPage), { loading });
const LabPage = dynamic(() => import('./LabPage').then(module => module.LabPage), { loading });
const NewPortfolio = dynamic(() => import('./Portfolios').then(module => module.NewPortfolio), { loading });
const PortfolioPage = dynamic(() => import('./Portfolios').then(module => module.PortfolioPage), { loading });
const PortfoliosPage = dynamic(() => import('./Portfolios').then(module => module.PortfoliosPage), { loading });

export type TeamView = 'home' | 'portfolios' | 'strategies' | 'tokens' | 'bots' | 'account' | 'connect' | 'new' | 'wallet-activity' | 'admin' | 'lab';

const VIEWS = ['home', 'portfolios', 'strategies', 'tokens', 'bots', 'account', 'connect', 'new', 'wallet-activity', 'lab'];
/** The page an /app address names, or null when it names none. */
function spotFor(pathname: string): Spot | null {
  let path: string[];
  try { path = pathname.split('/').slice(2).filter(Boolean).map(decodeURIComponent); } catch { return null; }
  const [view = 'home', id] = path;
  if (path.length > 2 || !VIEWS.includes(view) || (view === 'tokens' && !id) || (view === 'bots' && !['research', 'sniper', 'trader'].includes(id ?? '')) || ((view === 'account' || view === 'connect' || view === 'home' || view === 'new' || view === 'wallet-activity') && id)) return null;
  return { view: view as TeamView, id };
}

/** Every /app address gets the same static page, so the page reads its view from the address.  */
export function TeamApp() {
  const pathname = useShellPathname();
  if (!convex) return <div className={s.page}><p className={s.empty}>The app database isn’t configured.</p></div>;
  if (pathname !== '/app' && !pathname.startsWith('/app/')) return <Waiting/>;
  const spot = spotFor(pathname);
  if (!spot) notFound();
  return <ConvexProvider client={convex}><Gate view={spot.view} id={spot.id}/><LegalGate/><AddressNotice/></ConvexProvider>;
}

/** Where a page sits for the phone's slide. A move to a later place enters from the right: a tab further right on the tab bar, or a deeper page.
 *  A move to another section's first page follows the tab bar's order. */
const TABS: Record<TeamView, number> = { home: 0, tokens: 0, bots: 0, strategies: 1, new: 1, portfolios: 2, account: 3, connect: 3, 'wallet-activity': 3, lab: 4, admin: 5 };
type Spot = { view: TeamView; id?: string };
const place = ({ view, id }: Spot) => ({ tab: TABS[view], depth: view === 'tokens' ? 2 : id || view === 'wallet-activity' ? 1 : 0 });
type Place = ReturnType<typeof place>;
const direction = (from: Place, to: Place) => (to.depth === 0 && to.tab !== from.tab ? to.tab - from.tab : to.depth - from.depth || to.tab - from.tab) < 0 ? 'back' : 'forward';

// The page shown last, and whether the browser already animated a swipe back.
let shown: Spot | null = null, swiped = false;
/** Sets `html[data-nav]` for the page swap's slide (globals.css) during the commit that changes the page, before the browser draws the swap. */
function useSlideDirection(view: TeamView, id?: string) {
  // A swipe back that the browser already animated does not slide again.
  useEffect(() => {
    const pop = (event: PopStateEvent) => { swiped = event.hasUAVisualTransition; };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  useLayoutEffect(() => {
    // The page already set it: a repeated run (React's development check mounts twice) would compare the page with itself.
    if (shown?.view === view && shown.id === id) return;
    document.documentElement.dataset.nav = swiped ? 'none' : shown ? direction(place(shown), place({ view, id })) : 'forward';
    shown = { view, id };
    swiped = false;
  }, [view, id]);
}

/** The session or the team is still loading: a page's outline, shown only when that takes a moment, so a quick load goes straight to the page. */
const Waiting = () => <div className={s.page}><Loading variant="page" label="Loading your team"/></div>;

function Gate({ view, id }: { view: TeamView; id?: string }) {
  const session = useSession(), pending = useAtomValue(pendingPlanAtom), launching = useAtomValue(launchingAtom), viewed = useAtomValue(viewedAtom), hasLab = useAtomValue(labAtom), banned = useAtomValue(bannedAtom);
  // The account runtime authenticates the shared Convex client; queries wait until the user record exists. A banned account reads no team.
  const data = useHome(session.connected && !banned), preview = useStepPreview();
  useSlideDirection(view, id);
  const main = useContext(MainScrollContext);
  // A move shows the new page from its top, in the commit that shows it, so the view transition's new picture starts there too.
  useLayoutEffect(() => { if (takeNavigationScroll()) (main?.current ?? document.scrollingElement)?.scrollTo(0, 0); }, [view, id, main]);
  // Onboarding stays up until a plan chosen before sign-in has started (also for people who already have a team), and through its launch step until "Go to my team".
  // The Lab answers like a page that does not exist for everyone an admin did not give it to: signed out, signed in as anyone else, or an unknown account.
  if (view === 'lab') {
    if (!session.ready || (session.signedIn && !session.connected)) return <Waiting/>;
    if (!session.signedIn || !hasLab) notFound();
  }
  if (banned) return <BannedPage/>;
  if (pending || launching || preview) return <Onboarding/>;
  // A page load doesn't know the session yet: wait for it rather than show a signed-in person the signed-out onboarding.
  if (!session.ready || (session.signedIn && !session.connected)) return <Waiting/>;
  // An admin viewing someone without a team sees that, with the viewing bar's way back, never the onboarding.
  if (session.signedIn && data === null && viewed) return <div className={s.page}><p className={s.empty}>{viewed.name} hasn’t started a team yet.</p></div>;
  if (!session.signedIn || data === null) return <Onboarding/>;
  if (data === undefined) return <Waiting/>;
  if (view === 'new') return <NewStrategy data={data}/>;
  // The page swap animates as the route changes (globals.css). The leaving and the arriving page share the name `page`, which the CSS targets: a
  // name works in every browser with view transitions, a class (view-transition-class) only in newer ones. Updates inside a page never animate.
  return <ViewTransition key={`${view}/${id ?? ''}`} name="page" update="none">
    {view === 'home' && <Home data={data}/>}
    {view === 'portfolios' && (id === 'new' ? <NewPortfolio/> : id ? <PortfolioPage id={id}/> : <PortfoliosPage/>)}
    {view === 'strategies' && (id ? <StrategyPage data={data} id={id}/> : <StrategiesPage data={data}/>)}
    {view === 'tokens' && id && <TokenPage id={id} data={data}/>}
    {view === 'bots' && id && <BotPage role={id as 'research' | 'sniper' | 'trader'} data={data}/>}
    {view === 'account' && <AccountPage data={data}/>}
    {/* An agent's OAuth sign-in asks here, over the Account page that lists what is connected. */}
    {view === 'connect' && <><AccountPage data={data}/><ConnectAgent/></>}
    {view === 'wallet-activity' && <WalletActivityPage data={data}/>}
    {view === 'lab' && <LabPage data={data} id={id}/>}
  </ViewTransition>;
}
