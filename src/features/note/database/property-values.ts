import type { Page, PropertyDef, PropertyType, PropertyValue } from '../db/types'
import { useNoteStore } from '../note.store'

export const PROPERTY_TYPES: { type: PropertyType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'status', label: 'Status' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
  { type: 'person', label: 'Person' },
  { type: 'place', label: 'Place (lat, lng)' },
  { type: 'created_time', label: 'Created time' },
]

export const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

/* -------------------------------- value access ----------------------------- */

export function readValue(row: Page, prop: PropertyDef): PropertyValue {
  if (prop.type === 'title') return row.title
  if (prop.type === 'created_time') return new Date(row.createdAt).toISOString()
  return row.properties[prop.id] ?? null
}

export async function writeValue(row: Page, prop: PropertyDef, value: PropertyValue) {
  const store = useNoteStore.getState()
  if (prop.type === 'title') return store.updatePage(row.id, { title: String(value ?? '') })
  if (prop.type === 'created_time') return
  return store.setPageProperty(row.id, prop.id, value)
}

export const dateStart = (value: PropertyValue) => (value && typeof value === 'object' && 'start' in value ? value.start : '')

/** A sortable / groupable plain representation of any value. */
export function valueText(prop: PropertyDef, value: PropertyValue): string {
  if (value === null || value === undefined) return ''
  if (prop.type === 'select' || prop.type === 'status') return prop.options?.find((o) => o.id === value)?.name ?? ''
  if (prop.type === 'multi_select')
    return (value as string[])
      .map((id) => prop.options?.find((o) => o.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  if (prop.type === 'date') return dateStart(value)
  if (prop.type === 'checkbox') return value ? 'Checked' : 'Unchecked'
  return String(value)
}

export const parsePlace = (value: PropertyValue): [number, number] | null => {
  const match = String(value ?? '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  return match ? [Number(match[1]), Number(match[2])] : null
}
