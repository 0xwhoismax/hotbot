export type TokenNetwork = 'solana';
export interface TokenData {
  address: string;
  network: 'solana';
  name: string;
  symbol: string;
  decimals?: number;
  logo_uri?: string;
  price: number;
  market_cap: number;
  total_supply?: number;
  circulating_supply?: number;
  liquidity?: number;
  volume_24h_usd?: number;
  price_change_24h_percent?: number;
  verified?: boolean;
  creation_time?: string;
  factory?: string;
  poolAddress?: string;
  marketAddress?: string;
  bondingCurveAddress?: string;
  pools?: string[];
  quoteMint?: string;
  quoteSymbol?: string;
  quoteDecimals?: number;
  bonded?: boolean;
  bondedAt?: string;
  pumpVenue?: 'pump-curve' | 'pump-amm' | null;
  pumpPool?: string;
}

export interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
