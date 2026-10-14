import { FaGoogleDrive } from 'react-icons/fa6'

import { type BlockDefinition, block } from '../../insert'

/** Google Drive block for the "/" and "+" menus. */
export const GoogleDriveBlock: BlockDefinition = {
  group: 'Media',
  key: 'drive',
  title: 'Google Drive',
  icon: <FaGoogleDrive className="size-4" />,
  keywords: ['docs', 'sheets'],
  run: block('embed', { kind: 'drive' }),
}
