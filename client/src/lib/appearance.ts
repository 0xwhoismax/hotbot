import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance, type Backdrop, type Corners, type Scheme, type Surface } from '../../../types/appearance';

export { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance };

/** Names and swatch colours for the pickers; the themes themselves are the token blocks in globals.css. `dark`/`light` are each side's page colour. */
export const SCHEME_OPTIONS: { id: Scheme; label: string; dark: string; light: string }[] = [
  { id: 'graphite', label: 'Graphite', dark: 'oklch(0.155 0 0)', light: 'oklch(0.94 0 0)' },
  { id: 'charcoal', label: 'Charcoal', dark: 'oklch(0.215 0.003 286)', light: 'oklch(0.9 0.003 286)' },
  { id: 'stone', label: 'Stone', dark: 'oklch(0.2 0.008 70)', light: 'oklch(0.93 0.012 80)' },
  { id: 'slate', label: 'Slate', dark: 'oklch(0.21 0.02 255)', light: 'oklch(0.62 0.13 252)' },
  { id: 'midnight', label: 'Midnight', dark: 'oklch(0.2 0.05 268)', light: 'oklch(0.55 0.17 275)' },
  { id: 'plum', label: 'Plum', dark: 'oklch(0.2 0.035 310)', light: 'oklch(0.58 0.15 305)' },
  { id: 'ink', label: 'Ink', dark: 'oklch(0 0 0)', light: 'oklch(1 0 0)' },
  { id: 'sky', label: 'Sky', dark: 'oklch(0.3 0.045 240)', light: 'oklch(0.88 0.06 230)' },
  { id: 'mist', label: 'Mist', dark: 'oklch(0.3 0.014 245)', light: 'oklch(0.95 0.006 220)' },
];
export const SURFACE_OPTIONS: { id: Surface; label: string }[] = [
  { id: 'flat', label: 'Flat' }, { id: 'outline', label: 'Outline' }, { id: 'raised', label: 'Raised' }, { id: 'glass', label: 'Glass' }, { id: 'bold', label: 'Bold' }, { id: 'soft', label: 'Soft' },
];
export const BACKDROP_OPTIONS: { id: Backdrop; label: string }[] = [{ id: 'plain', label: 'Plain' }, { id: 'grain', label: 'Grain' }, { id: 'dots', label: 'Dots' }, { id: 'grid', label: 'Grid' }];
export const CORNER_OPTIONS: { id: Corners; label: string }[] = [
  { id: 'sharp', label: 'Sharp' }, { id: 'crisp', label: 'Crisp' }, { id: 'soft', label: 'Soft' }, { id: 'round', label: 'Round' },
];

/** One-tap looks: each sets every part of the appearance but light or dark. Default is the reset, so it saves nothing. */
export const LOOK_OPTIONS: { id: string; label: string; appearance: Appearance }[] = [
  { id: 'default', label: 'Default', appearance: DEFAULT_APPEARANCE },
  { id: 'arcade', label: 'Arcade', appearance: { scheme: 'sky', surface: 'bold', backdrop: 'grid', corners: 'round' } },
  { id: 'calm', label: 'Calm', appearance: { scheme: 'mist', surface: 'soft', backdrop: 'plain', corners: 'soft' } },
];

export const sameAppearance = (a: Appearance, b: Appearance) => a.scheme === b.scheme && a.surface === b.surface && a.backdrop === b.backdrop && a.corners === b.corners;

/** Mirrored here so a reload paints the saved look before Convex answers. */
export const APPEARANCE_STORAGE_KEY = 'ui.appearance';
const ATTRIBUTES = ['scheme', 'surface', 'backdrop', 'corners'] as const;

/** The look lives as data attributes on <html>, which globals.css keys every token on. */
export function applyAppearance(value: Appearance | null) {
  const root = document.documentElement;
  for (const key of ATTRIBUTES) {
    if (value) root.dataset[key] = value[key];
    else delete root.dataset[key];
  }
}

/** Runs in <head> before first paint (and before React): the stored look on every route but the landing page, which keeps its own. */
export const appearanceBootScript = `try{var p=location.pathname;if(p!=='/'&&p!=='/landing'){var v=JSON.parse(localStorage.getItem('${APPEARANCE_STORAGE_KEY}')||'null')||${JSON.stringify(DEFAULT_APPEARANCE)},r=document.documentElement;['scheme','surface','backdrop','corners'].forEach(function(k){if(typeof v[k]==='string')r.dataset[k]=v[k]})}}catch(e){}`;
