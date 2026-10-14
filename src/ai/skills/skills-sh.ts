import { FIRECRAWL_KEY } from '@/ai/utils/firecrawl-key'

import { parseSkillMarkdown } from './format'

/**
 * skills.sh, the directory of skills. Search goes through Firecrawl when a key is saved in Settings (its servers have no CORS
 * limit), and straight to skills.sh over plain HTTP otherwise. A skill's SKILL.md comes from GitHub. No skills.sh account needed.
 */
const BASE = 'https://skills.sh'
const GITHUB_API = 'https://api.github.com'
const GITHUB_RAW = 'https://raw.githubusercontent.com'
/** The most characters of a skill that are kept. */
export const SKILL_MAX_CHARS = 200_000

export interface RemoteSkill {
  /** `owner/repo/skill` */
  id: string
  /** `owner/repo` */
  source: string
  slug: string
  name: string
  installs: number
}

export class SkillsShError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SkillsShError'
    this.status = status
  }
}

async function getJson(url: string, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new SkillsShError('skills.sh could not be reached')
  }
  if (response.status === 429) throw new SkillsShError('skills.sh is rate limiting requests: try again in a minute', 429)
  if (!response.ok) throw new SkillsShError(`skills.sh answered ${response.status}`, response.status)
  return response.json().catch(() => {
    throw new SkillsShError('skills.sh sent something that is not JSON')
  })
}

type Raw = { id?: string; source?: string; slug?: string; skillId?: string; name?: string; installs?: number }

const normalize = (raw: Raw): RemoteSkill | null => {
  const slug = raw.slug ?? raw.skillId ?? raw.id?.split('/').at(-1)
  const source = raw.source ?? raw.id?.split('/').slice(0, 2).join('/')
  if (!slug || !source) return null
  return { id: raw.id ?? `${source}/${slug}`, source, slug, name: raw.name ?? slug, installs: raw.installs ?? 0 }
}

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, skillId: { type: 'string' }, name: { type: 'string' }, source: { type: 'string' }, installs: { type: 'number' } },
      },
    },
  },
}

/** The search answer read by Firecrawl, which fetches skills.sh from its own servers. */
async function searchViaFirecrawl(url: string, apiKey: string, signal?: AbortSignal): Promise<Raw[]> {
  let response: Response
  try {
    response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: [{ type: 'json', schema: SEARCH_SCHEMA }] }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new SkillsShError('Firecrawl could not be reached')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) throw new SkillsShError(body?.error ?? `Firecrawl answered ${response.status}`, response.status)
  return (body.data?.json as { skills?: Raw[] } | undefined)?.skills ?? []
}

/** Searches skills.sh: through Firecrawl when a key is saved, directly over HTTP when not. */
export async function searchSkillsSh(query: string, options: { limit?: number; signal?: AbortSignal } = {}) {
  const { limit = 10, signal } = options
  if (query.trim().length < 2) return []
  const url = `${BASE}/api/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`
  const apiKey = FIRECRAWL_KEY.value
  const list = apiKey ? await searchViaFirecrawl(url, apiKey, signal) : (((await getJson(url, signal)) as { skills?: Raw[] }).skills ?? [])
  return list.map(normalize).filter((skill): skill is RemoteSkill => !!skill)
}

/** Whether a skills.sh id looks like `owner/repo/skill`. */
export const isRemoteId = (value: string) => /^[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(value)

/** The SKILL.md of a GitHub repository's skill: the repository's file list, then the file itself. */
async function fromGitHub(source: string, slug: string, signal?: AbortSignal) {
  const tree = (await getJson(`${GITHUB_API}/repos/${source}/git/trees/HEAD?recursive=1`, signal).catch(() => null)) as {
    tree?: { path: string; type: string }[]
  } | null
  const files = (tree?.tree ?? []).filter((entry) => entry.type === 'blob' && /(^|\/)SKILL\.md$/i.test(entry.path))
  // The skill's folder is named after it; a repository with one skill at its root has no folder to match.
  const ordered = [
    ...files.filter((f) => f.path.split('/').at(-2) === slug),
    ...files.filter((f) => f.path.split('/').at(-2) !== slug),
  ].slice(0, 8)
  for (const file of ordered) {
    const response = await fetch(`${GITHUB_RAW}/${source}/HEAD/${file.path}`, { signal }).catch(() => null)
    if (!response?.ok) continue
    const text = (await response.text()).slice(0, SKILL_MAX_CHARS)
    const parsed = parseSkillMarkdown(text)
    if (file.path.split('/').at(-2) === slug || parsed.name === slug) return text
  }
  throw new SkillsShError(`Could not find the skill "${slug}" in ${source}`)
}

/** The SKILL.md text of a skill, read from its GitHub repository. */
export const fetchSkillMarkdown = (id: string, options: { signal?: AbortSignal } = {}) => {
  const [owner, repo, ...rest] = id.split('/')
  return fromGitHub(`${owner}/${repo}`, rest.join('/'), options.signal)
}
