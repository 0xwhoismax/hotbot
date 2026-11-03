import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
const isDev = process.env.NODE_ENV === 'development';
function connections(value?: string) {
  if (!value) return '';
  try { const url = new URL(value); return ` ${url.origin} ${url.origin.replace(/^http/, 'ws')}`; } catch { return ''; }
}
const convexConnections = connections(process.env.NEXT_PUBLIC_CONVEX_URL);
/** The market gateway's address, which the browser reads directly (src/services/market.ts). Only development may leave it unset. */
const marketUrl = process.env.NEXT_PUBLIC_MARKET_URL || 'http://127.0.0.1:3297';
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:" + convexConnections.split(' ').filter(value => value.startsWith('http')).map(value => ` ${value}`).join(''),
  "font-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  // Crossmint's signer frame, its device key frame (the React SDK's IframeDeviceSignerKeyStorage, which getWallet waits on) and its API: an
  // email-recovered wallet approves withdrawals there (components/team/EmailApproval.tsx).
  "frame-src 'self' blob: https://signers.crossmint.com https://devicekey.store",
  "connect-src 'self' https://lite-api.jup.ag https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com https://api.dexscreener.com https://www.crossmint.com https://telemetry.crossmint.com" + convexConnections + connections(marketUrl) + connections(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) + (isDev ? ' ws://localhost:3000 ws://127.0.0.1:3000' : ''),
  "worker-src 'self' blob:", "manifest-src 'self'",
].join('; ');
const security = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];
const config = (phase: string): NextConfig => {
  // Public env is inlined at build time: a build without it ships an app nobody can log in to.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error('Missing NEXT_PUBLIC_CONVEX_URL. Add it to client/.env.production.local before building.');
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_MARKET_URL) throw new Error('Missing NEXT_PUBLIC_MARKET_URL. Add it to client/.env.production.local before building.');
  return {
    env: { NEXT_PUBLIC_MARKET_URL: marketUrl },
    devIndicators: false,
    // The /dev pages and routes are `page.dev.tsx` and `route.dev.ts`: only development builds them, so their code never ships.
    pageExtensions: [...(phase === PHASE_DEVELOPMENT_SERVER ? ['dev.tsx', 'dev.ts'] : []), 'tsx', 'ts', 'jsx', 'js'],
    // The dev disk cache holds more memory and disk than it saves on a restart.
    experimental: { turbopackFileSystemCacheForDev: false },
    // The dev server serves loopback, where gzip only costs CPU. Production is served by Cloudflare, which compresses on its own.
    ...(isDev ? { compress: false } : {}),
    turbopack: { root: resolve(__dirname, '..'), resolveAlias: { pino: './src/utils/pino-stub.js', 'thread-stream': './src/utils/pino-stub.js' } },
    async rewrites() { return { beforeFiles: [
      { source: '/litepaper', destination: '/litepaper/index.html' },
    ] }; },
    async headers() { return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }, ...security] },
      // /app/connect is the Agent API's OAuth consent, which a connector may open in a popup and wait on: any COOP would cut that link.
      { source: '/app/:path*', headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }] },
    ]; },
  };
};
export default config;
