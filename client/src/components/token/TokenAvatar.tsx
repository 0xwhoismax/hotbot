"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_FIRST_ATTEMPT_DELAY_MS = 25;
const RETRY_DELAY_MS = 500;
const RETRY_WINDOW_MS = 30_000;
const DEXSCREENER_FALLBACK_DELAY_MS = 1_000;
// Aligns with the batcher's negative TTL so a retry actually re-hits the network.
const DEXSCREENER_FALLBACK_RETRY_MS = 30_000;
const DEXSCREENER_FALLBACK_MAX_RETRIES = 2;
const FAILED_IMAGE_TTL_MS = 10 * 60 * 1_000;
const TOKEN_IMAGE_CACHE_MAX_ENTRIES = 500;
const loadedImageByToken = new Map<string, string>();
const dexFallbackByToken = new Map<string, string>();
const dexFallbackRequestByToken = new Map<string, Promise<string | undefined>>();
const failedImageByToken = new Map<string, Map<string, number>>();

function setTokenImageCache<K, V>(cache: Map<K, V>, key: K, value: V) {
  if (!cache.has(key) && cache.size >= TOKEN_IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

function normalizeTokenLogoUrl(url?: string) {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/") || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    // Avatars render at most ~64px; request a small DEX Screener rendition instead of 800px originals.
    if (parsed.hostname === "cdn.dexscreener.com" && parsed.searchParams.has("width")) {
      parsed.searchParams.set("width", "128");
      parsed.searchParams.set("height", "128");
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function tokenImageCacheKey(address: string, network?: "solana") {
  if (!address) return undefined;
  return `${network ?? "solana"}:${address}`;
}

function isTokenImageFailureActive(cacheKey: string | undefined, src: string | undefined, ttlMs = FAILED_IMAGE_TTL_MS) {
  if (!cacheKey || !src) return false;
  const failedBySrc = failedImageByToken.get(cacheKey);
  const failedAt = failedBySrc?.get(src);
  if (!failedAt) return false;
  if (Date.now() - failedAt < ttlMs) return true;
  failedBySrc?.delete(src);
  if (failedBySrc?.size === 0) failedImageByToken.delete(cacheKey);
  return false;
}

function rememberFailedTokenImage(cacheKey: string | undefined, src: string | undefined) {
  if (!cacheKey || !src) return;
  const failedBySrc = failedImageByToken.get(cacheKey) ?? new Map<string, number>();
  setTokenImageCache(failedBySrc, src, Date.now());
  setTokenImageCache(failedImageByToken, cacheKey, failedBySrc);
}

function clearFailedTokenImage(cacheKey: string | undefined, src: string | undefined) {
  if (!cacheKey || !src) return;
  const failedBySrc = failedImageByToken.get(cacheKey);
  failedBySrc?.delete(src);
  if (failedBySrc?.size === 0) failedImageByToken.delete(cacheKey);
}

function fetchDexScreenerFallback(address: string, network?: "solana") {
  const cacheKey = tokenImageCacheKey(address, network);
  if (!cacheKey) return Promise.resolve(undefined);

  const cached = dexFallbackByToken.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const pending = dexFallbackRequestByToken.get(cacheKey);
  if (pending) return pending;

  // The shared Solana queue batches missing-logo lookups across all visible tokens.
  const request = import("@/services/marketDataService").then(({ fetchDexScreenerData, DEXSCREENER_IMAGE_TTL }) => fetchDexScreenerData(address, network ?? "solana", DEXSCREENER_IMAGE_TTL))
    .then((pair) => {
      const imageUrl = normalizeTokenLogoUrl(pair?.info?.imageUrl);
      if (imageUrl) setTokenImageCache(dexFallbackByToken, cacheKey, imageUrl);
      return imageUrl;
    })
    .catch(() => undefined)
    .finally(() => {
      dexFallbackRequestByToken.delete(cacheKey);
    });
  dexFallbackRequestByToken.set(cacheKey, request);
  return request;
}

/** A token's DexScreener logo through the shared, batched and cached lookup, for logos drawn outside `TokenAvatar`. */
export function dexScreenerLogo(address: string) {
  return fetchDexScreenerFallback(address, "solana");
}

export function useTokenImage(address: string, _symbol: string, network?: "solana", logoUrl?: string, disableDetailFallback = false, onImageLoad?: () => void) {
  const normalizedLogoUrl = normalizeTokenLogoUrl(logoUrl);
  const shouldUseFailureCache = true;
  const firstAttemptDelayMs = DEFAULT_FIRST_ATTEMPT_DELAY_MS;
  const cacheKey = tokenImageCacheKey(address, network);
  const cachedImageSrc = cacheKey
    ? [loadedImageByToken.get(cacheKey), dexFallbackByToken.get(cacheKey)]
      .find((src) => (
        (!disableDetailFallback || src === normalizedLogoUrl)
        && (!shouldUseFailureCache || !isTokenImageFailureActive(cacheKey, src))
      ))
    : undefined;
  const firstImageSrc = cachedImageSrc ?? (
    shouldUseFailureCache && isTokenImageFailureActive(cacheKey, normalizedLogoUrl)
      ? undefined
      : normalizedLogoUrl
  );
  const [imageSrc, setImageSrc] = useState<string>();
  const [imageKey, setImageKey] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const onImageLoadRef = useRef(onImageLoad);
  const startedAtRef = useRef(0);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const firstAttemptTimerRef = useRef<number | undefined>(undefined);
  const fallbackTimerRef = useRef<number | undefined>(undefined);
  const notifiedLoadRef = useRef(false);
  const imageSrcRef = useRef<string | undefined>(undefined);
  const loadedRef = useRef(false);
  const imageInputsRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    onImageLoadRef.current = onImageLoad;
  }, [onImageLoad]);

  useEffect(() => {
    imageSrcRef.current = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const imageInputs = JSON.stringify([
      address,
      network,
      normalizedLogoUrl,
      disableDetailFallback,
      firstAttemptDelayMs,
      shouldUseFailureCache,
    ]);
    const sameImageInputs = imageInputsRef.current === imageInputs;
    imageInputsRef.current = imageInputs;
    if (sameImageInputs && loadedRef.current && imageSrcRef.current) {
      return () => {
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        if (firstAttemptTimerRef.current) window.clearTimeout(firstAttemptTimerRef.current);
        if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      };
    }

    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    if (firstAttemptTimerRef.current) window.clearTimeout(firstAttemptTimerRef.current);
    if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    setImageSrc(undefined);
    setImageKey(0);
    setIsLoaded(Boolean(cachedImageSrc));
    startedAtRef.current = 0;
    notifiedLoadRef.current = false;
    loadedRef.current = Boolean(cachedImageSrc);

    let cancelled = false;
    const showImage = (src: string, loaded: boolean) => {
      if (cancelled) return;
      startedAtRef.current = Date.now();
      loadedRef.current = loaded;
      setIsLoaded(loaded);
      setImageSrc(src);
    };

    if (firstImageSrc) {
      firstAttemptTimerRef.current = window.setTimeout(() => {
        showImage(firstImageSrc, Boolean(cachedImageSrc));
      }, cachedImageSrc ? 0 : firstAttemptDelayMs);
    }

    if (!disableDetailFallback && cacheKey) {
      let fallbackRetries = 0;
      const scheduleFallback = (delayMs: number) => {
        fallbackTimerRef.current = window.setTimeout(async () => {
          if (cancelled || loadedRef.current) return;
          const fallback = await fetchDexScreenerFallback(address, network);
          if (cancelled || loadedRef.current) return;
          if (shouldUseFailureCache && isTokenImageFailureActive(cacheKey, fallback)) {
            if (dexFallbackByToken.get(cacheKey) === fallback) dexFallbackByToken.delete(cacheKey);
            return;
          }
          if (!fallback) {
            if (fallbackRetries >= DEXSCREENER_FALLBACK_MAX_RETRIES) return;
            fallbackRetries += 1;
            scheduleFallback(DEXSCREENER_FALLBACK_RETRY_MS);
            return;
          }
          setImageKey((value) => value + 1);
          showImage(fallback, false);
        }, delayMs);
      };
      scheduleFallback(DEXSCREENER_FALLBACK_DELAY_MS);
    }

    return () => {
      cancelled = true;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (firstAttemptTimerRef.current) window.clearTimeout(firstAttemptTimerRef.current);
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    };
  }, [address, cacheKey, cachedImageSrc, disableDetailFallback, firstAttemptDelayMs, firstImageSrc, network, normalizedLogoUrl, shouldUseFailureCache]);

  const handleImageLoad = useCallback(() => {
    loadedRef.current = true;
    const src = imageSrcRef.current;
    if (cacheKey && src) {
      setTokenImageCache(loadedImageByToken, cacheKey, src);
      clearFailedTokenImage(cacheKey, src);
    }
    setIsLoaded(true);
    if (notifiedLoadRef.current) return;
    notifiedLoadRef.current = true;
    onImageLoadRef.current?.();
  }, [cacheKey]);

  const handleImageError = useCallback(() => {
    loadedRef.current = false;
    setIsLoaded(false);
    setImageSrc(undefined);
    const failedSrc = imageSrcRef.current;
    if (cacheKey && failedSrc && loadedImageByToken.get(cacheKey) === failedSrc) {
      loadedImageByToken.delete(cacheKey);
    }
    if (shouldUseFailureCache && cacheKey && failedSrc) {
      rememberFailedTokenImage(cacheKey, failedSrc);
      if (dexFallbackByToken.get(cacheKey) === failedSrc) dexFallbackByToken.delete(cacheKey);
    }

    const fallback = !disableDetailFallback && cacheKey ? dexFallbackByToken.get(cacheKey) : undefined;
    if (fallback && fallback !== failedSrc && (!shouldUseFailureCache || !isTokenImageFailureActive(cacheKey, fallback))) {
      setImageKey((value) => value + 1);
      startedAtRef.current = Date.now();
      setImageSrc(fallback);
      return;
    }

    if (
      !normalizedLogoUrl
      || (shouldUseFailureCache && isTokenImageFailureActive(cacheKey, normalizedLogoUrl))
      || Date.now() - startedAtRef.current + RETRY_DELAY_MS > RETRY_WINDOW_MS
    ) return;
    retryTimerRef.current = window.setTimeout(() => {
      setImageKey((value) => value + 1);
      setImageSrc(normalizedLogoUrl);
    }, RETRY_DELAY_MS);
  }, [cacheKey, disableDetailFallback, normalizedLogoUrl, shouldUseFailureCache]);

  return { imageSrc, imageKey, isLoaded, handleImageLoad, handleImageError };
}

type TokenAvatarProps = {
  address?: string;
  logoUrl?: string;
  symbol: string;
  network?: "solana";
  /** Extra classes applied to the container. Use this to set size + rounding. */
  className?: string;
  /** Extra classes for the "?" placeholder (typically font size). */
  placeholderClassName?: string;
  fallback?: "question" | "letter";
  fallbackText?: string;
  disableDetailFallback?: boolean;
  onImageLoad?: () => void;
};

/**
 * Square token avatar with retry + "?" fallback.
 * Caller controls size/rounding via `className`; launchpad badges are positioned
 * by the parent. Solana is the only supported chain, so no chain badge is needed.
 */
export function TokenAvatar({
  address,
  logoUrl,
  symbol,
  network,
  className,
  placeholderClassName,
  fallback = "question",
  fallbackText,
  disableDetailFallback,
  onImageLoad,
}: TokenAvatarProps) {
  const tokenAddress = address ?? "";
  const letter = (fallbackText || symbol || "T").charAt(0).toUpperCase();
  const { imageSrc, imageKey, isLoaded, handleImageLoad, handleImageError } = useTokenImage(
    tokenAddress,
    symbol,
    network,
    logoUrl,
    disableDetailFallback,
    onImageLoad,
  );

  return (
    <div className={cn("relative size-10 shrink-0 rounded-xl", className)}>
      {/* Inner wrapper clips the image; the root stays unclipped so the network badge can overhang the corner. */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit] bg-background">
        <div className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold",
          fallback === "letter"
            ? "bg-gradient-to-br from-primary/60 to-primary/30 text-primary-foreground"
            : "bg-muted text-muted-foreground",
          placeholderClassName,
        )}>
          {fallback === "letter" ? letter : "?"}
        </div>
        {imageSrc ? (
          <img
            key={`${imageSrc}-${imageKey}`}
            src={imageSrc}
            alt=""
            className={cn("absolute inset-0 size-full bg-muted object-cover", !isLoaded && "opacity-0")}
            loading="eager"
            decoding="async"
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
}
