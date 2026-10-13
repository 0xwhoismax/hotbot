import type { Metadata } from 'next';
import { InviteLink } from '@/components/team/InviteLink';

const title = 'You’re invited to HOTBOT';
const description = 'Your seat on an AI trading team: bots that find Solana memecoins, buy the entry and sell the exits for you, around the clock.';
const image = { url: '/hotbot/invite-og.jpg', width: 2400, height: 1260, alt: 'ResearchBot’s panorama of thousands of checked Solana coins, with its best trade in focus. You’re invited to HOTBOT.' };

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: { absolute: title }, description, robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website', siteName: 'HOTBOT', url: `/invite/${encodeURIComponent(code)}`, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** An invite link: its preview is the invite card; opening it keeps the code and goes on to the app, where signing in takes the seat. */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteLink code={code}/>;
}
