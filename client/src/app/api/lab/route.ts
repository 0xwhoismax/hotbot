import { getCloudflareContext } from '@opennextjs/cloudflare';
import { hostIsLocal } from '../../../../../types/devGuard';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type LabEnv = { LAB_SERVER?: { fetch: Fetch }; LAB_SECRET?: string; CONVEX_AUTH_JWKS?: string; CONVEX_AUTH_ISSUER?: string };
/** Where the server Lab answers, as the binding's service sees it (127.0.0.1:3296 on the agents VM) or as the dev server reaches it. */
type Target = { fetch: Fetch; url: string; secret: string };
const PATHS = { main: '/main', tips: '/tips', coin: '/coin' } as const;

export async function GET(request: Request) {
  const target = await targetOf(request);
  if (target instanceof Response) return target;
  const search = new URL(request.url).searchParams.get('search');
  return forward(target, search === null ? '/meta' : `/search?q=${encodeURIComponent(search)}`);
}

export async function POST(request: Request) {
  const target = await targetOf(request);
  if (target instanceof Response) return target;
  const body = await request.text();
  let kind: string | undefined;
  try { kind = (JSON.parse(body) as { kind?: string }).kind; } catch { /* answered below */ }
  if (!kind || !(kind in PATHS)) return Response.json({ error: 'Unknown Lab request.' }, { status: 400 });
  return forward(target, PATHS[kind as keyof typeof PATHS], body);
}

/** Where the server Lab is and its secret, or the refusal to send back. */
async function targetOf(request: Request): Promise<Target | Response> {
  // Development has no sign-in check, so the dev server's proxy does not reach this route (it skips /api/lab): it answers a loopback host only.
  if (process.env.NODE_ENV === 'development' && !hostIsLocal(request.headers.get('host'))) return new Response('Not allowed.', { status: 403 });
  if (process.env.NODE_ENV === 'development') { return { fetch: (input, init) => fetch(input, init), url: process.env.LAB_URL ?? 'http://127.0.0.1:3296', secret: process.env.LAB_SECRET ?? '' }; }
  const env = (await getCloudflareContext({ async: true })).env as LabEnv;
  const server = env.LAB_SERVER;
  if (!server || !env.LAB_SECRET || !env.CONVEX_AUTH_JWKS || !env.CONVEX_AUTH_ISSUER) return Response.json({ error: 'The Lab isn’t set up here yet.' }, { status: 503 });
  if (!await signedIn(request.headers.get('authorization'), env.CONVEX_AUTH_JWKS, env.CONVEX_AUTH_ISSUER)) return Response.json({ error: 'Sign in to open the Lab.' }, { status: 401 });
  return { fetch: (input, init) => server.fetch(input, init), url: 'http://127.0.0.1:3296', secret: env.LAB_SECRET };
}

async function forward(target: Target, path: string, body?: string) {
  try {
    const response = await target.fetch(target.url.replace(/\/$/, '') + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-lab-secret': target.secret }, ...(body === undefined ? {} : { body }) });
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-cache' } });
  } catch {
    return Response.json({ error: 'The Lab’s server isn’t answering.' }, { status: 503 });
  }
}

const bytes = (b64url: string) => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)), c => c.charCodeAt(0));
/** A live Convex Auth session token (RS256, issuer the deployment's site URL, audience `convex`) signed by one of the JWKS keys. */
async function signedIn(authorization: string | null, jwks: string, issuer: string) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '', [head, body, signature] = token.split('.');
  if (!signature) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(bytes(head))), claims = JSON.parse(new TextDecoder().decode(bytes(body)));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== 'RS256' || claims.iss !== issuer || !audience.includes('convex') || !(claims.exp * 1000 > Date.now())) return false;
    for (const jwk of (JSON.parse(jwks) as { keys: JsonWebKey[] }).keys) {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(signature), new TextEncoder().encode(`${head}.${body}`))) return true;
    }
  } catch { /* a malformed token is no session */ }
  return false;
}
