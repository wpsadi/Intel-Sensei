import { RssIcon } from 'lucide-react'
import { type BlockDefinition, database } from '../../insert'

/** Feed view block for the "/" and "+" menus. */
export const FeedViewBlock: BlockDefinition = {
  group: 'Database',
  key: 'db-feed',
  title: 'Feed view',
  icon: <RssIcon className="size-4" />,
  keywords: ['database'],
  run: database('feed'),
}
