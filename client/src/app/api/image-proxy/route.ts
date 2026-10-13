import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'avif', 'bmp']);

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

function hasSupportedImageExtension(url: URL): boolean {
  const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

function isSupportedContentType(contentType: string | null, target: URL): boolean {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (mime && SUPPORTED_IMAGE_TYPES.has(mime)) return true;
  return !mime && hasSupportedImageExtension(target);
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return false;
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily) return !isPrivateAddress(hostname);

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }

  try {
    // Check every destination before fetching it. Automatic redirects would bypass the private-address guard.
    let upstream: Response;
    const signal = AbortSignal.timeout(15_000);
    for (let redirects = 0; ; redirects++) {
      if (!['http:', 'https:'].includes(target.protocol) || !(await assertPublicHost(target.hostname))) {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
      }
      upstream = await fetch(target.toString(), { cache: 'force-cache', redirect: 'manual', signal, headers: { Accept: 'image/*' } });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (!location || redirects >= 5) return NextResponse.json({ error: 'Image redirect failed' }, { status: 502 });
      target = new URL(location, target);
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: upstream.status || 502 });
    }

    const contentType = upstream.headers.get('content-type');
    if (!isSupportedContentType(contentType, target)) {
      return NextResponse.json({ error: 'URL did not return a supported image' }, { status: 415 });
    }

    const contentLength = Number(upstream.headers.get('content-length') ?? '0');
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'image/png',
        // Long browser cache keeps virtualized-row remounts and repeat visits
        // off the serverless function. Token logos are effectively immutable
        // per URL; upstream changes would publish a new URL.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image proxy failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
