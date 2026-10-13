import type { MetadataRoute } from 'next';
/** Added to a phone's home screen, HOTBOT opens straight into the app, full screen, on the dark theme's background. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HOTBOT',
    short_name: 'HOTBOT',
    description: 'User-controlled agent teams for Solana research and paper trading.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
