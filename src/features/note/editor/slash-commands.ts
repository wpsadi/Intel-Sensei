import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'

import { BLOCKS } from './blocks/registry'
import { type MenuItem, rankMatches } from './menu-items'
import { renderSuggestion, runMenuItem } from './suggestion-menu'

export { hostPageId } from './blocks/insert'

export const COMMANDS: MenuItem[] = BLOCKS

/** The `/` menu. */
export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuItem, MenuItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        allowSpaces: true,
        startOfLine: false,
        items: ({ query }) => rankMatches(COMMANDS, query),
        render: renderSuggestion,
        command: runMenuItem,
      }),
    ]
  },
})
