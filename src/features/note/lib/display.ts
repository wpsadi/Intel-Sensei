import type { Page, PageFont } from '../db/types'

/** Page menu settings, with defaults for pages saved before these fields existed. */
export function displaySettings(page: Page): { font: PageFont; smallText: boolean; fullWidth: boolean; locked: boolean } {
  return {
    font: page.font ?? 'default',
    smallText: Boolean(page.smallText),
    fullWidth: Boolean(page.fullWidth),
    locked: Boolean(page.locked),
  }
}
