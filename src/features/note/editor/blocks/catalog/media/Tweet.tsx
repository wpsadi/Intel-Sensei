import { FaXTwitter } from 'react-icons/fa6'
import { type BlockDefinition, block } from '../../insert'

/** Tweet block for the "/" and "+" menus. */
export const TweetBlock: BlockDefinition = {
  group: 'Media',
  key: 'tweet',
  title: 'Tweet',
  icon: <FaXTwitter className="size-4" />,
  keywords: ['x', 'twitter', 'post'],
  run: block('embed', { kind: 'tweet' }),
}
