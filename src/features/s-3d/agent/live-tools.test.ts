import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  get_document: vi.fn(() => ({ pages: 1 })),
  get_scene: vi.fn(() => ({ objects: 2 })),
  list_pages: vi.fn(() => []),
}))
vi.mock('./tools-impl', () => ({
  impl: mocks,
  DESCRIPTIONS: { get_document: 'doc', get_scene: 'scene', list_pages: 'pages' },
  schemas: { get_document: z.object({}), get_scene: z.object({ sceneId: z.string() }), list_pages: z.object({}) },
}))

import { createS3dLiveTools } from './live-tools'

describe('S3D live tools', () => {
  it('offers only tools that read the design', () => {
    expect(Object.keys(createS3dLiveTools()).sort()).toEqual(['get_document', 'get_scene', 'list_pages'])
  })

  it('runs the same handler as the text agent, when the call asks for it', async () => {
    const tools = createS3dLiveTools()
    const options = { toolCallId: 't', messages: [], context: {} }
    expect(await tools.get_scene.execute!({ sceneId: 's1' } as never, options)).toEqual({ objects: 2 })
    expect(mocks.get_scene).toHaveBeenCalledWith({ sceneId: 's1' })
    expect(mocks.get_document).not.toHaveBeenCalled()
  })
})
