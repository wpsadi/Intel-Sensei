import { LightbulbIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Callout block for the "/" and "+" menus. */
export const CalloutBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'callout',
  title: 'Callout',
  icon: <LightbulbIcon className="size-4" />,
  run: (e, r) =>
    chain(e, r)
      .insertContent({ type: 'callout', content: [{ type: 'paragraph' }] })
      .run(),
}
