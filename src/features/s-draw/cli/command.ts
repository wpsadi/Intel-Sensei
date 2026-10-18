import { importMedia, readSandboxFile } from '@/ai/sandbox/client'
import { type ExecResult, SANDBOX_HOME } from '@/ai/sandbox/engine'

import { loadDrawTools } from '../agent/webmcp'
import { useDrawStore } from '../s-draw.store'

export const SDRAW_CLI_HELP = `SDraw CLI (browser-native adapter for the Obsidian Excalidraw agent-kit workflow)
  sdraw help                         Show this help (excalidraw is an alias)
  sdraw status                       Inspect the current file, sheet and revision
  sdraw doctor                       Check browser drawing-tool readiness
  sdraw schema create                Inspect an exact action's input schema
  sdraw read --json '{"query":"API"}'  Read elements in bounded pages
  sdraw sheet --json '{"action":"create","name":"Notes"}'  Create, switch, rename or duplicate a sheet; a new sheet becomes active
  sdraw create --request request.json Create native elements at an inspected revision
  sdraw apply --request changes.json  Update elements at an inspected revision
  sdraw check                         Find layout defects
  sdraw view --out preview.png         Save a rendered PNG in this terminal
  sdraw view --json '{"scope":"elements","ids":["api"]}' --out api.png
  sdraw export --json '{"format":"excalidraw","scope":"all"}'  Download a drawing
  sdraw call sdraw_TOOL --json '{...}' Call another registered drawing tool
  sdraw kit                          Locate the bundled upstream source and skill

Use --json OR --request, not both. JSON follows the registered SDraw tool schema.
Request paths are relative to /home/user. Run CLI commands standalone; use Python/shell separately
to prepare JSON. Shell pipelines, redirects, command substitution and arbitrary scripts are not CLI syntax.
View saved PNGs with the agent's view_image tool. Preview filenames must be plain .png names.
CLI drawing commands are recorded but NEVER replayed on terminal reset/reload.
The upstream Node/Obsidian helpers are source references, not browser executables.
`

const actions: Record<string, string> = {
  status: 'sdraw_get_document',
  doctor: 'sdraw_get_document',
  read: 'sdraw_read_elements',
  sheets: 'sdraw_list_sheets',
  sheet: 'sdraw_manage_sheets',
  create: 'sdraw_create_elements',
  apply: 'sdraw_update_elements',
  check: 'sdraw_check_layout',
  view: 'sdraw_capture_view',
  export: 'sdraw_export_scene',
}

/** Shell-like quoting for JSON, without evaluating substitutions or shell operators. */
export function parseDrawCommand(command: string): string[] {
  const words: string[] = []
  let word = '',
    quote = '',
    started = false
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && ['"', '\\'].includes(command[i + 1])) word += command[++i]
      else word += char
      started = true
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) {
        words.push(word)
        word = ''
        started = false
      }
    } else if ('|;&><`$'.includes(char))
      throw new Error('Run sdraw as a standalone command; quote JSON and use --request for prepared files.')
    else if (char === '\\') {
      if (++i === command.length) throw new Error('Trailing escape in command.')
      word += command[i]
      started = true
    } else {
      word += char
      started = true
    }
  }
  if (quote) throw new Error('Unclosed quote. Put JSON in single quotes, or use --request file.json.')
  if (started) words.push(word)
  return words
}

function decodeResult(result: unknown): unknown {
  let value = result
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return value
    }
  }
  if (value && typeof value === 'object' && 'content' in value) {
    const response = value as { isError?: boolean; content?: { type: string; text?: string }[] }
    const text =
      response.content
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n') ?? ''
    if (response.isError) throw new Error(text || 'Drawing tool failed. Inspect the current sheet before retrying.')
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return value
}

export async function runDrawCommand(command: string, fileId: string, session: string, signal?: AbortSignal): Promise<ExecResult> {
  const result = (value: unknown, code = 0): ExecResult => ({
    output: `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`,
    code,
    cwd: SANDBOX_HOME,
  })
  try {
    signal?.throwIfAborted()
    const [program, action = 'help', ...rest] = parseDrawCommand(command)
    if (!['sdraw', 'excalidraw'].includes(program)) throw new Error('Expected sdraw or excalidraw.')
    if (action === 'help' || action === '--help') return result(SDRAW_CLI_HELP)
    if (action === 'kit') {
      if (rest.length) throw new Error('Usage: sdraw kit')
      // Reading a bundled file boots the environment and installs this session's source kit.
      await readSandboxFile('bundled/obsidian-excalidraw-cli/README.md', signal, session)
      return result({
        upstream: `${SANDBOX_HOME}/bundled/obsidian-excalidraw-cli`,
        skill: `${SANDBOX_HOME}/bundled/sdraw-cli/SKILL.md`,
        runtime: 'SDraw browser adapter; upstream Node helpers require desktop Obsidian',
      })
    }
    const assertFile = () => {
      signal?.throwIfAborted()
      if (useDrawStore.getState().fileId !== fileId)
        throw new Error('The drawing file changed. Run the command in the intended file’s terminal.')
    }
    assertFile()
    const tools = await loadDrawTools(signal)
    assertFile()
    if (action === 'schema') {
      if (rest.length !== 1) throw new Error('Usage: sdraw schema create (or a registered sdraw_ tool name).')
      const name = rest[0].replace(/^action=/, '')
      const tool = tools.find((tool) => tool.name === (actions[name] ?? name))
      if (!tool) throw new Error('Unknown action. Use sdraw help or a registered sdraw_ tool name.')
      return result({ name: tool.name, description: tool.description, inputSchema: tool.schema })
    }
    const name = action === 'call' ? rest.shift() : actions[action]
    const tool = tools.find((tool) => tool.name === name)
    if (!tool) throw new Error('Unknown or unavailable drawing action. Use sdraw help.')
    let json: string | undefined, request: string | undefined, out: string | undefined
    for (let i = 0; i < rest.length; i += 2) {
      const flag = rest[i],
        value = rest[i + 1]
      if (!value || !['--json', '--request', '--out'].includes(flag))
        throw new Error('Expected --json JSON, --request file.json, or --out preview.png.')
      if (flag === '--json' && json === undefined) json = value
      else if (flag === '--request' && request === undefined) request = value
      else if (flag === '--out' && out === undefined) out = value
      else throw new Error('Supply each option only once.')
    }
    if (json !== undefined && request !== undefined) throw new Error('Use --json or --request, not both.')
    if (out && (tool.name !== 'sdraw_capture_view' || !/^[^/\\\0]+\.png$/i.test(out) || out.length > 160))
      throw new Error('--out is only for view/capture and must be a plain .png filename.')
    if (request) {
      const bytes = await readSandboxFile(request, signal, session)
      if (bytes.byteLength > 1_000_000) throw new Error('Request is over 1 MB. Use smaller drawing batches.')
      json = new TextDecoder().decode(bytes)
    }
    if ((json?.length ?? 0) > 1_000_000) throw new Error('Request is over 1 MB. Use smaller drawing batches.')
    const input: unknown = JSON.parse(json ?? '{}')
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Request must be a JSON object matching the action schema.')
    assertFile()
    const output = await tool.call(input)
    assertFile()
    if (tool.name === 'sdraw_capture_view') {
      if (!output || typeof output !== 'object' || !('image' in output) || typeof output.image !== 'string')
        throw new Error(typeof output === 'string' ? output : 'Capture did not return a PNG. Inspect the canvas before retrying.')
      const binary = atob(output.image)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const path = await importMedia(out ?? 'sdraw-preview.png', new Blob([bytes], { type: 'image/png' }), signal, session)
      return result({
        path,
        mediaType: 'image/png',
        next: 'Use view_image with this path to inspect the rendered result. Recapture after layout repairs.',
      })
    }
    return result(decodeResult(output))
  } catch (error) {
    return result(
      { error: error instanceof Error ? error.message : String(error), retry: 'Inspect current state before retrying a drawing mutation.' },
      1,
    )
  }
}
