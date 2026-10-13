"use client";
import { useEffect } from 'react';
import { notFound } from 'next/navigation';
import { useHome } from './useHome';
import { ConvexProvider } from 'convex/react';
import { useAtomValue } from 'jotai';
import { convex } from '@/lib/convex';
import { Home } from './Home';
import { NewStrategy } from './NewStrategy';
import { Onboarding } from './Onboarding';
import { StrategiesPage, StrategyPage, TokenPage } from './Pages';
import { AccountPage } from './Account';
import { ConnectAgent } from './AgentKeys';
import { AdminPage } from './Admin';
import { BotPage } from './BotPage';
import { WalletActivityPage } from './WalletActivity';
import { LabPage } from './LabPage';
import { NewPortfolio, PortfolioPage, PortfoliosPage } from './Portfolios';
import { Loading } from './Parts';
import { isAdminAtom } from '@/store/user/atoms';
import { addressInvite, launchingAtom, pendingPlanAtom, useSession, viewedAtom } from './state';
import s from './team.module.css';

export type TeamView = 'home' | 'portfolios' | 'strategies' | 'tokens' | 'bots' | 'account' | 'connect' | 'new' | 'wallet-activity' | 'admin' | 'lab';

export function TeamApp({ view, id }: { view: TeamView; id?: string }) {
  if (!convex) return <div className={s.page}><p className={s.empty}>The app database isn’t configured.</p></div>;
  return <ConvexProvider client={convex}><Gate view={view} id={id}/></ConvexProvider>;
}

/** The session or the team is still loading: a page's outline, shown only when that takes a moment, so a quick load goes straight to the page. */
const Waiting = () => <div className={s.page}><Loading variant="page" label="Loading your team"/></div>;

function Gate({ view, id }: { view: TeamView; id?: string }) {
  const session = useSession(), pending = useAtomValue(pendingPlanAtom), launching = useAtomValue(launchingAtom), viewed = useAtomValue(viewedAtom), isAdmin = useAtomValue(isAdminAtom);
  // The account runtime authenticates the shared Convex client; queries wait until the user record exists.
  const data = useHome(session.connected);
  // Someone who already has a team (an admin opening their own invite link) doesn't keep the invite in the address.
  useEffect(() => { if (data && !pending) addressInvite(null); }, [data, pending]);
  // Onboarding stays up until a plan chosen before sign-in has started (also for people who already have a team), and through its launch step until "Go to my team".
  // The admin address answers like a page that does not exist for everyone but an admin: signed out, signed in as anyone else, or an unknown account.
  if (view === 'admin') {
    if (!session.ready || (session.signedIn && !session.connected)) return <Waiting/>;
    if (!session.signedIn || !isAdmin) notFound();
  }
  if (pending || launching) return <Onboarding/>;
  // A page load doesn't know the session yet: wait for it rather than show a signed-in person the signed-out onboarding.
  if (!session.ready || (session.signedIn && !session.connected)) return <Waiting/>;
  // An admin viewing someone without a team sees that, with the viewing bar's way back, never the onboarding.
  if (session.signedIn && data === null && viewed) return <div className={s.page}><p className={s.empty}>{viewed.name} hasn’t started a team yet.</p></div>;
  if (!session.signedIn || data === null) return <Onboarding/>;
  if (data === undefined) return <Waiting/>;
  if (view === 'new') return <NewStrategy data={data}/>;
  return <>
    {view === 'home' && <Home data={data}/>}
    {view === 'portfolios' && (id === 'new' ? <NewPortfolio/> : id ? <PortfolioPage id={id}/> : <PortfoliosPage/>)}
    {view === 'strategies' && (id ? <StrategyPage data={data} id={id}/> : <StrategiesPage data={data}/>)}
    {view === 'tokens' && id && <TokenPage id={id} data={data}/>}
    {view === 'bots' && id && <BotPage role={id as 'research' | 'sniper' | 'trader'} data={data}/>}
    {view === 'account' && <AccountPage data={data}/>}
    {/* An agent's OAuth sign-in asks here, over the Account page that lists what is connected. */}
    {view === 'connect' && <><AccountPage data={data}/><ConnectAgent/></>}
    {view === 'wallet-activity' && <WalletActivityPage data={data}/>}
    {view === 'admin' && <AdminPage/>}
    {view === 'lab' && <LabPage data={data} id={id}/>}
  </>;
}
