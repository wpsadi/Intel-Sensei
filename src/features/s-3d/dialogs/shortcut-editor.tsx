import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { COMMAND_DEFS, COMMAND_IDS, type CommandId, commandSystem, useBindings } from '@/features/s-3d/commands'
import { type CommandDef, type Hotkey, formatBinding, useBindingRecorder } from '@/lib/commands'

interface Pending {
  hotkey: Hotkey
  conflicts: CommandId[]
}

/** One command: its label, its bindings as chips, and the controls to edit or reset them. */
function ShortcutRow({ id }: { id: CommandId }) {
  const def = COMMAND_DEFS[id]
  const bindings = useBindings(id)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const save = (hotkey: Hotkey) => {
    // Replaces the first binding and keeps the rest. The first one is the one menus show.
    commandSystem.setBindings(id, [hotkey, ...commandSystem.bindingsOf(id).slice(1)])
    setPending(null)
    setMessage(null)
  }

  // detectConflicts is off: the live registry also holds this command's own key and keys that other scopes shadow on purpose.
  // Same-scope clashes are checked with findConflicts below instead.
  const recorder = useBindingRecorder({
    detectConflicts: false,
    onRecord: (hotkey) => {
      const conflicts = commandSystem.findConflicts(id, hotkey).map((c) => c.id)
      if (conflicts.length) {
        setPending({ hotkey, conflicts })
        setMessage(null)
        return
      }
      save(hotkey)
    },
    onClear: () => {
      commandSystem.setBindings(id, [])
      setPending(null)
      setMessage(null)
    },
    onCancel: () => setMessage(null),
    onReject: (rejection) => setMessage(rejection.message),
  })

  const startRecording = () => {
    setPending(null)
    setMessage(null)
    recorder.startRecording()
  }

  // Native commands (copy, cut, paste) keep their keys on the browser's clipboard events, so rebinding them would do nothing.
  const editable = (def as CommandDef).keyboard !== false

  return (
    <div>
      <div className="flex items-center gap-2 border-b py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate">{def.label}</span>

        <div className="flex flex-wrap justify-end gap-1">
          {recorder.isRecording ? (
            <kbd className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
              {recorder.recordedHotkey ? formatBinding(recorder.recordedHotkey) : 'Press a key'}
            </kbd>
          ) : bindings.length ? (
            bindings.map((b, i) => (
              <kbd key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {formatBinding(b)}
              </kbd>
            ))
          ) : (
            <span className="text-muted-foreground">Unbound</span>
          )}
        </div>

        {editable ? (
          <>
            {recorder.isRecording ? (
              <Button size="xs" variant="ghost" onClick={() => recorder.cancelRecording()}>
                Cancel
              </Button>
            ) : (
              <Button size="xs" variant="outline" aria-label={`Edit ${def.label} shortcut`} onClick={startRecording}>
                Edit
              </Button>
            )}
            <Button size="xs" variant="ghost" aria-label={`Reset ${def.label} shortcut`} onClick={() => commandSystem.resetBindings(id)}>
              Reset
            </Button>
          </>
        ) : (
          <span className="w-[7.5rem] text-right text-muted-foreground">Native</span>
        )}
      </div>

      {recorder.isRecording && !message && (
        <p className="py-1 text-[10px] text-muted-foreground">Press the new keys. Esc cancels, Backspace or Delete clears.</p>
      )}
      {message && !recorder.isRecording && <p className="py-1 text-[10px] text-amber-600">{message}</p>}
      {pending && (
        <div className="flex flex-wrap items-center gap-2 py-1 text-[10px] text-amber-600">
          <span>Already used by {pending.conflicts.map((c) => COMMAND_DEFS[c].label).join(', ')} in this scope.</span>
          <Button size="xs" variant="outline" onClick={() => save(pending.hotkey)}>
            Save anyway
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setPending(null)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  )
}

/** Every command, grouped by its `group`, in the order the groups first appear. */
export function ShortcutGroups() {
  const groups = useMemo(() => {
    const map = new Map<string, CommandId[]>()
    for (const id of COMMAND_IDS) {
      const name = COMMAND_DEFS[id].group ?? 'Other'
      map.set(name, [...(map.get(name) ?? []), id])
    }
    return [...map]
  }, [])

  return (
    <>
      {groups.map(([name, ids]) => (
        <section key={name}>
          <h3 className="pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{name}</h3>
          {ids.map((id) => (
            <ShortcutRow key={id} id={id} />
          ))}
        </section>
      ))}
    </>
  )
}
