/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

/**
 * Service worker aplikacji: pamięć podręczna (offline) i powiadomienia Web Push.
 * Na iOS powiadomienia działają tylko dla aplikacji dodanej do ekranu początkowego (iOS 16.4+).
 */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/functions\//] }))

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() as PushPayload) ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }
  const title = payload.title ?? 'Trening'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: payload.tag ?? 'trening',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// Przeglądarka wymieniła subskrypcję (wygasła, zmiana klucza): odnawiamy ją tym samym kluczem
// i prosimy otwarte okna aplikacji o dopisanie nowej na serwerze (service worker nie ma sesji użytkownika).
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null }
  e.waitUntil(
    (async () => {
      const key = e.oldSubscription?.options.applicationServerKey
      if (!e.newSubscription && key) await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
    })(),
  )
})

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting()
})

void self.skipWaiting()
clientsClaim()
