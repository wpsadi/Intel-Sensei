import { LinkIcon } from 'lucide-react'
import { type BlockDefinition, block } from '../../insert'

/** Linked view of data source block for the "/" and "+" menus. */
export const LinkedViewOfDataSourceBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-linked',
  title: 'Linked view of data source',
  icon: <LinkIcon className="size-4" />,
  run: block('databaseBlock'),
}
