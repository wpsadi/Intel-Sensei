import { Extension } from '@tiptap/core'
import { type MenuItem, rankMatches, renderSuggestion, runMenuItem } from './suggestion-menu'
import { BLOCKS } from './blocks/registry'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'

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
