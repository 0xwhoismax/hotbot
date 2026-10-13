import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { hostIsLocal } from '../../types/devGuard';

const cache = new Map<string, { expiresAt: number; blocked: boolean }>();
const CACHE_TTL_MS = 5_000;

/** Private execution endpoints fail closed if account/IP access cannot be checked. */
export async function proxy(req: NextRequest, event: NextFetchEvent) {
  // The development server answers only a request that names loopback, and a write only from a page of its own origin: a web page open
  // in the same browser could otherwise read it by DNS rebinding, or send it a write from another site (types/devGuard.ts).
  if (process.env.NODE_ENV === 'development') {
    const origin = req.headers.get('origin');
    const crossSite = req.method !== 'GET' && req.method !== 'HEAD' && origin !== null && !hostIsLocal(new URL(origin).host);
    if (!hostIsLocal(req.headers.get('host')) || crossSite) return new NextResponse('Not allowed.', { status: 403 });
  }
  // One origin: sign-in lives in the browser's storage for the origin, so www would look signed out (and OAuth returns to SITE_URL).
  const host = req.headers.get('host') ?? '';
  if (host.startsWith('www.')) {
    const url = req.nextUrl.clone();
    url.host = host.slice(4); url.port = '';
    return NextResponse.redirect(url, 308);
  }
  if (process.env.NODE_ENV === 'development') return NextResponse.next();
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return req.nextUrl.pathname === '/api/solana-rpc'
    ? NextResponse.json({ error: 'Authentication required' }, { status: 401 }) : NextResponse.next();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return NextResponse.json({ error: 'Account services unavailable' }, { status: 503 });
  // Deployment ingress must replace these headers; never expose the app server around that ingress.
  const ipAddress = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const key = `${token}:${ipAddress}`;
  let result = cache.get(key);
  if (!result || result.expiresAt <= Date.now()) {
    try {
      const response = await fetch(`${url}/api/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: 'adminBlocks:checkAccess', args: { ipAddress: ipAddress || undefined }, format: 'json' }),
        signal: AbortSignal.timeout(2500), cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || body.status !== 'success' || typeof body.value?.blocked !== 'boolean') throw new Error('Access check unavailable');
      result = { expiresAt: Date.now() + CACHE_TTL_MS, blocked: body.value.blocked };
      for (const [entry, value] of cache) if (value.expiresAt <= Date.now() || cache.size >= 500) cache.delete(entry);
      cache.set(key, result);
      if (ipAddress) event.waitUntil(fetch(`${url}/api/mutation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path: 'adminBlocks:recordAccess', args: { ipAddress }, format: 'json' }),
      }).catch(() => undefined));
    } catch { return NextResponse.json({ error: 'Account access check unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  }
  if (result.blocked) return NextResponse.json({ error: 'Access blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.next();
}
// /api/lab checks the sign-in token itself, with no Convex call (route.ts).
export const config = { matcher: ['/((?!_next|static|favicon.ico|manifest.webmanifest|api-mobula|api/lab|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|css|js)$).*)'] };
