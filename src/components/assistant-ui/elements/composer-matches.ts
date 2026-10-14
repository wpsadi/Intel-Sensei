import { useMemo } from 'react'

import type { ComposerCommand, ComposerPerson } from '@/components/assistant-ui/elements/composer'

/** Commands whose name starts with the slash query, or none when not typing one. */
export function useSlashMatches(value: string, commands: readonly ComposerCommand[] | undefined): ComposerCommand[] {
  return useMemo(() => {
    if (!commands || !value.startsWith('/')) return []
    const query = value.slice(1).toLowerCase()
    return commands.filter((command) => command.name.startsWith(query))
  }, [commands, value])
}

/** People matching a trailing @mention, or none when the caret is not in one. */
export function useMentionMatches(value: string, people: readonly ComposerPerson[] | undefined): ComposerPerson[] {
  return useMemo(() => {
    if (!people) return []
    const match = /@([\w]*)$/.exec(value)
    if (!match) return []
    const query = match[1]?.toLowerCase() ?? ''
    return people.filter((person) => person.name.toLowerCase().startsWith(query))
  }, [people, value])
}

/** Replaces the trailing @mention with the chosen name. */
export function applyMention(value: string, name: string): string {
  return value.replace(/@[\w]*$/, `@${name} `)
}
