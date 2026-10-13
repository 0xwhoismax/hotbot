import s from './hotbot.module.css';

export const platforms = ['Pump.fun', 'Axiom', 'GMGN', 'Bloom', 'Jupiter', 'Raydium'] as const;
export type PlatformName = typeof platforms[number];
const marks: Record<PlatformName | 'ClawPump', string> = {
  'Pump.fun': '/icons/launchpads/pumpfun.webp',
  Axiom: '/hotbot/brands/axiom.png',
  GMGN: '/hotbot/brands/gmgn.png',
  Bloom: '/hotbot/brands/bloom.svg',
  Jupiter: '/icons/launchpads/jupiter.webp',
  Raydium: '/icons/launchpads/raydium.svg',
  ClawPump: '/hotbot/brands/clawpump.webp',
};

/** First-party brand artwork, served locally so the preview has no image-host dependency. */
export function PlatformBrand({ name, compact = false }: { name: PlatformName | 'ClawPump'; compact?: boolean }) {
  return <span className={s.platformBrand} data-compact={compact || undefined} data-platform={name}>
    <img src={marks[name]} alt="" width={28} height={28} decoding="async"/>
    <span>{name}</span>
  </span>;
}
