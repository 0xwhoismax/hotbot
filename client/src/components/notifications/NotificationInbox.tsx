"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
export function NotificationInbox() {
  const messages = useQuery(api.notifications.list, {}), markRead = useMutation(api.notifications.markRead);
  const push = usePushNotifications(), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const unread = messages?.filter(row => row.readAt === undefined) ?? [];
  async function run(task: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await task(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Notification action failed'); } finally { setBusy(false); }
  }
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}><Bell />{unread.length > 0 && <Badge className="absolute -right-1 -top-1" variant="secondary">{unread.length}</Badge>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] space-y-4"><h2>Notifications</h2>
      {unread.length > 0 && <Button variant="outline" disabled={busy} onClick={() => void run(() => markRead({ ids: unread.map(row => row._id) }))}>Mark all read</Button>}
      <div className="max-h-80 space-y-4 overflow-y-auto">{messages === undefined ? <p role="status">Loading…</p> : !messages.length ? <p>No notifications.</p> : messages.map(row => <div key={row._id} className="space-y-1"><div>{row.title} {row.readAt === undefined && <Badge variant="secondary">Unread</Badge>}</div><p>{row.body}</p><time className="text-xs text-muted-foreground">{new Date(row._creationTime).toLocaleString()}</time><div className="flex gap-2">{row.destination && row.destination !== '/' && <Link href={row.destination}>Open</Link>}{row.readAt === undefined && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => markRead({ ids: [row._id] }))}>Mark read</Button>}</div></div>)}</div>
      {!push.isSupported ? <p>Web Push is unavailable in this browser.</p> : !push.isConfigured ? <p>Web Push is not configured.</p> : <Button variant="outline" disabled={busy || push.permission === 'denied'} onClick={() => void run(push.subscribed ? push.unsubscribe : push.subscribe)}>{push.subscribed ? 'Disable push notifications' : 'Enable push notifications'}</Button>}
      {push.permission === 'denied' && <p>Push permission is blocked in browser settings.</p>}{error && <p role="alert">{error}</p>}
    </PopoverContent></Popover>;
}
