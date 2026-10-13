import type { NextRequest } from 'next/server';

/** Google and Apple sign-in start and return on this domain (Convex's CUSTOM_AUTH_SITE_URL), so this forwards /api/auth/* to the
 *  Convex deployment's HTTP routes: cookies pass both ways and redirects go back to the browser untouched. */
function convexSite() {
  const url = new URL(process.env.NEXT_PUBLIC_CONVEX_URL ?? '');
  // A cloud deployment serves HTTP routes on .convex.site; a local backend one port above its API.
  if (url.hostname.endsWith('.convex.cloud')) url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site');
  else url.port = String(Number(url.port) + 1);
  return url.origin;
}

async function forward(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: 'Account services unavailable' }, { status: 503 });
  const headers = new Headers();
  for (const name of ['cookie', 'content-type', 'user-agent', 'accept']) { const value = req.headers.get(name); if (value) headers.set(name, value); }
  const response = await fetch(convexSite() + req.nextUrl.pathname + req.nextUrl.search, {
    method: req.method, headers, body: req.method === 'POST' ? await req.arrayBuffer() : undefined, redirect: 'manual', cache: 'no-store',
  });
  const out = new Headers({ 'cache-control': 'no-store' });
  for (const name of ['location', 'content-type']) { const value = response.headers.get(name); if (value) out.set(name, value); }
  for (const cookie of response.headers.getSetCookie()) out.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, headers: out });
}

export const GET = forward;
export const POST = forward;
