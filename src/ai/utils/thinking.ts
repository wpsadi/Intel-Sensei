/** Gemini's thought summaries open each step with a bold title line, such as "**Defining the Role**". */
const THOUGHT_HEADING_LINE = /^[ \t]*\*\*[^*\n]+\*\*[ \t]*\n?/gm

/**
 * The thinking without the bold title lines, so only the reasoning itself is shown. Gemma indents its
 * drafts, which markdown would show as a code block, so the indentation is dropped too.
 */
export const thinkingOnly = (thoughts: string) =>
  thoughts
    .replace(THOUGHT_HEADING_LINE, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart()
