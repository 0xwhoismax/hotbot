import { api, convex } from '@/lib/convex';
export const PUSH_OWNER_KEY = 'basics.push.owner';
/** Stop browser delivery even when the former account is no longer authenticated. */
export async function detachBrowserPush(removeFromAccount = false) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    if (removeFromAccount && convex) await convex.mutation(api.pushSubscriptions.remove, { endpoint }).catch(() => {});
  }
  localStorage.removeItem(PUSH_OWNER_KEY);
}
