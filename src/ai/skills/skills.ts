import { useEffect, useSyncExternalStore } from 'react'

import { keywordSearch } from '@/ai/memory/search'
import type { MemoryHit } from '@/ai/memory/types'
import { indexText, searchByMeaning } from '@/ai/memory/vector/meaning'
import { vectorIndex } from '@/ai/memory/vector/vector-client'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'

import { type Skill, type SkillSource, skillsStore } from './db'
import { nameProblem, parseSkillMarkdown, slugify } from './format'
import { fetchSkillMarkdown } from './skills-sh'

export type { Skill, SkillSource } from './db'

const listeners = new Set<() => void>()
let cache: Skill[] = []
let loaded: Promise<void> | null = null
const notify = () => listeners.forEach((listener) => listener())

/** Versions of capabilities that have an embedding in pgvector in this tab. */
const indexed = new Map<string, number>()
let indexing = Promise.resolve()
/** Deletions in flight when a skill is replaced. Searches wait for these so a
 * stale vector cannot win a race with the replacement's embedding. */
const pendingReindex = new Map<string, Promise<void>>()

const capabilityText = (skill: Skill) => `${skill.name}: ${skill.description}\n${skill.body}`

/**
 * Skills can be installed before the user adds an embedding key. Once a key
 * exists, fill those gaps lazily as the catalogue is read. This is deliberately
 * best effort: keyword search remains available when the provider is offline.
 */
async function ensureCapabilityEmbeddings(skills: Skill[]) {
  if (!GEMINI_KEY.value) return
  // A save removes the old vector before it can be indexed again. Wait for any
  // such deletion that belongs to this batch before checking vectorIndex.has.
  await Promise.all(skills.map((skill) => pendingReindex.get(skill.name)).filter((task): task is Promise<void> => !!task))
  // Serialize backfills. The missing set is computed inside the queue so a
  // catalogue load and a search cannot embed the same skill twice.
  indexing = indexing.then(async () => {
    if (!GEMINI_KEY.value) return
    const missing = skills.filter((skill) => indexed.get(skill.name) !== skill.updatedAt)
    for (const skill of missing) {
      try {
        // A skill can be removed or replaced while a provider request is
        // queued. Never recreate an embedding for an obsolete catalogue item.
        const current = cache.find((item) => item.name === skill.name)
        if (!current || current.updatedAt !== skill.updatedAt || current.body !== skill.body || current.description !== skill.description)
          continue
        // Embeddings are persisted in PGlite, so a reload should only create
        // vectors for new or edited skills.
        if (await vectorIndex.has('capability', skill.name)) {
          indexed.set(skill.name, skill.updatedAt)
          continue
        }
        if (await indexText('capability', skill.name, capabilityText(skill))) indexed.set(skill.name, skill.updatedAt)
      } catch {
        // A missing/invalid key or a transient provider error must not hide skills.
      }
    }
  })
  await indexing
}

export type SkillSearchHit = MemoryHit<Skill>

/**
 * The skills every app shares. Skills live in the browser's database, so
 * a skill saved in Ask Sensei is there in S-Note, S-3D and S-Design too.
 */
export class Skills {
  /** Every skill, by name. */
  static async list(): Promise<Skill[]> {
    loaded ??= skillsStore.list().then((all) => {
      cache = all.sort((a, b) => a.name.localeCompare(b.name))
      notify()
    })
    await loaded
    // The cache, not what the first read returned: skills saved or removed since are in it.
    // Do not hold up catalogue rendering while embeddings are generated. Search
    // awaits the same work when it needs semantic results.
    void ensureCapabilityEmbeddings(cache)
    return cache
  }

  /** The skills already loaded, for places that cannot wait (a menu that opens as `/` is typed). */
  static snapshot(): Skill[] {
    return cache
  }

  static subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }

  static async get(name: string): Promise<Skill | undefined> {
    await Skills.list()
    return cache.find((skill) => skill.name === name)
  }

  /** Skills whose name or description has every word of the query. */
  static async search(query: string): Promise<Skill[]> {
    return (await Skills.searchMeaning(query)).map((hit) => hit.item)
  }

  /**
   * Searches installed capabilities by meaning when vectors are available,
   * then falls back to keyword matching. Scores are cosine similarity for
   * embeddings and term coverage for the fallback.
   */
  static async searchMeaning(query: string, limit = 8): Promise<SkillSearchHit[]> {
    const skills = await Skills.list()
    if (!skills.length || !query.trim() || limit <= 0) return []
    await ensureCapabilityEmbeddings(skills)
    return searchByMeaning({
      kind: 'capability',
      query,
      limit,
      load: async (name) => skills.find((skill) => skill.name === name),
      fallback: async () => keywordSearch(skills, capabilityText, query, limit),
    })
  }

  /** Saves a skill, replacing one with the same name. Throws a readable message when the name or the text is not usable. */
  static async save(input: { name: string; description: string; body: string; source: SkillSource; origin?: string }): Promise<Skill> {
    const name = slugify(input.name)
    const problem = nameProblem(name)
    if (problem) throw new Error(problem)
    if (!input.body.trim()) throw new Error('A skill needs instructions.')
    const existing = await Skills.get(name)
    // A skill the user wrote or installed is not replaced by one Sensei makes up, or by a skills.sh one with the same name.
    if (existing && existing.source !== input.source && input.source !== 'user')
      throw new Error(
        `A skill named "${name}" already exists (${existing.source === 'user' ? 'yours' : existing.source}). Choose another name.`,
      )
    const now = Date.now()
    const skill: Skill = {
      name,
      description:
        input.description.trim() ||
        input.body
          .trim()
          .split('\n')[0]
          .replace(/^#+\s*/, '')
          .slice(0, 160),
      body: input.body.trim(),
      source: input.source,
      origin: input.origin,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
    }
    await skillsStore.put(skill)
    cache = [...cache.filter((s) => s.name !== name), skill].sort((a, b) => a.name.localeCompare(b.name))
    indexed.delete(name)
    // Remove an older vector before the lazy re-index. Otherwise a saved skill
    // with the same name could be mistaken for an already indexed item after a
    // key is added later. This is intentionally best effort and asynchronous.
    // Remove and re-index in order. A save should not wait on either the
    // database or provider request; semantic search awaits the queue when it
    // needs a complete index.
    const removal = vectorIndex.remove('capability', name).catch(() => {})
    pendingReindex.set(name, removal)
    void removal
      .then(() => ensureCapabilityEmbeddings([skill]))
      .finally(() => {
        if (pendingReindex.get(name) === removal) pendingReindex.delete(name)
      })
    notify()
    return skill
  }

  /** Saves a pasted SKILL.md. The name comes from its front matter, or from `fallbackName`. */
  static saveMarkdown(text: string, source: SkillSource, options: { fallbackName?: string; origin?: string } = {}) {
    const parsed = parseSkillMarkdown(text)
    const name = parsed.name ?? options.fallbackName
    if (!name) throw new Error('The skill has no name. Add "name: my-skill" to its front matter, or fill in the name.')
    return Skills.save({ name, description: parsed.description ?? '', body: parsed.body, source, origin: options.origin })
  }

  static async remove(name: string) {
    await skillsStore.remove(name)
    indexed.delete(name)
    // Vector cleanup is best effort and should not make removing a local skill
    // wait for a cold PGlite worker. A stale vector cannot resolve because the
    // loader below no longer finds its skill.
    void vectorIndex.remove('capability', name).catch(() => {})
    cache = cache.filter((skill) => skill.name !== name)
    notify()
  }

  /** Downloads a skill from skills.sh (`owner/repo/skill`) and saves it. */
  static async install(id: string, signal?: AbortSignal): Promise<Skill> {
    const markdown = await fetchSkillMarkdown(id, { signal })
    return Skills.saveMarkdown(markdown, 'skills.sh', { fallbackName: id.split('/').at(-1), origin: id })
  }
}

/** The installed skills, kept up to date as they change. */
export function useInstalledSkills() {
  // Menus read the skills as the snapshot, so they are loaded the first time anything shows them.
  useEffect(() => void Skills.list(), [])
  return useSyncExternalStore(Skills.subscribe, Skills.snapshot)
}
