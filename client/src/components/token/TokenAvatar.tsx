"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** A copy that is not there yet is asked for again after each delay: the indexer uploads a new coin's copy seconds after its launch. */
const RETRY_MS = [2_000, 4_000, 8_000];
const FAILED_TTL_MS = 10 * 60_000;
const KNOWN_MAX = 500;
/** Per coin, the one search that every avatar of it waits on, and when it found no logo. */
const known = new Map<string, { search: Promise<string | undefined>; failedAt?: number }>();

export function logoUrls(address: string) {
  return address ? [`https://img.usehotbot.com/${address}.webp`, `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png?size=lg`] : [];
}

const loads = (url: string) => new Promise<boolean>(resolve => {
  const image = new Image();
  image.onload = () => resolve(true);
  image.onerror = () => resolve(false);
  image.src = url;
});

async function search(address: string) {
  const [copy, dexscreener] = logoUrls(address);
  if (await loads(copy)) return copy;
  if (await loads(dexscreener)) return dexscreener;
  for (const ms of RETRY_MS) {
    await new Promise(resolve => setTimeout(resolve, ms));
    if (await loads(copy)) return copy;
  }
}

/** The first of a coin's logo URLs that loads, or undefined. */
function coinLogo(address: string): Promise<string | undefined> {
  const entry = known.get(address);
  if (entry && !(entry.failedAt && Date.now() - entry.failedAt >= FAILED_TTL_MS)) return entry.search;
  if (!entry && known.size >= KNOWN_MAX) known.delete(known.keys().next().value!);
  const next: { search: Promise<string | undefined>; failedAt?: number } = {
    search: search(address).then(src => { if (!src) next.failedAt = Date.now(); return src; }),
  };
  known.set(address, next);
  return next.search;
}

/** A coin's logo: `bundled` when given, else the first of its logo URLs that loads. */
export function useCoinLogo(address: string, bundled?: string) {
  const [found, setFound] = useState<{ address: string; src?: string }>();
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [failedSrc, setFailedSrc] = useState<string>();

  useEffect(() => {
    if (bundled || !address) return;
    let live = true;
    void coinLogo(address).then(src => { if (live) setFound({ address, src }); });
    return () => { live = false; };
  }, [address, bundled]);

  const candidate = bundled ?? (found?.address === address ? found.src : undefined);
  const src = candidate === failedSrc ? undefined : candidate;
  return { src, loaded: Boolean(src) && src === loadedSrc, onLoad: () => setLoadedSrc(src), onError: () => setFailedSrc(src) };
}

/** One observer for every avatar: an avatar starts its logo search once it comes within a screen of the viewport, so a long list fetches
 *  only the logos someone can see. */
const nearCallbacks = new Map<Element, () => void>();
let nearObserver: IntersectionObserver | undefined;
function whenNear(element: Element, onNear: () => void) {
  nearObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      nearCallbacks.get(entry.target)?.();
      nearCallbacks.delete(entry.target);
      nearObserver!.unobserve(entry.target);
    }
  }, { rootMargin: "100% 0px", scrollMargin: "100% 0px" });
  nearCallbacks.set(element, onNear);
  nearObserver.observe(element);
  return () => { nearCallbacks.delete(element); nearObserver!.unobserve(element); };
}

/** A coin's square avatar: its logo, with the symbol's first letter while it loads or when none loads. `src` is a bundled image that
 *  replaces the logo (onboarding reads no market data). `className` sets the size and the rounding. */
export function TokenAvatar({ address = "", src: bundled, symbol, className }: { address?: string; src?: string; symbol: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null), [near, setNear] = useState(false);
  useEffect(() => { if (!near && box.current) return whenNear(box.current, () => setNear(true)); }, [near]);
  const { src, loaded, onLoad, onError } = useCoinLogo(near ? address : "", near ? bundled : undefined);
  return (
    <div ref={box} className={cn("relative size-10 shrink-0 overflow-hidden rounded-xl bg-background", className)}>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/60 to-primary/30 font-semibold text-primary-foreground">
        {(symbol || "T").charAt(0).toUpperCase()}
      </div>
      {src && (
        <img key={src} src={src} alt="" className={cn("absolute inset-0 size-full bg-muted object-cover", !loaded && "opacity-0")}
          decoding="async" onLoad={onLoad} onError={onError} draggable={false}/>
      )}
    </div>
  );
}
