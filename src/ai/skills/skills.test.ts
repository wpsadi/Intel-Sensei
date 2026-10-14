import { afterEach, describe, expect, it, vi } from 'vitest'

import { FIRECRAWL_KEY } from '@/ai/utils/firecrawl-key'

import { nameProblem, parseSkillMarkdown, parseSlashCommand, slugify, toSkillMarkdown } from './format'
import { fetchSkillMarkdown, isRemoteId, searchSkillsSh } from './skills-sh'

describe('SKILL.md', () => {
  it('reads front matter and the instructions after it', () => {
    const parsed = parseSkillMarkdown('---\nname: code-review\ndescription: "Review a diff: bugs first"\n---\n\n# Steps\n1. Read it\n')
    expect(parsed).toEqual({ name: 'code-review', description: 'Review a diff: bugs first', body: '# Steps\n1. Read it' })
  })

  it('reads a folded description over several lines', () => {
    const parsed = parseSkillMarkdown('---\nname: pdf\ndescription: >\n  Work with PDFs.\n  Use for forms.\n---\nBody')
    expect(parsed.description).toBe('Work with PDFs. Use for forms.')
    expect(parsed.body).toBe('Body')
  })

  it('takes the whole text as instructions when there is no front matter', () => {
    expect(parseSkillMarkdown('Just do it\nwell')).toEqual({ body: 'Just do it\nwell' })
  })

  it('round-trips through toSkillMarkdown', () => {
    const text = toSkillMarkdown({ name: 'weekly-report', description: 'Summarise: the week', body: 'Step one' })
    expect(parseSkillMarkdown(text)).toEqual({ name: 'weekly-report', description: 'Summarise: the week', body: 'Step one' })
  })
})

describe('names and slash commands', () => {
  it('makes a typeable name', () => {
    expect(slugify('Weekly Report!')).toBe('weekly-report')
    expect(slugify('  --A  B--  ')).toBe('a-b')
  })

  it('rejects names that cannot be typed or are taken by a command', () => {
    expect(nameProblem('weekly-report')).toBeNull()
    expect(nameProblem('Weekly')).toMatch(/lowercase/)
    expect(nameProblem('goal')).toMatch(/already a command/)
  })

  it('splits a slash message into the name and the request', () => {
    expect(parseSlashCommand('/pdf fix the form')).toEqual({ name: 'pdf', rest: 'fix the form' })
    expect(parseSlashCommand('/pdf')).toEqual({ name: 'pdf', rest: '' })
    expect(parseSlashCommand('hello /pdf')).toBeNull()
    expect(parseSlashCommand('/Not A Skill')).toBeNull()
  })
})

describe('skills.sh', () => {
  afterEach(() => vi.unstubAllGlobals())

  const respond = (routes: Record<string, unknown>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const hit = Object.keys(routes).find((key) => url.includes(key))
        if (!hit) return new Response('', { status: 404 })
        const value = routes[hit]
        if (value instanceof Response) return value
        return typeof value === 'string'
          ? new Response(value)
          : Response.json({ ...(value as object), _auth: (init?.headers as Record<string, string> | undefined)?.authorization })
      }),
    )

  it('searches the open endpoint', async () => {
    respond({ '/api/search': { skills: [{ id: 'x/y/react', source: 'x/y', skillId: 'react', name: 'react', installs: 9 }] } })
    expect((await searchSkillsSh('react'))[0]).toMatchObject({ id: 'x/y/react', slug: 'react', source: 'x/y' })
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('https://skills.sh/api/search?q=react')
  })

  it('searches through Firecrawl when a key is saved', async () => {
    FIRECRAWL_KEY.value = 'fc-key'
    try {
      respond({ 'api.firecrawl.dev/v2/scrape': { success: true, data: { json: { skills: [{ id: 'x/y/df', source: 'x/y', skillId: 'df', name: 'df', installs: 3 }] } } } })
      expect((await searchSkillsSh('df'))[0]).toMatchObject({ id: 'x/y/df', slug: 'df' })
      const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(url).toBe('https://api.firecrawl.dev/v2/scrape')
      expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer fc-key' })
      expect(JSON.parse((init as RequestInit).body as string).url).toBe('https://skills.sh/api/search?q=df&limit=10')
    } finally {
      FIRECRAWL_KEY.value = ''
    }
  })

  it('reads a skill from GitHub', async () => {
    respond({
      '/git/trees/HEAD': {
        tree: [
          { path: 'skills/other/SKILL.md', type: 'blob' },
          { path: 'skills/pdf/SKILL.md', type: 'blob' },
        ],
      },
      'raw.githubusercontent.com/a/b/HEAD/skills/pdf/SKILL.md': '---\nname: pdf\n---\nFrom GitHub',
    })
    expect(await fetchSkillMarkdown('a/b/pdf')).toContain('From GitHub')
  })

  it('knows an id from a name', () => {
    expect(isRemoteId('vercel-labs/skills/find-skills')).toBe(true)
    expect(isRemoteId('find-skills')).toBe(false)
  })
})
