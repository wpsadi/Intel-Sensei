import { create } from 'zustand'

import { vault } from '@/features/vault/vault'

import { unlockEncrypted } from './encryption'
import { profileRepo } from './profile.db'

/** Whether the app is behind the password screen. Lives in memory only, so every page load asks again. */
interface LockState {
  /** 'checking' until the profile has been read, so the app never flashes before the lock appears. */
  status: 'checking' | 'locked' | 'unlocked'
  /** True when the data on disk is encrypted, so the lock screen can say so. */
  encrypted: boolean
  /** Reads the profile once at startup and locks when a password is set. */
  init(): Promise<void>
  /** Returns false when the password does not match. */
  unlock(password: string): Promise<boolean>
  lock(): void
  /** Used after a password is set or removed, so the current session stays open. */
  markUnlocked(): void
}

let started = false

export const useLockStore = create<LockState>((set, get) => ({
  status: 'checking',
  encrypted: false,

  async init() {
    if (started) return
    started = true
    try {
      const mode = await profileRepo.mode()
      set({ status: mode === 'none' ? 'unlocked' : 'locked', encrypted: mode === 'encrypted' })
    } catch {
      // IndexedDB is blocked, so there is no stored password to ask for.
      set({ status: 'unlocked' })
    }
  },

  async unlock(password) {
    const ok = get().encrypted ? await unlockEncrypted(password) : await profileRepo.verify(password)
    if (ok) set({ status: 'unlocked' })
    return ok
  },

  lock() {
    // Decrypted data sits in memory (stores, editors), so with a key loaded the only clean lock is a fresh page.
    if (vault.key) location.reload()
    else set({ status: 'locked' })
  },
  markUnlocked: () => set({ status: 'unlocked' }),
}))
