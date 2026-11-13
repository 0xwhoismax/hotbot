import type { Metadata } from 'next';
import { PayLink } from '@/components/team/PayLink';

export const metadata: Metadata = { title: { absolute: 'Pay for HOTBOT' }, robots: { index: false, follow: false } };

/** A pass quote's pay page, outside the app's shell: a computer's QR code and a phone wallet's own browser open it with `?id=&ref=`. */
export default function PayPage() { return <main className="grid min-h-dvh place-items-center p-6"><PayLink/></main>; }
