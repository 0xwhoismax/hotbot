self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function destination(value) {
  try { const url = new URL(value || '/', self.location.origin); return url.origin === self.location.origin ? url.href : self.location.origin + '/'; }
  catch { return self.location.origin + '/'; }
}
self.addEventListener('push', event => {
  if (!event.data) return;
  let message; try { message = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(message.title || 'Basics', {
    body: message.body || '', icon: '/icon.svg', ...(message.tag ? { tag: message.tag } : {}), data: { url: destination(message.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close(); const url = destination(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const client of windows) if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
      await client.navigate(url); return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});
