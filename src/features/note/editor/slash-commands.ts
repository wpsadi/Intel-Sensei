import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'

import { isMobileViewport } from '@/hooks/use-mobile'

import { BLOCKS } from './blocks/registry'
import { type MenuItem, rankMatches } from './menu-items'
import { renderSuggestion, runMenuItem } from './suggestion-menu'

export { hostPageId } from './blocks/insert'

export const COMMANDS: MenuItem[] = BLOCKS

/** The commands this editor offers: every block except the ones its `SlashCommands` extension excludes (such as sub-pages). */
export function commandsFor(editor: Editor): MenuItem[] {
  const exclude = editor.extensionManager.extensions.find((extension) => extension.name === 'slashCommands')?.options.exclude ?? []
  return COMMANDS.filter((item) => !exclude.includes(item.key))
}

/** The `/` menu. */
export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addOptions() {
    return { exclude: [] as string[] }
  },
  addProseMirrorPlugins() {
    const commands = COMMANDS.filter((item) => !this.options.exclude.includes(item.key))
    return [
      Suggestion<MenuItem, MenuItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        allowSpaces: true,
        startOfLine: false,
        // On a phone the toolbar above the keyboard has the actions, so a typed slash stays a plain character.
        allow: () => !isMobileViewport(),
        items: ({ query }) => rankMatches(commands, query),
        render: renderSuggestion,
        command: runMenuItem,
      }),
    ]
  },
})
