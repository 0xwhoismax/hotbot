import { NextRequest } from 'next/server';

/**
 * Shared guard for the authenticated Solana JSON-RPC proxy.
 * These routes front paid provider keys (Helius), so they allowlist
 * methods and rate-limit per IP to bound provider usage.
 */

// Sliding-window per-IP rate limit (per server instance). A real trading burst
// is ~1 send + ~10 status polls + a few balance reads over a few seconds, so
// 120 weighted calls / 10s is generous for users while still stopping abuse.
// Each entry in a JSON-RPC batch consumes its own method-specific weight.
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_MAX_TRACKED_IPS = 10_000;
const MAX_BATCH_SIZE = 200;

const rateBuckets = new Map<string, number[]>();

function clientIp(req: NextRequest, trustPlatformHeaders = false): string {
  if (trustPlatformHeaders) {
    const platform = req.headers.get('cf-connecting-ip')?.trim();
    if (platform) return platform.split(',')[0].trim();
    return 'unknown';
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function isRateLimited(req: NextRequest, cost = 1, opts?: { trustPlatformHeaders?: boolean }): boolean {
  const ip = clientIp(req, opts?.trustPlatformHeaders);
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let bucket = rateBuckets.get(ip);
  if (bucket) {
    while (bucket.length && bucket[0] < cutoff) bucket.shift();
  } else {
    bucket = [];
    if (rateBuckets.size >= RATE_LIMIT_MAX_TRACKED_IPS) {
      // Drop stale buckets before tracking a new IP so the map can't grow unbounded.
      for (const [key, stamps] of rateBuckets) {
        if (!stamps.length || stamps[stamps.length - 1] < cutoff) rateBuckets.delete(key);
      }
      if (rateBuckets.size >= RATE_LIMIT_MAX_TRACKED_IPS) return true;
    }
    rateBuckets.set(ip, bucket);
  }
  const normalizedCost = Math.max(1, Math.min(Math.ceil(cost), RATE_LIMIT_MAX_REQUESTS));
  if (bucket.length + normalizedCost > RATE_LIMIT_MAX_REQUESTS) return true;
  for (let index = 0; index < normalizedCost; index += 1) bucket.push(now);
  return false;
}

/** Provider-credit estimate: every inner batch entry consumes its own budget. */
export function rpcRequestCost(body: unknown): number {
  const entries = Array.isArray(body) ? body : [body];
  return entries.reduce((total, entry) => {
    const method = (entry as { method?: unknown } | null)?.method;
    if (method === 'getTokenAccountsByOwner') return total + 10;
    if (method === 'sendTransaction') return total + 8;
    return total + 1;
  }, 0);
}

/**
 * Validates a parsed JSON-RPC body (single request or batch array) against a
 * method allowlist. Returns true only when every entry is an allowlisted call.
 */
export function isAllowedRpcBody(
  body: unknown,
  allowedMethods: ReadonlySet<string>,
  opts?: { allowBatch?: boolean; maxBatchSize?: number },
): boolean {
  const entries = Array.isArray(body) ? body : [body];
  const maxBatchSize = opts?.maxBatchSize ?? MAX_BATCH_SIZE;
  if (Array.isArray(body) && (!opts?.allowBatch || body.length === 0 || body.length > maxBatchSize)) return false;
  return entries.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const method = (entry as { method?: unknown } | null)?.method;
    return typeof method === 'string' && allowedMethods.has(method);
  });
}
