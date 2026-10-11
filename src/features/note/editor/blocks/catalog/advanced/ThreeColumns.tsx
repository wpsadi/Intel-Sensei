import { Columns3Icon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'
import { columnsContent } from '../../../nodes/layout'

/** 3 columns block for the "/" and "+" menus. */
export const ThreeColumnsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'col3',
  title: '3 columns',
  icon: <Columns3Icon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(columnsContent(3)).run(),
}
