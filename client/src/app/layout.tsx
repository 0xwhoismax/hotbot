import { BasicsShell } from '@/components/BasicsShell';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';
import { appearanceBootScript } from '@/lib/appearance';
/** Edge to edge on phones: the page runs under the status bar, the notch and the home indicator; content keeps clear of them with `env(safe-area-inset-*)`. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: { default: 'HOTBOT', template: '%s · HOTBOT' }, description: 'User-controlled agent teams for Solana research and paper trading.',
  openGraph: { title: 'HOTBOT', description: 'User-controlled agent teams for Solana research and paper trading.', type: 'website', siteName: 'HOTBOT', images: [{ url: '/api/og?v=2', width: 1200, height: 630, alt: 'HOTBOT and its specialist bots: your private trading team' }] },
  twitter: { card: 'summary_large_image', title: 'HOTBOT', images: [{ url: '/api/og?v=2', alt: 'HOTBOT and its specialist bots: your private trading team' }] },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  // Saved to the home screen it opens as an app, drawn under a see-through status bar.
  appleWebApp: { capable: true, title: 'HOTBOT', statusBarStyle: 'black-translucent' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} /></head><body><Providers><BasicsShell>{children}</BasicsShell></Providers></body></html>;
}
