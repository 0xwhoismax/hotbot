import { AppFlame } from '../AppFlame';

/** The app icon's flame, still, sized by its container, for product chrome. */
export function FlameMark({ className }: { className?: string }) {
  return <AppFlame still className={className}/>;
}
