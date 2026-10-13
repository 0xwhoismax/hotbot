import { NextRequest, NextResponse } from 'next/server';
import { isAllowedRpcBody, isRateLimited } from '@/lib/server/rpcProxyGuard';

const READ_FALLBACKS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
];

function getPrimary(): string {
  return process.env.SOLANA_RPC_URL_BETA
    || process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    || '';
}

const SENDER_URL = 'https://sender.helius-rpc.com/fast';
type JsonRpcBody = { method?: unknown; params?: unknown };

// Every method the client actually sends (see src/lib/rpc.ts callers). The proxy
// fronts a paid Helius key, so anything else — including JSON-RPC batch arrays —
// is rejected instead of forwarded.
const ALLOWED_METHODS = new Set([
  'sendTransaction',
  'getSignatureStatuses',
  'getBalance',
  'getTokenAccountsByOwner',
  'getLatestBlockhash',
]);

function safeHost(u: string): string {
  try { return new URL(u).host; } catch { return 'unknown'; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shouldUseFastSender(body: JsonRpcBody): boolean {
  if (body.method !== 'sendTransaction' || !Array.isArray(body.params)) return true;
  const options = body.params[1];
  return !isRecord(options) || options.useFastSender !== false;
}

function sanitizeRpcBody(body: unknown): unknown {
  if (!isRecord(body) || body.method !== 'sendTransaction' || !Array.isArray(body.params)) return body;
  const params = [...body.params];
  if (isRecord(params[1]) && 'useFastSender' in params[1]) {
    const { useFastSender: _useFastSender, ...rpcOptions } = params[1];
    params[1] = rpcOptions;
  }
  return { ...body, params };
}

async function parseRpcResponse(resp: Response) {
  const text = await resp.text();
  try {
    return {
      ok: resp.ok,
      status: resp.status,
      data: JSON.parse(text) as unknown,
    };
  } catch {
    return {
      ok: resp.ok,
      status: resp.status,
      data: { error: text || `Upstream RPC failed with status ${resp.status}` },
    };
  }
}

/**
 * POST /api/solana-rpc
 * sendTransaction → Helius sender (fast landing), falls back to primary RPC.
 * Everything else → primary (Helius), falls back to public RPCs on network error or 5xx.
 */
export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(req)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
      );
    }

    const body = await req.json();
    if (!isAllowedRpcBody(body, ALLOWED_METHODS)) {
      return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const payload = JSON.stringify(sanitizeRpcBody(body));

    const primary = getPrimary();

    if (body?.method === 'sendTransaction') {
      let senderParsed: Awaited<ReturnType<typeof parseRpcResponse>> | null = null;
      if (shouldUseFastSender(body)) {
        const senderResp = await fetch(SENDER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        senderParsed = await parseRpcResponse(senderResp);
        if (senderParsed.ok) {
          return NextResponse.json(senderParsed.data, {
            status: senderParsed.status,
            headers: {
              'Cache-Control': 'no-store',
              'X-Rpc-Upstream': safeHost(SENDER_URL),
            },
          });
        }
      }

      if (!primary) {
        return NextResponse.json(senderParsed?.data ?? { error: 'Solana RPC unavailable' }, {
          status: senderParsed?.status ?? 502,
          headers: {
            'Cache-Control': 'no-store',
            'X-Solana-Sender-Status': String(senderParsed?.status ?? 'skipped'),
          },
        });
      }

      const rpcResp = await fetch(primary, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const rpcParsed = await parseRpcResponse(rpcResp);
      return NextResponse.json(
        rpcParsed.data,
        {
          status: rpcParsed.status,
          headers: {
            'Cache-Control': 'no-store',
            'X-Solana-Sender-Status': String(senderParsed?.status ?? 'skipped'),
            'X-Rpc-Upstream': safeHost(primary),
          },
        },
      );
    }

    const endpoints = [primary, ...READ_FALLBACKS].filter(Boolean);
    let lastParsed: Awaited<ReturnType<typeof parseRpcResponse>> | null = null;
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        const parsed = await parseRpcResponse(resp);
        if (resp.status >= 500) {
          lastParsed = parsed;
          continue;
        }
        return NextResponse.json(parsed.data, {
          status: parsed.status,
          headers: {
            'Cache-Control': 'no-store',
            'X-Rpc-Upstream': safeHost(url),
          },
        });
      } catch (err) {
        lastParsed = {
          ok: false,
          status: 502,
          data: { error: err instanceof Error ? err.message : 'RPC proxy error' },
        };
      }
    }

    return NextResponse.json(
      lastParsed?.data ?? { error: 'No RPC endpoints configured' },
      { status: lastParsed?.status ?? 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RPC proxy error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
