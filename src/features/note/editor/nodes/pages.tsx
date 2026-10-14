import { atomBlock } from './block-utils'
import { BreadcrumbView, PageBlockView, TocView } from './views/pages'

export const PageBlock = atomBlock('pageBlock', { pageId: '', link: false }, PageBlockView)
export const Breadcrumb = atomBlock('breadcrumb', {}, BreadcrumbView)
export const TableOfContents = atomBlock('tableOfContents', {}, TocView)
