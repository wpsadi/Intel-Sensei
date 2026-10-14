import { LockIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { useLockStore } from './lock.store'

/** Full-screen password prompt shown on every app open when a password is set. */
export function LockScreen() {
  const unlock = useLockStore((state) => state.unlock)
  const encrypted = useLockStore((state) => state.encrypted)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    const ok = await unlock(password)
    if (!ok) {
      setError('Wrong password. Try again.')
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 border p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <LockIcon className="size-6 text-muted-foreground" />
          <h1 className="text-base font-medium">Sensei is locked</h1>
          <p className="text-sm text-muted-foreground">
            {encrypted ? 'Your data is encrypted. Enter your password to decrypt it.' : 'Enter your password to continue.'}
          </p>
        </div>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          aria-label="Password"
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!password || busy}>
          {busy ? (encrypted ? 'Decrypting…' : 'Checking…') : 'Unlock'}
        </Button>
      </form>
    </div>
  )
}
