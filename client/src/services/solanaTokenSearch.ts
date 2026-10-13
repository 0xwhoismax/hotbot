import { PublicKey } from "@solana/web3.js"

import type { TokenData } from '@/types/dataApiTypes';
import { resolvePumpVenueWithSource, USDC_MINT } from '@/lib/swapRouting';

export interface SearchResult<T> {
  id: string
  label: string
  description: string
  image?: string
  data: T
}
export type SearchSource<T> = (query: string, signal: AbortSignal, sort?: string) => Promise<SearchResult<T>[]>

export function isSolanaMint(value: string): boolean {
  try { return new PublicKey(value).toBase58() === value } catch { return false }
}

/** Mobula's explicit chain identity is required; unknown chains are never relabelled. */
export function normalizeSolanaToken(value: unknown): TokenData | null {
  if (!value || typeof value !== "object") return null
  const r = value as Record<string, unknown>
  if (typeof r.blockchain !== "string" || r.blockchain.toLowerCase() !== "solana") return null
  if (typeof r.address !== "string" || !isSolanaMint(r.address)) return null
  const number = (...keys: string[]) => {
    for (const key of keys) if (typeof r[key] === "number" && Number.isFinite(r[key])) return r[key] as number
    return undefined
  }
  const decimals = number("decimals")
  const text = (source: Record<string, unknown>, ...keys: string[]) => keys.map(key => source[key]).find((value): value is string => typeof value === 'string' && value.length > 0);
  const records = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const pairs = Array.isArray(r.pairs) ? r.pairs.map(records) : [];
  const poolAddress = text(r, 'poolAddress', 'pool_address', 'marketAddress', 'market_address') ?? text(pairs[0] ?? {}, 'address');
  const pair = pairs.find(pair => pair.address === poolAddress) ?? pairs[0] ?? {};
  const quote = records(r.largestPoolQuote ?? pair.quoteToken ?? pair.quote);
  const quoteSymbol = text(r, 'quoteSymbol', 'quote_symbol') ?? text(pair, 'quoteSymbol', 'quote_symbol') ?? text(quote, 'symbol');
  const quoteKeys = ['quoteMint', 'quote_mint', 'quoteAddress', 'quote_address', 'quoteTokenAddress', 'quote_token_address'];
  const quoteMint = text(r, ...quoteKeys) ?? text(pair, ...quoteKeys) ?? text(quote, 'address', ...quoteKeys) ?? (quoteSymbol === 'USDC' ? USDC_MINT : undefined);
  const rawQuoteDecimals = number('quoteDecimals', 'quote_decimals', 'quoteTokenDecimals') ?? (typeof quote.decimals === 'number' ? quote.decimals : undefined);
  const factoryRaw = text(r, 'preBondingFactory', 'source', 'factory');
  const factory = factoryRaw === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' ? 'pumpfun' : factoryRaw === 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA' ? 'pumpswap' : factoryRaw;
  const createdAt = r.createdAt;
  const createdMs = typeof createdAt === 'number' ? createdAt : typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  const token: TokenData = {
    address: r.address, network: 'solana', name: text(r, 'name') ?? r.address, symbol: text(r, 'symbol') ?? '',
    decimals: decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : undefined,
    logo_uri: text(r, 'logo'), price: number('priceUSD', 'price') ?? 0, market_cap: number('marketCapUSD', 'marketCap') ?? 0,
    total_supply: number('totalSupply'), circulating_supply: number('circulatingSupply'), liquidity: number('liquidityUSD', 'liquidity'),
    volume_24h_usd: number('volume24hUSD', 'volume24h'),
    price_change_24h_percent: number('priceChange24hPercentage', 'priceChange24h'),
    verified: typeof r.isVerified === 'boolean' ? r.isVerified : undefined,
    creation_time: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : undefined,
    factory, poolAddress, marketAddress: text(r, 'marketAddress', 'market_address') ?? poolAddress,
    bondingCurveAddress: text(r, 'bondingCurveAddress', 'bonding_curve_address'),
    pools: [...new Set([poolAddress, ...pairs.map(pair => text(pair, 'address')), ...(Array.isArray(r.pools) ? r.pools : [])].filter((value): value is string => typeof value === 'string' && isSolanaMint(value)))],
    quoteMint, quoteSymbol, quoteDecimals: rawQuoteDecimals !== undefined && Number.isInteger(rawQuoteDecimals) && rawQuoteDecimals >= 0 && rawQuoteDecimals <= 255 ? rawQuoteDecimals : quoteMint === USDC_MINT ? 6 : undefined,
    bonded: typeof r.bonded === 'boolean' ? r.bonded : undefined, bondedAt: text(r, 'bondedAt', 'bonded_at'),
  };
  const exchange = text(records(pair.exchange), 'name') ?? text(pair, 'exchange') ?? text(r, 'source');
  return { ...token, ...resolvePumpVenueWithSource(token, exchange) };

}

async function request(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api-mobula/2/${path}?${new URLSearchParams(params)}`, { signal })
  if (!response.ok) throw new Error(response.status === 503 ? "Token search is not configured." : "Token provider is unavailable. Try again.")
  return response.json()
}

export async function resolveSolanaToken(address: string, signal: AbortSignal): Promise<TokenData | null> {
  if (!isSolanaMint(address)) throw new Error("Enter a valid Solana mint address.")
  const response = await request("token/details", { address, blockchain: "solana" }, signal) as { data?: unknown }
  const token = normalizeSolanaToken(response.data)
  return token?.address === address ? token : null
}

export const solanaTokenSource: SearchSource<TokenData> = async (query, signal, sort = "search_score") => {
  const term = query.trim()
  if (!term) return []
  let tokens: TokenData[]
  if (isSolanaMint(term)) {
    const token = await resolveSolanaToken(term, signal)
    tokens = token ? [token] : []
  } else {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(term)) throw new Error("Invalid Solana mint address.")
    if (term.length < 2) return []
    const response = await request("fast-search", { input: term, sortBy: sort, limit: "20", filters: JSON.stringify({ blockchains: ["solana"] }) }, signal) as { data?: unknown[] } | unknown[]
    const rows = Array.isArray(response) ? response : response.data
    if (!Array.isArray(rows)) throw new Error("Token provider returned an invalid response.")
    tokens = rows.map(normalizeSolanaToken).filter((token): token is TokenData => token !== null)
  }
  if (sort === 'search_score') tokens.sort((a, b) =>
    Number(b.symbol.toLowerCase() === term.toLowerCase()) - Number(a.symbol.toLowerCase() === term.toLowerCase()) ||
    (b.liquidity ?? 0) - (a.liquidity ?? 0) || Number(Boolean(b.verified)) - Number(Boolean(a.verified)) ||
    (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0));
  const seen = new Set<string>()
  return tokens.filter(token => { if (seen.has(token.address)) return false; seen.add(token.address); return true }).map(token => ({
    id: token.address, label: `${token.name} (${token.symbol})`, description: token.address, image: token.logo_uri, data: token,
  }))
}
