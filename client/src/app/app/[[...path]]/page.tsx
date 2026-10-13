import { notFound } from 'next/navigation';
import { TeamApp, type TeamView } from '@/components/team/TeamApp';
import { ADMIN_PATH } from '../../../../../types/adminPath';
export default async function AppPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const [view = 'home', id] = path;
  if (path.length > 2 || !['home', 'portfolios', 'strategies', 'tokens', 'bots', 'account', 'connect', 'new', 'wallet-activity', ADMIN_PATH, 'lab'].includes(view) || (view === 'tokens' && !id) || (view === 'bots' && !['research', 'sniper', 'trader'].includes(id ?? '')) || ((view === 'account' || view === 'connect' || view === 'home' || view === 'new' || view === 'wallet-activity' || view === ADMIN_PATH) && id)) notFound();
  return <TeamApp view={(view === ADMIN_PATH ? 'admin' : view) as TeamView} id={id}/>;
}
