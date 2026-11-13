import type { Metadata } from 'next';
import { HotbotLanding } from '@/components/hotbot/landing/HotbotLanding';
import { HOTBOT_MINT as contract } from '../../../types/hotbot';

const pumpFun = `https://pump.fun/coin/${contract}`;

const ogImage = { url: '/api/og?v=2', width: 1200, height: 630, alt: 'HOTBOT and its specialist bots: your private trading team' };
export const metadata: Metadata = {
  title: { absolute: 'HOTBOT — Your private trading team' },
  description: 'Your private trading team of specialist bots working together wherever you trade. Research, snipe, trade, launch + more.',
  openGraph: { title: 'HOTBOT — Your private trading team', description: 'Your private trading team of specialist bots working together wherever you trade. Research, snipe, trade, launch + more.', type: 'website', siteName: 'HOTBOT', images: [ogImage] },
  twitter: { card: 'summary_large_image', title: 'HOTBOT — Your private trading team', description: 'Your private trading team of specialist bots working together wherever you trade. Research, snipe, trade, launch + more.', images: [ogImage] },
};

export default function Home() {
  return (
    <HotbotLanding links={{
      app: process.env.NEXT_PUBLIC_HOTBOT_APP_URL || '/app',
      buy: pumpFun,
      contract,
    }} />
  );
}
