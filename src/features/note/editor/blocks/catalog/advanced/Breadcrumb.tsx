import { ChevronsRightIcon } from 'lucide-react'

import { type BlockDefinition, block } from '../../insert'

/** Breadcrumb block for the "/" and "+" menus. */
export const BreadcrumbBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'breadcrumb',
  title: 'Breadcrumb',
  icon: <ChevronsRightIcon className="size-4" />,
  run: block('breadcrumb'),
}
