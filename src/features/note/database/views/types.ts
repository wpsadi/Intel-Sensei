import type { Database, Page, PropertyValue, View } from '../../db/types'

export interface ViewProps {
  database: Database
  view: View
  /** Rows after the view's filters and sorts. */
  rows: Page[]
  openRow: (id: string) => void
  addRow: (properties?: Record<string, PropertyValue>, title?: string) => void
}
