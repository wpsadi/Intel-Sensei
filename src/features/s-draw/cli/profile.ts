import { strFromU8, unzipSync } from 'fflate'

import { registerSandboxExtension } from '@/ai/sandbox/extensions'

import { drawSandboxSession } from '../agent/session'
import cliSkill from '../agent/skills/sdraw-cli/SKILL.md?raw'
import { runDrawCommand } from './command'

export const UPSTREAM_DRAW_CLI_REVISION = '11d020f28d2a0ddabd1559038ea2b978f47e667a'
export const UPSTREAM_DRAW_CLI_ARCHIVE = `bundles/obsidian-excalidraw-cli-${UPSTREAM_DRAW_CLI_REVISION.slice(0, 12)}.zip`

export async function loadDrawCliBundle(signal?: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}${UPSTREAM_DRAW_CLI_ARCHIVE}`, { signal })
  if (!response.ok) throw new Error('The bundled drawing CLI kit could not be loaded. Reload the app before retrying.')
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  return [
    ...Object.entries(archive)
      .filter(([path]) => !path.endsWith('/'))
      .map(([path, bytes]) => ({
        path: `bundled/obsidian-excalidraw-cli/${path}`,
        text: strFromU8(bytes),
      })),
    { path: 'bundled/sdraw-cli/SKILL.md', text: cliSkill },
  ]
}

export function registerDrawCli(fileId: string) {
  const session = drawSandboxSession(fileId)
  const controller = new AbortController()
  const unregister = registerSandboxExtension(session, {
    commands: ['sdraw', 'excalidraw'],
    execute: (command, signal) =>
      runDrawCommand(command, fileId, session, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal),
    bundle: {
      key: `sdraw-cli-1:${UPSTREAM_DRAW_CLI_REVISION}`,
      load: (signal) => loadDrawCliBundle(signal ? AbortSignal.any([signal, controller.signal]) : controller.signal),
    },
  })
  return () => {
    controller.abort()
    unregister()
  }
}
