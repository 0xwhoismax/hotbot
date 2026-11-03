"use client";
import { useEffect, useState } from 'react';

/** A coin's banner: the 3:1 header its creator put on a paid DexScreener profile. DexScreener refuses our servers' addresses, so the browser
 *  asks it (`tokens/v1`, which answers any origin): the coins asked for in the same moment share one call of up to `BATCH`, and each coin
 *  is asked once per visit. A coin without a profile has none; a failed call is asked again by the next coin that needs it. */
const API = 'https://api.dexscreener.com/tokens/v1/solana/', BATCH = 30, TIMEOUT_MS = 10_000;
const known = new Map<string, Promise<string | null>>();
let waiting: { address: string; settle: (header: string | null) => void }[] = [];

type Pair = { baseToken?: { address?: unknown }; info?: { header?: unknown } };

/** One call for a batch of coins: for each, the first of its pairs that carries a banner. */
async function read(batch: string[]) {
  const response = await fetch(API + batch.join(','), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
  const pairs: unknown = await response.json(), headers = new Map<string, string>();
  for (const pair of Array.isArray(pairs) ? pairs as Pair[] : []) {
    const address = pair.baseToken?.address, header = pair.info?.header;
    if (typeof address === 'string' && typeof header === 'string' && header.startsWith('https://') && !headers.has(address)) headers.set(address, header);
  }
  return headers;
}

function flush() {
  const asked = waiting;
  waiting = [];
  for (let start = 0; start < asked.length; start += BATCH) {
    const batch = asked.slice(start, start + BATCH);
    read(batch.map(entry => entry.address)).then(
      headers => { for (const entry of batch) entry.settle(headers.get(entry.address) ?? null); },
      () => { for (const entry of batch) { known.delete(entry.address); entry.settle(null); } });
  }
}

function bannerOf(address: string) {
  let banner = known.get(address);
  if (!banner) {
    banner = new Promise(settle => {
      if (!waiting.length) setTimeout(flush, 0);
      waiting.push({ address, settle });
    });
    known.set(address, banner);
  }
  return banner;
}

/** The coin's DexScreener banner: undefined while it is being asked for, null when it has none. Ask with null to skip the read (a coin
 *  whose banner is already known). */
export function useCoinBanner(address: string | null) {
  const [found, setFound] = useState<{ address: string; header: string | null }>();
  useEffect(() => {
    if (!address) return;
    let current = true;
    void bannerOf(address).then(header => { if (current) setFound({ address, header }); });
    return () => { current = false; };
  }, [address]);
  return address && found?.address === address ? found.header : undefined;
}
