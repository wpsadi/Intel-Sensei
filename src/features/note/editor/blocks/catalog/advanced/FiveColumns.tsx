import { Columns3CogIcon } from 'lucide-react'

import { columnsContent } from '../../../nodes/layout'
import { type BlockDefinition, chain } from '../../insert'

/** 5 columns block for the "/" and "+" menus. */
export const FiveColumnsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'col5',
  title: '5 columns',
  icon: <Columns3CogIcon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(columnsContent(5)).run(),
}
