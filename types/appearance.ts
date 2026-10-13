/** A person's look for the app, saved on `userSettings.appearance`. Light or dark is next-themes' own choice and stays per device. */
/** Sky is the pastel scheme; Mist is the quiet, low-contrast one. */
export const SCHEMES = ['graphite', 'charcoal', 'stone', 'slate', 'midnight', 'plum', 'ink', 'sky', 'mist'] as const;
export const SURFACES = ['flat', 'outline', 'raised', 'glass', 'bold', 'soft'] as const;
export const BACKDROPS = ['plain', 'grain', 'dots', 'grid'] as const;
/** Corner sizes apply from tablet width up; phones keep today's round corners. */
export const CORNERS = ['sharp', 'crisp', 'soft', 'round'] as const;

export type Scheme = typeof SCHEMES[number];
export type Surface = typeof SURFACES[number];
export type Backdrop = typeof BACKDROPS[number];
export type Corners = typeof CORNERS[number];
export type Appearance = { scheme: Scheme; surface: Surface; backdrop: Backdrop; corners: Corners };

export const DEFAULT_APPEARANCE: Appearance = { scheme: 'graphite', surface: 'flat', backdrop: 'plain', corners: 'crisp' };

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => options.includes(value as T) ? value as T : fallback;

/** Any stored or sent value, made whole: unknown parts fall back to the default. */
export function normalizeAppearance(value: unknown): Appearance {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    scheme: pick(SCHEMES, v.scheme, DEFAULT_APPEARANCE.scheme),
    surface: pick(SURFACES, v.surface, DEFAULT_APPEARANCE.surface),
    backdrop: pick(BACKDROPS, v.backdrop, DEFAULT_APPEARANCE.backdrop),
    corners: pick(CORNERS, v.corners, DEFAULT_APPEARANCE.corners),
  };
}
