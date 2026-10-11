import { FaGithub } from 'react-icons/fa6'
import { type BlockDefinition, block } from '../../insert'

/** GitHub Gist block for the "/" and "+" menus. */
export const GithubGistBlock: BlockDefinition = {
  group: 'Media',
  key: 'gist',
  title: 'GitHub Gist',
  icon: <FaGithub className="size-4" />,
  keywords: ['github'],
  run: block('embed', { kind: 'gist' }),
}
