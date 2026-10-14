import { Columns4Icon } from 'lucide-react'

import { columnsContent } from '../../../nodes/layout'
import { type BlockDefinition, chain } from '../../insert'

/** 4 columns block for the "/" and "+" menus. */
export const FourColumnsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'col4',
  title: '4 columns',
  icon: <Columns4Icon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(columnsContent(4)).run(),
}
