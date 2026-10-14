import { useSyncExternalStore } from 'react'

/** Shared minute clock, so renders read the current time without calling `Date.now()` themselves. */
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** Current time in ms, refreshed every minute while any component is subscribed. */
export function useNow() {
  return useSyncExternalStore(subscribe, () => now)
}
