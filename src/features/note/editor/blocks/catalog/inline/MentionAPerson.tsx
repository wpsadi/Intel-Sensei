import { AtSignIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Mention a person block for the "/" and "+" menus. */
export const MentionAPersonBlock: BlockDefinition = {
  group: 'Inline',
  key: 'mention-person',
  title: 'Mention a person',
  icon: <AtSignIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent('@').run(),
}
