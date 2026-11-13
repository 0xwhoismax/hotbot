"use client";
import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useMutation } from 'convex/react';
import { store } from '@/store/store';
import { api, type Id } from '@/lib/convex';
import { currentUserIdAtom } from '@/store/user/atoms';
import { PUSH_OWNER_KEY, detachBrowserPush } from '@/lib/browserPush';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
function keyBytes(value: string) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}
export function usePushNotifications() {
  const userId = useAtomValue(currentUserIdAtom), save = useMutation(api.pushSubscriptions.save);
  const [supported, setSupported] = useState(false), [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  useEffect(() => {
    const available = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // Browser capability/permission discovery synchronizes external platform state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(available); if (!available) return;
    setPermission(Notification.permission);
    let active = true;
    void (async () => {
      if (localStorage.getItem(PUSH_OWNER_KEY) !== userId) await detachBrowserPush();
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setSubscribed(Boolean(subscription));
    })().catch(() => { if (active) setSubscribed(false); });
    return () => { active = false; };
  }, [userId]);
  async function subscribe() {
    if (!supported || !VAPID_PUBLIC_KEY || !userId) throw new Error('Push notifications are unavailable');
    const sameAccount = () => store.get(currentUserIdAtom) === userId;
    const nextPermission = await Notification.requestPermission();
    if (!sameAccount()) return false;
    setPermission(nextPermission);
    if (nextPermission !== 'granted') return false;
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await navigator.serviceWorker.ready;
    if (!sameAccount()) return false;
    if (localStorage.getItem(PUSH_OWNER_KEY) !== userId) await detachBrowserPush();
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    if (!sameAccount()) { await subscription.unsubscribe(); return false; }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Invalid push subscription');
    try { await save({ userId: userId as Id<"users">, endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent }); }
    catch (error) { await subscription.unsubscribe(); throw error; }
    if (!sameAccount()) { await subscription.unsubscribe(); return false; }
    localStorage.setItem(PUSH_OWNER_KEY, userId); setSubscribed(true); return true;
  }
  async function unsubscribe() { await detachBrowserPush(true); setSubscribed(false); }
  return { isSupported: supported, isConfigured: Boolean(VAPID_PUBLIC_KEY), permission, subscribed, subscribe, unsubscribe };
}
