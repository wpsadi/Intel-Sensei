import { PanelTopIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'
import { tabsContent } from '../../../nodes/layout'

/** Tabs block for the "/" and "+" menus. */
export const TabsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'tabs',
  title: 'Tabs',
  icon: <PanelTopIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(tabsContent()).run(),
}
