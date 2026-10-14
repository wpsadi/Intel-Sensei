import { useEffect, useSyncExternalStore } from 'react'

import { type Skill, type SkillSource, getSkillsDb } from './db'
import { nameProblem, parseSkillMarkdown, slugify } from './format'
import { fetchSkillMarkdown } from './skills-sh'

export type { Skill, SkillSource } from './db'

const listeners = new Set<() => void>()
let cache: Skill[] = []
let loaded: Promise<void> | null = null
const notify = () => listeners.forEach((listener) => listener())

/**
 * The skills every app shares. Skills live in the browser's database, so
 * a skill saved in Ask Sensei is there in S-Note, S-3D and S-Design too.
 */
export class Skills {
  /** Every skill, by name. */
  static async list(): Promise<Skill[]> {
    loaded ??= getSkillsDb()
      .then((db) => db.getAll('skills'))
      .then((all) => {
        cache = all.sort((a, b) => a.name.localeCompare(b.name))
        notify()
      })
    await loaded
    // The cache, not what the first read returned: skills saved or removed since are in it.
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
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (await Skills.list()).filter((skill) => {
      const text = `${skill.name} ${skill.description}`.toLowerCase()
      return words.every((word) => text.includes(word))
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
    await (await getSkillsDb()).put('skills', skill)
    cache = [...cache.filter((s) => s.name !== name), skill].sort((a, b) => a.name.localeCompare(b.name))
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
    await (await getSkillsDb()).delete('skills', name)
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
