import type { Skill } from '@/ai/skills/skills'
import type { ComposerSuggestion } from '@/components/assistant-ui/elements/suggestion-menu'

const HINT_MAX = 70

/**
 * The skills a `/` can pick, for the menu above a message box: names that start with what is typed first, then names
 * or descriptions that contain it. `onEmpty` makes the row shown when no skill is installed yet (opens the settings).
 */
export function skillSuggestions(skills: readonly Skill[], query: string, onEmpty?: () => void): ComposerSuggestion[] {
  const q = query.toLowerCase()
  if (!skills.length)
    return onEmpty && !q
      ? [{ id: 'no-skills', label: 'No skills yet', hint: 'Add one in Settings → Skills', insert: '', run: onEmpty }]
      : []
  const starts = skills.filter((skill) => skill.name.startsWith(q))
  const contains = skills.filter((skill) => !skill.name.startsWith(q) && `${skill.name} ${skill.description}`.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, 30).map((skill) => ({
    id: `skill-${skill.name}`,
    label: `/${skill.name}`,
    hint: skill.description.length > HINT_MAX ? `${skill.description.slice(0, HINT_MAX - 1)}…` : skill.description,
    insert: `/${skill.name}`,
  }))
}
