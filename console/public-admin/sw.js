// Service worker for admin.theedgeofthemap.com: shows the change-request and
// alert notifications the console API pushes (api/requests.js), and opens the
// management page when one is tapped. It caches nothing.
//
// The app icon carries a badge with the number of notifications still in the
// tray: set on each push, recounted when one is tapped or dismissed, and
// cleared by the admin page when it is opened (dashboard.js, markRead). The
// Badging API needs the page installed (iPhone: added to the Home Screen);
// where it is missing the notifications still show, with no badge.

async function recount() {
  if (!self.navigator.setAppBadge) return
  const n = (await self.registration.getNotifications()).length
  await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {})
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch { data = { body: event.data?.text() } }
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title ?? 'Edge of the Map', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      data: { url: data.url ?? '/?manage' },
    })
    await recount()
  })())
})

self.addEventListener('notificationclose', (event) => event.waitUntil(recount()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/?manage'
  event.waitUntil((async () => {
    await recount()
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const here = open.find((c) => new URL(c.url).origin === self.location.origin)
    if (here) { await here.focus(); return here.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
