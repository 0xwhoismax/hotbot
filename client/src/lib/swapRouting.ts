import { canonicalPumpPoolPdaWithQuote } from "@pump-fun/pump-sdk";
import { PublicKey } from "@solana/web3.js";
import type { TokenData } from "@/types/dataApiTypes";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export type PumpVenue = "pump-curve" | "pump-amm" | null;

type PumpVenueToken = Pick<
  TokenData,
  "network" | "factory" | "bonded" | "bondedAt" | "quoteMint" | "address" | "pools" | "marketAddress" | "poolAddress"
>;

function isPumpFunFamily(factory?: string) {
  const value = factory?.toLowerCase();
  return value === "pumpfun" || value === "pumpswap";
}

export function isPumpMintAddress(address?: string) {
  return Boolean(address?.toLowerCase().endsWith("pump"));
}

function isPumpFamilyToken(token: { factory?: string; address?: string }) {
  if (isPumpFunFamily(token.factory)) return true;
  return isPumpMintAddress(token.address);
}

function isPumpSwapSource(source?: string | null) {
  return source?.toLowerCase() === "pumpswap";
}

function knownPoolsInclude(token: PumpVenueToken, pool: string) {
  const knownPools = [
    token.marketAddress,
    token.poolAddress,
    ...(token.pools ?? []),
  ];
  return knownPools.includes(pool);
}

export function canonicalPumpPoolAddress(mint: string, quoteMint = SOL_MINT): string | undefined {
  try {
    return canonicalPumpPoolPdaWithQuote(new PublicKey(mint), new PublicKey(quoteMint === PublicKey.default.toBase58() ? SOL_MINT : quoteMint)).toBase58();
  } catch {
    return undefined;
  }
}

export function resolvePumpVenue(
  token: PumpVenueToken | null | undefined,
): { pumpVenue: PumpVenue; pumpPool?: string } {
  if (!token || token.network !== "solana") return { pumpVenue: null };
  if (!isPumpFamilyToken(token)) return { pumpVenue: null };

  const graduated = Boolean(token.bonded || token.bondedAt);
  if (!graduated) return { pumpVenue: "pump-curve" };

  const canonical = canonicalPumpPoolAddress(token.address, token.quoteMint);
  if (!canonical || !knownPoolsInclude(token, canonical)) return { pumpVenue: null };
  return { pumpVenue: "pump-amm", pumpPool: canonical };
}

export function resolvePumpVenueWithSource(
  token: PumpVenueToken | null | undefined,
  currentVenueSource?: string | null,
): { pumpVenue: PumpVenue; pumpPool?: string } {
  const resolved = resolvePumpVenue(token);
  if (resolved.pumpVenue !== null) return resolved;
  if (!token || token.network !== "solana") return resolved;
  if (!isPumpFamilyToken(token)) return resolved;
  if (!Boolean(token.bonded || token.bondedAt) || !isPumpSwapSource(currentVenueSource)) return resolved;

  const canonical = canonicalPumpPoolAddress(token.address, token.quoteMint);
  return { pumpVenue: "pump-amm", pumpPool: canonical && (token.quoteMint || knownPoolsInclude(token, canonical)) ? canonical : undefined };
}
