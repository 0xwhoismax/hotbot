import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
const periods = new Set(['1s','5s','15s','30s','1m','5m','15m','30m','1h','4h','1d','1w','1M']);
function validMint(value: unknown): value is string { try { return typeof value === 'string' && new PublicKey(value).toBase58() === value; } catch { return false; } }
function upstream() { return process.env.MOBULA_API_URL || 'https://api.mobula.io/api'; }
async function forward(path: string, params?: URLSearchParams, body?: unknown) {
  const key = process.env.MOBULA_API_KEY;
  if (!key) return NextResponse.json({ error: 'Market data is not configured' }, { status: 503 });
  const url = `${upstream()}/${path}${params ? `?${params}` : ''}`;
  try {
    const result = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!result.ok) return NextResponse.json({ error: 'Market data provider unavailable' }, { status: result.status === 429 ? 429 : 502 });
    const data: unknown = await result.json();
    return NextResponse.json(data, { headers: { 'Cache-Control': path === '2/fast-search' ? 'public, max-age=15, s-maxage=30' : 'no-store' } });
  } catch { return NextResponse.json({ error: 'Market data provider unavailable' }, { status: 502 }); }
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  const input = request.nextUrl.searchParams;
  for (const key of ['blockchain','chainId','network']) if (input.has(key) && input.get(key) !== 'solana') return NextResponse.json({ error: 'Only Solana is supported' }, { status: 400 });
  const query = new URLSearchParams();
  if (path === '2/fast-search') {
    const text = input.get('input')?.trim() ?? '';
    if (text.length < 2 || text.length > 100) return NextResponse.json({ error: 'Search must contain 2–100 characters' }, { status: 400 });
    const sort = input.get('sortBy') ?? 'search_score';
    if (!['search_score', 'created_at', 'trending_score_24h', 'volume_24h', 'liquidity'].includes(sort)) return NextResponse.json({ error: 'Invalid search sort' }, { status: 400 });
    query.set('sortBy', sort);
    query.set('input', text); query.set('limit', '20'); query.set('filters', JSON.stringify({ blockchains: ['solana'] }));
  } else if (path === '2/token/details' || path === '2/token/ohlcv-history') {
    const address = input.get('address');
    if (!validMint(address)) return NextResponse.json({ error: 'Invalid Solana mint' }, { status: 400 });
    query.set('address', address);
    query.set(path.endsWith('details') ? 'blockchain' : 'chainId', 'solana');
    if (path.endsWith('ohlcv-history')) {
      const period = input.get('period') ?? '';
      const from = Number(input.get('from')), to = Number(input.get('to'));
      if (!periods.has(period) || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > 366 * 86400_000) return NextResponse.json({ error: 'Invalid candle range' }, { status: 400 });
      query.set('period', period); query.set('from', String(from)); query.set('to', String(to));
      if (input.has('amount')) { const amount = Number(input.get('amount')); if (!Number.isInteger(amount) || amount <= 0 || amount > 2000) return NextResponse.json({ error: 'Invalid candle count' }, { status: 400 }); query.set('amount', String(amount)); }
    }
  } else return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return forward(path, query);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if ((await params).path.join('/') !== '2/token/details') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (Number(request.headers.get('content-length')) > 8192) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let body: unknown;
  try { const text = await request.text(); if (text.length > 8192) throw new Error(); body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!Array.isArray(body) || body.length === 0 || body.length > 20 || body.some(value => !value || value.blockchain !== 'solana' || !validMint(value.address))) return NextResponse.json({ error: 'Expected 1–20 Solana tokens' }, { status: 400 });
  return forward('2/token/details', undefined, body.map(value => ({ address: value.address, blockchain: 'solana' })));
}
