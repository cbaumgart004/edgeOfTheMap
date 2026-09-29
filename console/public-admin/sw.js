// Service worker for admin.theedgeofthemap.com: shows the change-request and
// alert notifications the console API pushes (api/requests.js), and opens the
// management page when one is tapped. It caches nothing.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch { data = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Edge of the Map', {
    body: data.body ?? '',
    icon: '/icon.svg',
    data: { url: data.url ?? '/?manage' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/?manage'
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const here = open.find((c) => new URL(c.url).origin === self.location.origin)
    if (here) { await here.focus(); return here.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
