/* ---------- change notifications (same tab + other tabs) ---------- */

export type StoreName = 'pages' | 'databases' | 'views' | 'synced' | 'people' | 'settings' | 'chats' | 'chatMessages' | 'widgetChats'

type Listener = (store: StoreName, id: string) => void
const listeners = new Set<Listener>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('snote-changes')

channel?.addEventListener('message', (event: MessageEvent<{ store: StoreName; id: string }>) => {
  listeners.forEach((fn) => fn(event.data.store, event.data.id))
})

export function notify(store: StoreName, id: string) {
  listeners.forEach((fn) => fn(store, id))
  channel?.postMessage({ store, id })
}

export function subscribe(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const uid = () => crypto.randomUUID()
