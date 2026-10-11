import { Columns4Icon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'
import { columnsContent } from '../../../nodes/layout'

/** 4 columns block for the "/" and "+" menus. */
export const FourColumnsBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'col4',
  title: '4 columns',
  icon: <Columns4Icon className="size-4" />,
  run: (e, r) => chain(e, r).insertContent(columnsContent(4)).run(),
}
