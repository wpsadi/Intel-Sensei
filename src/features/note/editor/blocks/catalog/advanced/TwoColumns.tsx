import { Columns2Icon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'
import { columnsContent } from '../../../nodes/layout'

/** 2 columns block for the "/" and "+" menus. */
export const TwoColumnsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'col2',
  title: '2 columns',
  icon: <Columns2Icon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(columnsContent(2)).run(),
}
