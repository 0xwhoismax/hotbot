import type { Metadata } from 'next';
import { Join } from '@/components/team/Join';

const title = 'Apply for HOTBOT';
const description = 'HOTBOT is invite-only. Apply for a seat on your own AI trading team: nine quick questions, about two minutes.';
const image = { url: '/api/og?v=2', width: 1200, height: 630, alt: 'HOTBOT and its specialist bots: your private trading team' };
export const metadata: Metadata = {
  title: { absolute: title }, description,
  openGraph: { title, description, type: 'website', siteName: 'HOTBOT', url: '/join', images: [image] },
  twitter: { card: 'summary_large_image', title, description, images: [image] },
};

/** The application to join HOTBOT, outside the app's shell. */
export default function JoinPage() { return <Join/>; }
