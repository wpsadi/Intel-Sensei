import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySkillCommand, skillContextFor } from './invoke'
import { Skills } from './skills'
import { createSkillTools, skillsPrompt } from './tools'

const ctx = { abortSignal: undefined, toolCallId: 't', messages: [] } as never
type Tools = ReturnType<typeof createSkillTools>
const run = <K extends keyof Tools>(tools: Tools, name: K, input: unknown) =>
  (tools[name].execute as (i: unknown, c: unknown) => Promise<string>)(input, ctx)

beforeEach(async () => {
  for (const skill of await Skills.list()) await Skills.remove(skill.name)
})
afterEach(() => vi.unstubAllGlobals())

describe('saving and finding skills', () => {
  it('saves, lists, searches and removes', async () => {
    await Skills.save({ name: 'Weekly Report', description: 'Summarise the week', body: '1. Gather', source: 'user' })
    expect((await Skills.list()).map((s) => s.name)).toEqual(['weekly-report'])
    expect((await Skills.search('summarise week')).length).toBe(1)
    expect(await Skills.search('nothing here')).toEqual([])
    await Skills.remove('weekly-report')
    expect(await Skills.list()).toEqual([])
  })

  it('saves a pasted SKILL.md and refuses a name that is a command', async () => {
    const skill = await Skills.saveMarkdown('---\nname: pdf\ndescription: Work with PDFs\n---\nUse pdftotext', 'user')
    expect(skill).toMatchObject({ name: 'pdf', description: 'Work with PDFs', body: 'Use pdftotext' })
    await expect(Skills.save({ name: 'goal', description: '', body: 'x', source: 'user' })).rejects.toThrow(/already a command/)
    expect(() => Skills.saveMarkdown('no name here', 'user')).toThrow(/no name/)
  })

  it("does not let Sensei overwrite the user's own skill", async () => {
    await Skills.save({ name: 'mine', description: 'a', body: 'original', source: 'user' })
    await expect(Skills.save({ name: 'mine', description: 'b', body: 'changed', source: 'agent' })).rejects.toThrow(/already exists/)
    expect((await Skills.get('mine'))?.body).toBe('original')
  })
})

describe('/skill-name messages', () => {
  it('puts the skill in front of the request, and leaves other messages alone', async () => {
    await Skills.save({ name: 'pdf', description: 'Work with PDFs', body: 'Use pdftotext first', source: 'user' })
    const text = await applySkillCommand('/pdf summarise the guide')
    expect(text).toContain('Use pdftotext first')
    expect(text).toContain('User request: summarise the guide')
    expect(await applySkillCommand('/unknown thing')).toBe('/unknown thing')
    expect(await applySkillCommand('plain message')).toBe('plain message')
    expect(await skillContextFor('/pdf x')).toContain('Use pdftotext first')
    expect(await skillContextFor('hello')).toBeUndefined()
  })
})

describe('the skill tools', () => {
  it('create_skill saves a skill the user can then run, and the prompt lists it', async () => {
    const tools = createSkillTools()
    expect(
      await run(tools, 'create_skill', { name: 'standup', description: 'Write a standup', instructions: 'Yesterday, today, blockers' }),
    ).toMatch(/\/standup/)
    expect(await skillsPrompt()).toContain('- standup: Write a standup')
    expect(await run(tools, 'use_skill', { name: '/standup' })).toContain('Yesterday, today, blockers')
  })

  it('lookup_capability returns matching instructions and strips the wiu marker', async () => {
    await Skills.save({
      name: 'excel-workbook',
      description: 'Create and edit Excel workbooks',
      body: 'Use pandas and openpyxl.',
      source: 'user',
    })
    const out = await run(createSkillTools(), 'lookup_capability', { query: 'wiu Excel workbook' })
    expect(out).toContain('excel-workbook')
    expect(out).toContain('Use pandas and openpyxl.')
  })

  it('lookup_capability exposes the built-in LaTeX workflow', async () => {
    const out = await run(createSkillTools(), 'lookup_capability', { query: 'wiu SwiftLaTeX terminal' })
    expect(out).toContain('terminal-latex')
    expect(out).toContain('latex --check')
    expect(out).toContain('SwiftLaTeX compiler')
  })

  it('find_skill lists skills.sh results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ skills: [{ id: 'a/b/react', source: 'a/b', skillId: 'react', name: 'react', installs: 1200 }] })),
    )
    const out = await run(createSkillTools(), 'find_skill', { query: 'react' })
    expect(out).toContain('a/b/react (1,200 installs)')
  })

  it('find_skill still answers with installed skills when skills.sh cannot be reached', async () => {
    await Skills.save({ name: 'pdf-helper', description: 'pdf tricks', body: 'b', source: 'user' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network'))),
    )
    const out = await run(createSkillTools(), 'find_skill', { query: 'pdf' })
    expect(out).toContain('[installed] pdf-helper')
    expect(out).toContain('could not be reached')
  })

  it('use_skill installs a skills.sh skill the first time and loads it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/git/trees/')
          ? Response.json({ tree: [{ path: 'skills/react/SKILL.md', type: 'blob' }] })
          : new Response('---\nname: react\ndescription: React tips\n---\nPrefer hooks'),
      ),
    )
    const out = await run(createSkillTools(), 'use_skill', { name: 'a/b/react' })
    expect(out).toContain('Saved as /react')
    expect(out).toContain('Prefer hooks')
    expect(await Skills.get('react')).toMatchObject({ source: 'skills.sh', origin: 'a/b/react' })
    // Loaded again by its skills.sh id: nothing is fetched.
    ;(fetch as ReturnType<typeof vi.fn>).mockClear()
    expect(await run(createSkillTools(), 'use_skill', { name: 'a/b/react' })).toContain('Prefer hooks')
    expect(fetch).not.toHaveBeenCalled()
  })
})
