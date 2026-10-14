import { type HotkeyRecorderOptions, type ReactHotkeyRecorder, useHotkeyRecorder } from '@tanstack/react-hotkeys'
import { useEffect } from 'react'

import { setRecording } from './create-command-system'

/**
 * Records a new binding from the keyboard. While it is recording, the dispatcher does not run any command.
 * Conflicts are checked against the live registry, so a key that a command already uses is reported through `onReject`.
 */
export function useBindingRecorder(options: HotkeyRecorderOptions): ReactHotkeyRecorder {
  const recorder = useHotkeyRecorder({ detectConflicts: true, recordBy: 'code', ...options })
  useEffect(() => {
    if (!recorder.isRecording) return
    setRecording(true)
    return () => setRecording(false)
  }, [recorder.isRecording])
  return recorder
}
