import type { ExecResult } from './engine'

export interface SandboxExtension {
  commands: readonly string[]
  execute(command: string, signal?: AbortSignal): Promise<ExecResult>
  bundle?: { key: string; load(signal?: AbortSignal): Promise<{ path: string; text: string }[]> }
}

const extensions = new Map<string, SandboxExtension>()

/** App commands are scoped to their terminal and exist only while that app is mounted. */
export function registerSandboxExtension(session: string, extension: SandboxExtension) {
  extensions.set(session, extension)
  return () => {
    if (extensions.get(session) === extension) extensions.delete(session)
  }
}

export const sandboxExtension = (session: string) => extensions.get(session)

export function sandboxCommand(session: string, command: string) {
  const extension = extensions.get(session)
  const name = command.trimStart().match(/^\S+/)?.[0]
  return name && extension?.commands.includes(name) ? extension : undefined
}
