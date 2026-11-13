/** What one swap costs besides its pool's own fee: the live swap builder charges these, and every paper fill charges the same. */

/** HOTBOT's platform fee in basis points: on the SOL a buy puts into its route, and on the SOL a sale takes out of it. */
export const PLATFORM_FEE_BPS = 50;
/** Solana's base fee for a transaction's one signature, in lamports. */
export const SIGNATURE_FEE_LAMPORTS = 5_000;
/** The priority fee of each swap transaction in lamports, spread over its compute limit. Leaders that have room order a slot by arrival, not
 *  by fee, so it only has to carry the compute-unit price that Helius Sender requires, at about the price of an ordinary pump.fun trade. */
export const PRIORITY_FEE_LAMPORTS = 3_000;
/** Helius Sender's tip at its SWQOS-only tier's minimum, in lamports. */
export const SENDER_TIP_LAMPORTS = 5_000;
/** The network's part of one swap transaction in lamports, whatever its size. */
export const SWAP_NETWORK_LAMPORTS = SIGNATURE_FEE_LAMPORTS + PRIORITY_FEE_LAMPORTS + SENDER_TIP_LAMPORTS;
