import { SmileIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** Emoji block for the "/" and "+" menus. */
export const EmojiBlock: BlockDefinition = {
  group: 'Inline',
  key: 'emoji',
  title: 'Emoji',
  icon: <SmileIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(':').run(),
}
