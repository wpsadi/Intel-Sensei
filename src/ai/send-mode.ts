import { SEND_MODE_STORAGE } from '@/constants/ai'

/**
 * What sending a message does while a reply is still running:
 * - `queue`: the message waits and is sent when the reply ends.
 * - `steer`: the message goes into the running reply at its next step, so the model takes it into account right away.
 */
export type SendMode = 'queue' | 'steer'

/** The send behaviour chosen in Settings → Chat, kept in localStorage. `SEND_MODE.value` is 'queue' until one is chosen. */
export class SEND_MODE {
  static get value(): SendMode {
    try {
      return localStorage.getItem(SEND_MODE_STORAGE) === 'steer' ? 'steer' : 'queue'
    } catch {
      return 'queue'
    }
  }

  static set value(mode: SendMode) {
    try {
      localStorage.setItem(SEND_MODE_STORAGE, mode)
    } catch {
      // The choice then lasts only until the page reloads.
    }
  }
}
