export const pageTitle = (title: string | undefined) => title || 'New Page'

/** True when the page's document has any text in it. Empty pages show a blank-page icon. */
export function hasText(content: string | undefined) {
  if (!content) return false
  const walk = (node: { text?: string; content?: unknown[] }): boolean =>
    Boolean(node.text?.trim()) || Boolean(node.content?.some((child) => walk(child as typeof node)))
  try {
    return walk(JSON.parse(content))
  } catch {
    return false
  }
}
