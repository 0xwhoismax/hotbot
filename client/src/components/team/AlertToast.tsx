"use client";
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { BotAvatar } from '@/components/hotbot/BotAvatar';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AlertTopic } from '../../../../types/team';
import type { HomeData } from './data';
import { appHref } from './format';
import { viewedAtom } from './state';

type Alert = NonNullable<HomeData['alert']>;
const DAY_MS = 86_400_000, SEEN_KEY = 'hotbot:alert-seen';

/** The one action that answers an alert, for its notification and its feed row. A stopped worker has none: only its return ends it. */
export function alertAction(topic: AlertTopic, itemId: string | null): { label: string; href: string } | null {
  switch (topic) {
    case 'practiceSol': return { label: 'Top up', href: appHref('account') + '#practice-sol' };
    case 'walletSol': return { label: 'Add SOL', href: appHref('account') };
    case 'approvals': return { label: 'Review', href: itemId ? appHref('tokens', itemId) : appHref() };
    case 'worker': return null;
  }
}

/** Whether the alert still holds on the home data now: a top-up, a sale, an answered ask or the worker's return ends it. Practice SOL can
 *  be checked only while the practice portfolio is shown (`money.cash` is the shown one's); in Real SOL the alert's age decides. */
function holds(alert: Alert, data: HomeData) {
  const sizes = (mode: 'paper' | 'live') => data.strategies.filter(row => row.status === 'running' && row.mode === mode).map(row => row.rules.amountSol);
  switch (alert.topic) {
    case 'practiceSol': {
      if (data.workspace.mode !== 'paper') return true;
      const need = sizes('paper');
      return need.length > 0 && data.money.cash < Math.min(...need) && !data.bags.some(row => row.mode === 'paper');
    }
    case 'walletSol': { const need = sizes('live'); return need.length > 0 && data.workspace.liveCashSol < Math.min(...need) + 0.01; }
    case 'approvals': return data.needs.length > 0;
    case 'worker': return !data.worker.online;
  }
}

const seen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const markSeen = (id: string) => { try { localStorage.setItem(SEEN_KEY, id); } catch { /* Private windows refuse storage: the alert can show again. */ } };

/** HOTBOT's newest alert (`home.alert`) as a notification: its title, its support line and its one action. Each alert shows once, within a
 *  day of being raised, and only while it still holds; it closes when it stops holding. Only on one's own team, as its action would act on
 *  the admin's own account while viewing someone else's. It reads the home data already loaded, with no read of its own. */
export function AlertToast({ data }: { data: HomeData }) {
  const router = useRouter(), viewing = Boolean(useAtomValue(viewedAtom)), mobile = useIsMobile(), open = useRef<string | null>(null);
  const alert = data.alert, current = Boolean(alert && !viewing && Date.now() - alert.at < DAY_MS && holds(alert, data));
  useEffect(() => {
    if (!alert) return;
    const id = 'hotbot-alert:' + alert.topic;
    if (!current) {
      if (open.current === alert.id) { toast.dismiss(id); open.current = null; }
      return;
    }
    if (open.current === alert.id || seen() === alert.id) return;
    open.current = alert.id;
    markSeen(alert.id);
    const [title, ...support] = alert.detail.split('\n'), action = alertAction(alert.topic, alert.itemId);
    toast.warning(title, {
      id, description: support.join(' ') || undefined, icon: <BotAvatar role="coordinator" size={20}/>, duration: Infinity, closeButton: true,
      ...(action ? { action: { label: action.label, onClick: () => router.push(action.href) } } : {}),
      // The phone's pill toasts fit one line; an alert has two and a button.
      ...(mobile ? { style: { borderRadius: 'var(--radius)' } } : {}),
    });
  }, [alert, current, mobile, router]);
  return null;
}
