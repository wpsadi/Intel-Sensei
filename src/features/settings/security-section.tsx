import { KeyRoundIcon, LockIcon, ShieldCheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { changeEncryptionPassword, disableEncryption, enableEncryption, verifyPassword } from '@/features/profile/encryption'
import { useLockStore } from '@/features/profile/lock.store'
import { type LockMode, profileRepo } from '@/features/profile/profile.db'

type Action = 'encrypt' | 'lock' | 'change' | 'remove' | 'decrypt'

const MIN_LENGTH = { encrypt: 10, lock: 8, change: 10 } as const

const TITLES: Record<Action, string> = {
  encrypt: 'Encrypt my data',
  lock: 'Set a lock password',
  change: 'Change password',
  remove: 'Remove lock password',
  decrypt: 'Turn off encryption',
}

const BUSY: Record<Action, string> = {
  encrypt: 'Encrypting…',
  lock: 'Working…',
  change: 'Working…',
  remove: 'Working…',
  decrypt: 'Decrypting…',
}

/** Encrypts the app's data with a password, or only locks the screen with one. */
export function SecuritySection() {
  const [mode, setMode] = useState<LockMode | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useLockStore((state) => state.lock)
  const markUnlocked = useLockStore((state) => state.markUnlocked)

  useEffect(() => {
    void profileRepo.mode().then(setMode)
  }, [])

  const reset = () => {
    setAction(null)
    setCurrent('')
    setNext('')
    setConfirm('')
    setUnderstood(false)
    setError('')
  }

  const needsCurrent = action === 'change' || action === 'remove' || action === 'decrypt' || (action === 'encrypt' && mode === 'lock')
  const needsNew = action === 'encrypt' || action === 'lock' || action === 'change'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!action) return
    setError('')

    if (needsNew) {
      const min = MIN_LENGTH[action as keyof typeof MIN_LENGTH]
      if (next.length < min) return setError(`Use at least ${min} characters.`)
      if (next !== confirm) return setError('The two passwords do not match.')
    }
    if (action === 'encrypt' && !understood) return setError('Confirm that you understand the data cannot be recovered.')

    setBusy(true)
    try {
      if (needsCurrent && !(await verifyPassword(current))) return setError('Current password is wrong.')

      if (action === 'encrypt') await enableEncryption(next)
      else if (action === 'decrypt') await disableEncryption(current)
      else if (action === 'lock') {
        await profileRepo.setPassword(next)
        markUnlocked()
      } else if (action === 'remove') await profileRepo.clearPassword()
      else if (mode === 'encrypted') await changeEncryptionPassword(current, next)
      else await profileRepo.setPassword(next)

      setMode(await profileRepo.mode())
      toast(
        action === 'encrypt'
          ? 'Your data is now encrypted'
          : action === 'decrypt'
            ? 'Encryption turned off'
            : action === 'change'
              ? 'Password changed'
              : action === 'lock'
                ? 'Lock password set'
                : 'Lock password removed',
      )
      reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Nothing was lost; try again.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === null) return null

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start gap-3 border p-4">
        {mode === 'encrypted' ? (
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-green-600" />
        ) : mode === 'lock' ? (
          <LockIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
        ) : (
          <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-medium">
            {mode === 'encrypted' ? 'Your data is encrypted' : mode === 'lock' ? 'Locked, not encrypted' : 'Your data is not protected'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {mode === 'encrypted'
              ? 'Notes, chats, memory, 3D and design files, uploaded files and API keys are encrypted in this browser. Sensei asks for your password every time it opens.'
              : mode === 'lock'
                ? 'Sensei asks for a password when it opens, but the data in this browser is still stored readable. Encrypt it to protect it properly.'
                : 'Anyone who can open this browser profile can read your notes, chats and API keys.'}
          </p>
        </div>
      </div>

      {!action && (
        <div className="flex flex-wrap gap-2">
          {mode !== 'encrypted' && (
            <Button size="sm" onClick={() => setAction('encrypt')}>
              Encrypt my data
            </Button>
          )}
          {mode === 'none' && (
            <Button size="sm" variant="outline" onClick={() => setAction('lock')}>
              Lock only
            </Button>
          )}
          {mode !== 'none' && (
            <Button size="sm" variant="outline" onClick={() => setAction('change')}>
              Change password
            </Button>
          )}
          {mode !== 'none' && (
            <Button size="sm" variant="outline" onClick={lock}>
              Lock now
            </Button>
          )}
          {mode === 'lock' && (
            <Button size="sm" variant="destructive" onClick={() => setAction('remove')}>
              Remove password
            </Button>
          )}
          {mode === 'encrypted' && (
            <Button size="sm" variant="destructive" onClick={() => setAction('decrypt')}>
              Turn off encryption
            </Button>
          )}
        </div>
      )}

      {action && (
        <form onSubmit={submit} className="flex flex-col gap-3 border p-4">
          <h3 className="font-medium">{TITLES[action]}</h3>
          {action === 'encrypt' && (
            <p className="text-xs text-muted-foreground">
              Your password is the only thing that can decrypt your data. It is never stored and there is no way to recover it or your data
              if you forget it. Export a backup first if you might need the data later.
            </p>
          )}
          {needsCurrent && (
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              aria-label="Current password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoFocus
            />
          )}
          {needsNew && (
            <>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={`${action === 'change' ? 'New' : 'Choose a'} password (${MIN_LENGTH[action as keyof typeof MIN_LENGTH]}+ characters)`}
                aria-label="New password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoFocus={!needsCurrent}
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                aria-label="Confirm password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </>
          )}
          {action === 'decrypt' && (
            <p className="text-xs text-muted-foreground">
              All data is decrypted and stored readable again, and the app stops asking for a password.
            </p>
          )}
          {action === 'encrypt' && (
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={understood} onCheckedChange={(checked) => setUnderstood(checked === true)} className="mt-0.5" />
              <span>I understand that if I forget this password, my data cannot be recovered by anyone.</span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant={action === 'remove' || action === 'decrypt' ? 'destructive' : 'default'}
              disabled={busy}
            >
              {busy ? BUSY[action] : TITLES[action]}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
          {busy && <p className="text-xs text-muted-foreground">Keep this tab open until it finishes.</p>}
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Encryption is AES-256-GCM with a random data key that your password locks (PBKDF2, 600,000 rounds). Record ids, timestamps and other
        fields used for lookups stay readable; the content does not. Exported backups are not encrypted. Encryption protects data stored in
        this browser, not what is on screen while the app is open.
      </p>
    </div>
  )
}
