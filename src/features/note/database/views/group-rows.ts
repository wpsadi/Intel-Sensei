import type { Page, PropertyDef, PropertyValue } from '../../db/types'
import { readValue, valueText } from '../property-values'

export function groupRows(rows: Page[], prop: PropertyDef | undefined) {
  if (!prop) return [{ key: '', label: 'All', rows, value: null as PropertyValue }]
  if (prop.options) {
    const groups = prop.options.map((option) => ({
      key: option.id,
      label: option.name,
      color: option.color,
      value: (prop.type === 'multi_select' ? [option.id] : option.id) as PropertyValue,
      rows: rows.filter((row) => {
        const v = readValue(row, prop)
        return Array.isArray(v) ? v.includes(option.id) : v === option.id
      }),
    }))
    const none = rows.filter((row) => {
      const v = readValue(row, prop)
      return Array.isArray(v) ? !v.length : !v
    })
    return [{ key: '__none', label: `No ${prop.name}`, value: null as PropertyValue, rows: none }, ...groups]
  }
  const map = new Map<string, Page[]>()
  rows.forEach((row) => {
    const key = valueText(prop, readValue(row, prop))
    map.set(key, [...(map.get(key) ?? []), row])
  })
  return [...map].map(([key, groupRowsList]) => ({
    key,
    label: key || `No ${prop.name}`,
    value: key as PropertyValue,
    rows: groupRowsList,
  }))
}
