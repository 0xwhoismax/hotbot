"use client";
import { useState } from 'react';
import { Bell, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api, type Doc } from '@/lib/convex';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/lib/appNavigation';

const when = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
/** An unread notification that needs the person: it leads the list, tinted, and rings the bell until read. */
const needsYou = (row: Doc<'notifications'>) => row.readAt === undefined && (row.severity === 'warning' || row.severity === 'error');

/** The bell and its list. The unread count sits inside the bell's own square, so it never reaches the control beside it. Push shows only
 *  where this browser and deployment can send it. */
export function NotificationInbox() {
  const messages = useQuery(api.notifications.list, {}), markRead = useMutation(api.notifications.markRead);
  const push = usePushNotifications(), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [open, setOpen] = useState(false);
  const unread = messages?.filter(row => row.readAt === undefined) ?? [], urgent = messages?.filter(needsYou) ?? [];
  const rows = messages && [...urgent, ...messages.filter(row => !needsYou(row))];
  async function run(task: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Notification action failed'); } finally { setBusy(false); }
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" className={`relative ${urgent.length ? 'hotbot-bell-alert' : ''}`}
      aria-label={urgent.length ? `Notifications, ${urgent.length} need you` : unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications'}>
      <Bell/>{unread.length > 0 && <span aria-hidden className="absolute right-[0.3em] top-[0.3em] grid h-[1.15em] min-w-[1.15em] place-items-center rounded-full bg-[var(--warning)] px-[0.3em] text-[0.625rem] font-semibold leading-none text-[oklch(0.18_0_0)]">{unread.length > 9 ? '9+' : unread.length}</span>}
    </Button></PopoverTrigger>
    <PopoverContent align="end" className="flex w-[24em] max-w-[calc(100vw-2rem)] flex-col gap-[0.75em] p-[0.85em]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold">Notifications</h2>
        {unread.length > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => markRead({ ids: unread.map(row => row._id) }))}>Mark all read</Button>}
      </div>
      <div className="-mx-[0.35em] flex max-h-[22em] flex-col gap-[0.2em] overflow-y-auto">
        {rows === undefined ? <p role="status" className="px-[0.35em] py-[1.5em] text-center text-sm text-muted-foreground">Loading…</p>
          : !rows.length ? <p className="px-[0.35em] py-[1.5em] text-center text-sm text-muted-foreground">No notifications</p>
          : rows.map(row => {
            const important = needsYou(row), target = row.destination && row.destination !== '/' ? row.destination : null;
            return <div key={row._id} className={`flex gap-[0.6em] rounded-[calc(0.75em*var(--r-scale))] px-[0.35em] py-[0.6em] ${important ? 'border-l-2 border-[var(--warning)] bg-[color-mix(in_oklch,var(--warning)_12%,transparent)] pl-[0.55em]' : ''}`}>
              {important ? <TriangleAlert aria-hidden className="mt-[0.15em] size-[0.95em] shrink-0 text-[var(--warning)]"/>
                : <span aria-hidden className={`mt-[0.45em] size-[0.45em] shrink-0 rounded-full ${row.readAt === undefined ? 'bg-[var(--warning)]' : 'bg-transparent'}`}/>}
              <div className="flex min-w-0 flex-1 flex-col gap-[0.2em]">
                <div className="flex items-baseline justify-between gap-2"><b className="text-sm font-medium">{row.title}</b><time className="shrink-0 text-xs text-muted-foreground">{when(row._creationTime)}</time></div>
                <p className="text-[0.8125rem] leading-snug text-muted-foreground">{row.body}</p>
                {(target || row.readAt === undefined) && <div className="mt-[0.3em] flex gap-[0.4em]">
                  {target && <Button size="sm" variant={important ? 'default' : 'outline'} asChild><Link href={target} onClick={() => {
                    setOpen(false);
                    if (row.readAt === undefined) void run(() => markRead({ ids: [row._id] }));
                  }}>{row.action ?? 'Open'}</Link></Button>}
                  {row.readAt === undefined && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => markRead({ ids: [row._id] }))}>Mark read</Button>}
                </div>}
              </div>
            </div>;
          })}
      </div>
      {push.isSupported && push.isConfigured && <Button variant="outline" size="sm" disabled={busy || push.permission === 'denied'} onClick={() => void run(push.subscribed ? push.unsubscribe : push.subscribe)}>{push.subscribed ? 'Turn off push' : 'Turn on push'}</Button>}
      {push.permission === 'denied' && <p className="text-xs text-muted-foreground">Push is blocked in this browser&apos;s settings.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </PopoverContent>
  </Popover>;
}
