import { BadgeCheck, LogIn, Pencil, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import o from './onboarding.module.css';

export type WayKey = 'apply' | 'edit' | 'signin' | 'check';
const WAY: Record<WayKey, { label: string; Icon: typeof Send; iconTone: 'positive' | 'ember' | 'info' }> = {
  apply: { label: 'Apply', Icon: Send, iconTone: 'ember' },
  edit: { label: 'Change answers', Icon: Pencil, iconTone: 'ember' },
  signin: { label: 'Sign in', Icon: LogIn, iconTone: 'info' },
  check: { label: 'Check status', Icon: BadgeCheck, iconTone: 'positive' },
};

/** The way in's keys, on /join and the signed-out /app: the visitor's likely next step first and solid, the other two side by side in outline
 *  with their icon in colour. Each key is a link or an action on the page. */
export function WayIn({ keys, on }: { keys: [WayKey, WayKey, WayKey]; on: Partial<Record<WayKey, string | (() => void)>> }) {
  const key = (id: WayKey, first: boolean) => {
    const { label, Icon, iconTone } = WAY[id], act = on[id], look = first ? {} : { variant: 'outline' as const, iconTone };
    return typeof act === 'string'
      ? <Button key={id} asChild size="lg" className={o.cta} {...look}><a href={act}><Icon/>{label}</a></Button>
      : <Button key={id} size="lg" className={o.cta} {...look} onClick={act}><Icon/>{label}</Button>;
  };
  return <div className={o.way}>{key(keys[0], true)}<div className={o.ctaRow}>{key(keys[1], false)}{key(keys[2], false)}</div></div>;
}
