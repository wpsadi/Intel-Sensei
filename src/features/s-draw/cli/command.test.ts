import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), put: vi.fn(), call: vi.fn(), load: vi.fn(), fileId: 'a' }))
vi.mock('@/ai/sandbox/client', () => ({ readSandboxFile: mocks.read, importMedia: mocks.put }))
vi.mock('../agent/webmcp', () => ({ loadDrawTools: mocks.load }))
vi.mock('../s-draw.store', () => ({ useDrawStore: { getState: () => ({ fileId: mocks.fileId }) } }))

import { parseDrawCommand, runDrawCommand } from './command'

const run = (command: string, signal?: AbortSignal) => runDrawCommand(command, 'a', 'sdraw-a', signal)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.fileId = 'a'
  mocks.load.mockResolvedValue(
    ['sdraw_get_document', 'sdraw_manage_sheets', 'sdraw_create_elements', 'sdraw_update_elements', 'sdraw_read_elements', 'sdraw_capture_view'].map((name) => ({
      name,
      schema: { type: 'object' },
      description: name,
      call: mocks.call,
    })),
  )
  mocks.call.mockResolvedValue({ content: [{ type: 'text', text: '{"revision":7,"sheetId":"sheet-a"}' }] })
  mocks.put.mockResolvedValue('/home/user/preview.png')
})

describe('SDraw terminal commands', () => {
  it('parses quoted JSON and paths without interpreting operators inside string data', () => {
    expect(parseDrawCommand(`sdraw read --json '{"query":"API | DB; $value"}'`)).toEqual([
      'sdraw',
      'read',
      '--json',
      '{"query":"API | DB; $value"}',
    ])
    expect(parseDrawCommand('sdraw create --request "my request.json"')).toEqual(['sdraw', 'create', '--request', 'my request.json'])
    expect(() => parseDrawCommand('sdraw create | cat')).toThrow('standalone')
    expect(() => parseDrawCommand('sdraw read $(cat file)')).toThrow('standalone')
    expect(() => parseDrawCommand("sdraw read --json '")).toThrow('Unclosed quote')
  })

  it('offers help without starting a worker or invoking a drawing tool', async () => {
    expect(await run('excalidraw help')).toMatchObject({ code: 0, output: expect.stringContaining('sdraw view') })
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('discovers the live schema and reads status without mutations', async () => {
    expect(await run('sdraw schema action=create')).toMatchObject({ code: 0, output: expect.stringContaining('sdraw_create_elements') })
    expect(mocks.call).not.toHaveBeenCalled()
    const result = await run('sdraw status')
    expect(JSON.parse(result.output)).toEqual({ revision: 7, sheetId: 'sheet-a' })
    expect(mocks.call).toHaveBeenCalledWith({})
  })

  it('creates, switches or renames a sheet with its own command, and documents it in help', async () => {
    expect((await run('sdraw help')).output).toContain('sdraw sheet')
    expect((await run(`sdraw sheet --json '{"action":"create","name":"Explanation"}'`)).code).toBe(0)
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ action: 'create', name: 'Explanation' })
  })

  it('passes the exact file request and inspected revision to the native create tool', async () => {
    const request = { sheetId: 'sheet-a', expectedRevision: 7, elements: [{ type: 'rectangle', x: 0, y: 0, label: { text: 'API' } }] }
    mocks.read.mockResolvedValue(new TextEncoder().encode(JSON.stringify(request)))
    expect((await run('sdraw create --request "my request.json"')).code).toBe(0)
    expect(mocks.read).toHaveBeenCalledWith('my request.json', undefined, 'sdraw-a')
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('reports native conflicts without retrying the mutation', async () => {
    mocks.call.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Drawing changed since inspection' }] })
    expect(await run(`sdraw apply --json '{"sheetId":"s","expectedRevision":1,"updates":[]}'`)).toMatchObject({
      code: 1,
      output: expect.stringContaining('Drawing changed'),
    })
    expect(mocks.call).toHaveBeenCalledOnce()
  })

  it('saves PNG captures into the same file session and directs the agent to view them', async () => {
    mocks.call.mockResolvedValue({ image: btoa('PNG'), mediaType: 'image/png' })
    const result = await run(`sdraw view --json '{"scope":"elements","ids":["api"]}' --out preview.png`)
    expect(result.code).toBe(0)
    expect(JSON.parse(result.output)).toMatchObject({ path: '/home/user/preview.png', next: expect.stringContaining('view_image') })
    expect(mocks.put).toHaveBeenCalledWith('preview.png', expect.any(Blob), undefined, 'sdraw-a')
    expect(await mocks.put.mock.calls[0][1].text()).toBe('PNG')
  })

  it('rejects conflicting options, invalid JSON, large requests and ambiguous output before acting', async () => {
    for (const command of [
      `sdraw create --json '{}' --request a.json`,
      `sdraw create --json '[]'`,
      `sdraw create --json '{'`,
      'sdraw view --out ../preview.png',
      'sdraw create --out a.png',
      `sdraw read --json '{}' --json '{}'`,
      'sdraw create --unknown foo',
    ])
      expect((await run(command)).code).toBe(1)
    mocks.read.mockResolvedValue(new Uint8Array(1_000_001))
    expect((await run('sdraw create --request large.json')).code).toBe(1)
    expect(mocks.call).not.toHaveBeenCalled()
  })

  it('blocks commands after file changes or cancellation, including a change while reading a request', async () => {
    mocks.fileId = 'b'
    expect((await run('sdraw status')).code).toBe(1)
    mocks.fileId = 'a'
    mocks.read.mockImplementation(async () => {
      mocks.fileId = 'b'
      return new TextEncoder().encode('{}')
    })
    expect((await run('sdraw create --request request.json')).code).toBe(1)
    const controller = new AbortController()
    controller.abort()
    expect((await run('sdraw status', controller.signal)).code).toBe(1)
    expect(mocks.call).not.toHaveBeenCalled()
  })
})
