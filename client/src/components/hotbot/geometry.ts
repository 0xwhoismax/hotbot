/** Shared flat cloud silhouette from the supplied Trading Rooms artwork. */
export const HOTBOT_CLOUD_PATH = 'M-48 29C-65 29-76 17-74 2C-73-10-65-19-54-21C-57-45-38-61-17-56C-7-73 23-70 33-49C54-53 71-36 68-16C87-1 75 28 54 31C46 50 22 53 7 40C-10 56-35 48-40 35C-43 35-47 32-48 29Z';

/** ShieldBot's heater shield: a peaked top, rounded shoulders and a point, slimmer than the shield art in the security video. */
export const HOTBOT_SHIELD_PATH = 'M0-68C16-60 34-57 50-58C55-58.5 58-55 58-50V-8C58 28 34 52 2 66C0.7 66.6-0.7 66.6-2 66C-34 52-58 28-58-8V-50C-58-55-55-58.5-50-58C-34-57-16-60 0-68Z';

/** The app icon's flame (public/icon.svg, which holds the same numbers): its path, the gradient that shades it and its two slanted eyes
 *  (centre, radii, slant in degrees), in the icon's 512 unit space. */
export const APP_FLAME = {
  path: 'M190 16C188 64 210 104 256 126C318 148 366 182 388 222C402 206 414 196 432 192C418 214 412 240 420 262C434 278 446 296 454 318C460 306 468 298 480 292C472 318 472 344 472 372C472 470 392 546 270 546C136 546 18 470 18 344C18 268 24 192 50 146C56 172 72 190 92 196C82 160 88 118 110 92C112 116 122 138 140 150C120 100 140 50 190 16Z',
  viewBox: '8 6 482 548',
  gradient: { cx: 268, cy: 300, r: 290, fx: 258, fy: 280, stops: [[0, '#ffec9a'], [0.3, '#ffc845'], [0.62, '#ff8b30'], [0.88, '#e84c24'], [1, '#c93a1f']] },
  eyes: [{ cx: 220, cy: 282, rx: 26, ry: 52, slant: -28 }, { cx: 346, cy: 296, rx: 23, ry: 46, slant: -24 }],
  /** The drawing's centre line, which `faceLeft` mirrors the whole flame about. */
  axis: 249,
  ink: '#0a0a0a',
} as const;
