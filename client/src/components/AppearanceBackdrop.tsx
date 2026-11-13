"use client";

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useTheme } from 'next-themes';
import { appearanceAtom } from '@/store/ui/atoms';
import { DEFAULT_APPEARANCE, applyAppearance } from '@/lib/appearance';

/** The page's own colour as `rgb()`: browsers want a plain colour for the status bar, and the theme tokens are oklch. */
function pageColour() {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  // A colour the canvas can't read leaves its default black, darker than either theme's background: hand the browser nothing rather than that.
  if (ctx.fillStyle === '#000000' && !document.documentElement.matches('.dark[data-scheme="ink"]')) return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r} ${g} ${b})`;
}

/** Puts the chosen look on <html> for every workspace route, paints the backdrop layer and hands the page colour to the status bar. */
export function AppearanceBackdrop() {
  const appearance = useAtomValue(appearanceAtom) ?? DEFAULT_APPEARANCE;
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
  // Leaving for the landing page takes the look off again; it keeps its own.
  useEffect(() => () => applyAppearance(null), []);
  // Browsers paint the status bar (and an in-app browser its top bar) one flat colour: hand them the page's so the page runs on into it
  // without a seam, and let the fade under a home-screen app's clock use it too. Read a frame later, once the change has reached the page.
  useEffect(() => {
    const meta = Object.assign(document.createElement('meta'), { name: 'theme-color' });
    document.head.appendChild(meta);
    return () => { meta.remove(); document.documentElement.style.removeProperty('--page-top'); };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const color = pageColour(), meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!color || !meta) return;
      meta.content = color;
      document.documentElement.style.setProperty('--page-top', color);
    });
    return () => cancelAnimationFrame(frame);
  }, [appearance, resolvedTheme]);
  return <div aria-hidden className="hotbot-backdrop" />;
}
