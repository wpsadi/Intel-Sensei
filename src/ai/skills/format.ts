/** A skill as the Agent Skills format writes it: a SKILL.md with `name` and `description` in its front matter, then instructions. */
export interface ParsedSkill {
  name?: string
  description?: string
  body: string
}

/** Names that already mean something in a chat box. */
const RESERVED = new Set(['goal'])

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A name as `/name` can be typed: lowercase letters, digits and dashes. */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
}

/** The reason a name cannot be used, or null. */
export function nameProblem(name: string) {
  if (!NAME_PATTERN.test(name)) return 'Use lowercase letters, digits and dashes, up to 64 characters (for example "code-review").'
  if (RESERVED.has(name)) return `"/${name}" is already a command.`
  return null
}

/** Cleans one front matter value: quotes off. */
const unquote = (value: string) => value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')

/** Reads a SKILL.md. Without front matter the whole text is the body. */
export function parseSkillMarkdown(text: string): ParsedSkill {
  const source = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source)
  if (!match) return { body: source.trim() }
  const fields: Record<string, string> = {}
  const lines = match[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const field = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i])
    if (!field) continue
    const [, key, rest] = field
    // `>` and `|` start a block of indented lines; a plain value may also continue on indented lines.
    if (/^[>|][+-]?$/.test(rest.trim()) || rest.trim() === '') {
      const folded = rest.trim().startsWith('>')
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].trim())
      fields[key] = block
        .filter((line, index, all) => line || index < all.length - 1)
        .join(folded ? ' ' : '\n')
        .trim()
    } else {
      let value = unquote(rest)
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) value += ` ${lines[++i].trim()}`
      fields[key] = value
    }
  }
  return { name: fields.name, description: fields.description, body: source.slice(match[0].length).trim() }
}

/** A skill written back as a SKILL.md, so it can be copied out and used anywhere. */
export function toSkillMarkdown(skill: { name: string; description: string; body: string }) {
  const description = skill.description.replace(/\s+/g, ' ').trim()
  const quoted = /[:#"'\n]/.test(description) ? JSON.stringify(description) : description
  return `---\nname: ${skill.name}\ndescription: ${quoted}\n---\n\n${skill.body.trim()}\n`
}

/** `/code-review fix the login` → the name and the rest of the message, or null when the text is not a slash command. */
export function parseSlashCommand(text: string) {
  const match = /^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return match ? { name: match[1], rest: (match[2] ?? '').trim() } : null
}
