import { AppFlame } from '@/components/hotbot/AppFlame';

/** The app icon's flame, alive (it bobs, glances aside and blinks), for the legal pages and the consent dialogs. */
export function LegalMascot({ size }: { size: number }) {
  return <span className="block shrink-0" style={{ width: size }}><AppFlame/></span>;
}
