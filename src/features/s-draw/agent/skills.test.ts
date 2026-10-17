import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  apply: vi.fn().mockResolvedValue('Expanded installed skill'),
  load: vi.fn().mockResolvedValue('Loaded installed skill'),
  search: vi.fn().mockResolvedValue('[installed] review: Review a design'),
}))
vi.mock('@/ai/skills/invoke', () => ({ applySkillCommand: shared.apply }))
vi.mock('@/ai/skills/tools', () => ({
  createSkillTools: () => ({
    use_skill: { description: 'Load an installed skill.', execute: shared.load },
    find_skill: { description: 'Search skills.', execute: shared.search },
  }),
}))

import { DEFAULT_DRAW_SKILLS, expandDefaultDrawSkill } from './default-skills'
import { applyDrawSkillCommand, createDrawSkillTools } from './skills'

beforeEach(() => vi.clearAllMocks())
const options = { toolCallId: 'test', messages: [], context: {} }

describe('default SDraw skills', () => {
  it('ships valid, uniquely named skills with the drawing and large-scene workflows', () => {
    const names = DEFAULT_DRAW_SKILLS.map((skill) => skill.name)
    expect(names).toEqual(['excalidraw-diagram', 'sdraw-large-drawing'])
    expect(new Set(names).size).toBe(names.length)
    for (const skill of DEFAULT_DRAW_SKILLS) {
      expect(skill.description).toBeTruthy()
      expect(skill.body).toBeTruthy()
    }
  })

  it('expands a default command locally and preserves its request', async () => {
    const result = await applyDrawSkillCommand('/excalidraw-diagram explain auth\nInclude a failure path')
    expect(result).toContain('User request: explain auth\nInclude a failure path')
    expect(result).toContain(DEFAULT_DRAW_SKILLS[0].body)
    expect(shared.apply).not.toHaveBeenCalled()
  })

  it('retains installed and ordinary request handling', async () => {
    expect(expandDefaultDrawSkill('What is a diagram?')).toBeUndefined()
    await applyDrawSkillCommand('/my-installed-skill test')
    expect(shared.apply).toHaveBeenCalledWith('/my-installed-skill test')
  })

  it('loads defaults through use_skill without accessing the installed-skill store', async () => {
    const tools = createDrawSkillTools()
    const result = await tools.use_skill.execute!({ name: '/excalidraw-diagram' }, options)
    expect(result).toContain(DEFAULT_DRAW_SKILLS[0].body)
    expect(shared.load).not.toHaveBeenCalled()
  })

  it('keeps use_skill working for installed skills', async () => {
    await createDrawSkillTools().use_skill.execute!({ name: 'my-skill' }, options)
    expect(shared.load).toHaveBeenCalledWith({ name: 'my-skill' }, options)
  })

  it('searches bundled and installed skills together', async () => {
    const result = await createDrawSkillTools().find_skill.execute!({ query: 'diagram' }, options)
    expect(result).toContain('[SDraw default] excalidraw-diagram')
    expect(result).toContain('[installed] review')
  })
})
