import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
const isDev = process.env.NODE_ENV === 'development';
function connections(value?: string) {
  if (!value) return '';
  try { const url = new URL(value); return ` ${url.origin} ${url.origin.replace(/^http/, 'ws')}`; } catch { return ''; }
}
const convexConnections = connections(process.env.NEXT_PUBLIC_CONVEX_URL);
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:" + convexConnections.split(' ').filter(value => value.startsWith('http')).map(value => ` ${value}`).join(''),
  "font-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  "frame-src 'self' blob:",
  "connect-src 'self' https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com https://*.helius-rpc.com wss://*.helius-rpc.com https://api.dexscreener.com" + convexConnections + connections(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) + (isDev ? ' ws://localhost:3000 ws://127.0.0.1:3000' : ''),
  "worker-src 'self' blob:", "manifest-src 'self'",
].join('; ');
const config = (phase: string): NextConfig => {
  // Public env is inlined at build time: a build without it ships an app nobody can log in to.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error('Missing NEXT_PUBLIC_CONVEX_URL. Add it to client/.env.production.local before building.');
  return {
    devIndicators: false,
    // Gzip holds an event stream (/dev/stream/events) until its buffer fills, and under `bun --bun` the dev server ignores the route's
    // no-transform. Production is served by Cloudflare, which compresses on its own.
    ...(isDev ? { compress: false } : {}),
    turbopack: { root: resolve(__dirname, '..'), resolveAlias: { pino: './src/utils/pino-stub.js', 'thread-stream': './src/utils/pino-stub.js' } },
    async rewrites() { return { beforeFiles: [
      { source: '/litepaper', destination: '/litepaper/index.html' },
    ] }; },
    async headers() { return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }] },
    ]; },
  };
};
export default config;
