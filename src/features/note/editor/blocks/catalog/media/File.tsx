import { FileIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** File block for the "/" and "+" menus. */
export const FileBlock: BlockDefinition = {
  group: 'Media',
  key: 'file',
  title: 'File',
  icon: <FileIcon className="size-4" />,
  keywords: ['upload', 'attachment'],
  run: block('media', { kind: 'file' }),
}
