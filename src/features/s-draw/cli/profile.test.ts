import { readFileSync } from 'node:fs'

import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./command', () => ({ runDrawCommand: vi.fn() }))

import { sandboxCommand, sandboxExtension } from '@/ai/sandbox/extensions'

import { UPSTREAM_DRAW_CLI_ARCHIVE, UPSTREAM_DRAW_CLI_REVISION, loadDrawCliBundle, registerDrawCli } from './profile'

afterEach(() => vi.unstubAllGlobals())

describe('bundled Obsidian Excalidraw kit', () => {
  it('ships the complete pinned source kit, original license, examples and runnable desktop helpers', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('../../../../public/' + UPSTREAM_DRAW_CLI_ARCHIVE, import.meta.url)))
    const archive = unzipSync(bytes)
    for (const path of [
      'AGENTS.md',
      'SKILL.md',
      'README.md',
      'LICENSE',
      'package.json',
      'scripts/native.mjs',
      'scripts/layout.mjs',
      'scripts/doctor.mjs',
      'docs/authoring.md',
      'examples/first-drawing.mjs',
      'tests/native.test.mjs',
    ])
      expect(archive[path]).toBeDefined()
    expect(new TextDecoder().decode(archive.LICENSE)).toContain('GNU AFFERO GENERAL PUBLIC LICENSE')
    expect(JSON.parse(new TextDecoder().decode(archive['SDRAW-PROVENANCE.json'])).revision).toBe(UPSTREAM_DRAW_CLI_REVISION)
    expect(Object.keys(archive).some((path) => path.startsWith('.git/'))).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)))
    const files = await loadDrawCliBundle()
    expect(files.find((file) => file.path === 'bundled/sdraw-cli/SKILL.md')?.text).toContain('name: sdraw-cli')
    expect(files.find((file) => file.path === 'bundled/obsidian-excalidraw-cli/scripts/native.mjs')?.text).toContain('node:child_process')
  })

  it('scopes commands and bundle installation to this drawing file and removes them on unmount', () => {
    const cleanup = registerDrawCli('a')
    expect(sandboxCommand('sdraw-a', 'sdraw status')).toBeDefined()
    expect(sandboxCommand('sdraw-a', 'excalidraw help')).toBeDefined()
    expect(sandboxCommand('sdraw-b', 'sdraw status')).toBeUndefined()
    expect(sandboxCommand('default', 'sdraw status')).toBeUndefined()
    expect(sandboxExtension('sdraw-a')?.bundle?.key).toContain(UPSTREAM_DRAW_CLI_REVISION)
    cleanup()
    expect(sandboxCommand('sdraw-a', 'sdraw status')).toBeUndefined()
  })
})
