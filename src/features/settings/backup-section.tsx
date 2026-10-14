import { AlertTriangleIcon, DownloadIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { verifyPassword } from '@/features/profile/encryption'
import { useLockStore } from '@/features/profile/lock.store'
import { profileRepo } from '@/features/profile/profile.db'
import { exportBackup, importBackup } from '@/features/vault/backup'

/** Export everything as a zip, or restore from one. Needs the password first when the app is locked. */
export function BackupSection() {
  const [locked, setLocked] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [includeKeys, setIncludeKeys] = useState(false)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  // The password was already entered to open the app, but asking again protects an unattended, unlocked session.
  const status = useLockStore((state) => state.status)

  useEffect(() => {
    void profileRepo.hasPassword().then(setLocked)
  }, [status])

  const checkPassword = async () => {
    if (!locked) return true
    if (!password) {
      setError('Enter your password to continue.')
      return false
    }
    if (!(await verifyPassword(password))) {
      setError('Wrong password.')
      return false
    }
    return true
  }

  const doExport = async () => {
    setError('')
    setBusy('export')
    try {
      if (!(await checkPassword())) return
      const blob = await exportBackup({ includeApiKeys: includeKeys })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sensei-backup-${new Date().toISOString().slice(0, 10)}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast('Backup exported. It is not encrypted.')
      setPassword('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const doImport = async (file: File) => {
    setError('')
    setBusy('import')
    try {
      if (!(await checkPassword())) return
      const summary = await importBackup(file)
      toast(`Imported ${summary.records} records and ${summary.files} files. Reloading…`)
      setTimeout(() => location.reload(), 1200)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (locked === null) return null

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start gap-3 border border-amber-500/50 bg-amber-500/5 p-4">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <p className="text-xs">
          <strong>The zip holds raw data, not encrypted data.</strong> Even with encryption on, the exported files are readable by anyone
          who has them. Store the zip somewhere safe.
        </p>
      </div>

      {locked && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Password</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password to export or import"
          />
        </label>
      )}

      <section className="flex flex-col gap-3 border p-4">
        <div>
          <h3 className="font-medium">Export</h3>
          <p className="text-xs text-muted-foreground">
            Notes, chats, memory, S3D and S-Design projects, uploaded files and usage history, in one zip.
          </p>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={includeKeys} onCheckedChange={(checked) => setIncludeKeys(checked === true)} className="mt-0.5" />
          <span>Include my API keys (they will be readable in the zip)</span>
        </label>
        <Button size="sm" className="w-fit" onClick={doExport} disabled={busy !== null}>
          <DownloadIcon />
          {busy === 'export' ? 'Exporting…' : 'Export zip'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 border p-4">
        <div>
          <h3 className="font-medium">Import</h3>
          <p className="text-xs text-muted-foreground">
            Choose a Sensei backup zip. Its records are added to what is here; any with the same id are replaced, and nothing is deleted.
            {locked ? ' Imported data is stored encrypted when encryption is on.' : ''}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void doImport(file)
          }}
        />
        <Button size="sm" variant="outline" className="w-fit" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          <UploadIcon />
          {busy === 'import' ? 'Importing…' : 'Choose zip to import'}
        </Button>
      </section>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
