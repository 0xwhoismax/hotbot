"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type RefObject } from "react";

export const MainScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Shared scroll-container ownership for retained shell components. */
type ScrollTargetRegistry = {
  el: HTMLElement | null;
  register: (el: HTMLElement) => void;
  unregister: (el: HTMLElement) => void;
};

export const ScrollTargetContext = createContext<ScrollTargetRegistry | null>(null);

/** Provider value factory — used by the app shell to back the registry with state. */
export function useScrollTargetRegistry(): ScrollTargetRegistry {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const register = useCallback((next: HTMLElement) => setEl(next), []);
  const unregister = useCallback((prev: HTMLElement) => setEl(cur => cur === prev ? null : cur), []);
  return useMemo(
    () => ({
      el,
      register,
      // Only clear if the unmounting element is the one currently registered,
      // so a newly-mounted container that registered first isn't wiped.
      unregister,
    }),
    [el, register, unregister],
  );
}

/** Register a scroll container as the active scroll-direction target while
 *  mounted. The most recently mounted container wins; on unmount it yields
 *  back to <main>/window. */
export function useRegisterScrollContainer(ref: RefObject<HTMLElement | null>, enabled = true) {
  const registry = useContext(ScrollTargetContext);
  const register = registry?.register, unregister = registry?.unregister;
  useEffect(() => {
    const el = ref.current;
    if (!register || !unregister || !el || !enabled) return;
    register(el);
    return () => unregister(el);
  }, [register, unregister, ref, enabled]);
}

function useMainScroll() {
  return useContext(MainScrollContext);
}

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const scrollRef = useMainScroll();
  const registry = useContext(ScrollTargetContext);
  const registeredEl = registry?.el ?? null;
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);

  // Poll briefly for the main ref to become available (handles SSR hydration timing)
  useEffect(() => {
    if (scrollRef?.current) {
      setMainEl(scrollRef.current);
      return;
    }
    const id = setInterval(() => {
      if (scrollRef?.current) {
        setMainEl(scrollRef.current);
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [scrollRef]);

  // A registered inner scroll container takes precedence over <main>.
  const el = registeredEl ?? mainEl;

  useEffect(() => {
    const target = el || window;
    let lastScrollY = el ? el.scrollTop : window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = el ? el.scrollTop : window.scrollY;
      if (Math.abs(scrollY - lastScrollY) < 10) {
        ticking = false;
        return;
      }
      setVisible(scrollY < lastScrollY || scrollY < 50);
      lastScrollY = scrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    // Reset to visible when the active target changes (e.g. switching pages or
    // feed columns) so the nav isn't stuck hidden against a fresh scrollTop.
    const resetFrame = window.requestAnimationFrame(() => {
      setVisible(true);
    });
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(resetFrame);
      target.removeEventListener("scroll", onScroll);
    };
  }, [el]);

  return visible;
}
