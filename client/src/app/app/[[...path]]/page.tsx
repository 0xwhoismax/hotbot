import { TeamApp } from '@/components/team/TeamApp';

/** One static page for every /app address: Cloudflare serves it for /app/* (public/_redirects), and TeamApp reads the view from the address. */
export const generateStaticParams = () => [{ path: [] }];
export default function AppPage() { return <TeamApp/>; }
