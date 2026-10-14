import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'

import type { MenuHandle, MenuItem } from './menu-items'
import { SuggestionList } from './MenuList'

/** Shared popup renderer: mounts SuggestionList next to the caret. */
export const renderSuggestion: SuggestionOptions<MenuItem, MenuItem>['render'] = () => {
  let renderer: ReactRenderer<MenuHandle, SuggestionProps<MenuItem, MenuItem>> | null = null
  let host: HTMLDivElement | null = null
  // Escape hides the menu for the rest of this suggestion; keys then go back to the editor.
  let dismissed = false

  const place = (props: SuggestionProps<MenuItem, MenuItem>) => {
    const rect = props.clientRect?.()
    if (!rect || !host) return
    const below = rect.bottom + 320 < window.innerHeight
    host.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
    host.style.top = below ? `${rect.bottom + 6}px` : ''
    host.style.bottom = below ? '' : `${window.innerHeight - rect.top + 6}px`
  }

  return {
    onStart(props) {
      dismissed = false
      renderer = new ReactRenderer(SuggestionList, { props, editor: props.editor })
      host = document.createElement('div')
      host.className = 'fixed z-50'
      host.appendChild(renderer.element)
      document.body.appendChild(host)
      place(props)
    },
    onUpdate(props) {
      renderer?.updateProps(props)
      place(props)
    },
    onKeyDown({ event }) {
      if (dismissed) return false
      if (event.key === 'Escape') {
        dismissed = true
        host?.remove()
        return true
      }
      return renderer?.ref?.onKeyDown(event) ?? false
    },
    onExit() {
      renderer?.destroy()
      host?.remove()
      renderer = null
      host = null
    },
  }
}

export const runMenuItem: SuggestionOptions<MenuItem, MenuItem>['command'] = ({ editor, range, props }) => props.run(editor, range)
