/** The files of `names` that a message points at with `@name`, longest names first so "@report.pdf" is not read as "@report". */
export function mentionedFiles(text: string, names: readonly string[]) {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const at = `@${name.toLowerCase()}`
    let from = lower.indexOf(at)
    while (from !== -1) {
      // The name must end there: a space, punctuation or the end of the message, not more of a longer name.
      const next = lower[from + at.length]
      if (next === undefined || /[\s,.;:!?)\]]/.test(next)) {
        found.push(name)
        break
      }
      from = lower.indexOf(at, from + 1)
    }
  }
  return found
}

/**
 * A message with a note for the model on the files it points at with `@`. The chat keeps showing what the user typed;
 * the model learns that these files are in its sandbox, and how to look at them.
 */
export function withFileMentions(text: string, names: readonly string[]) {
  const files = mentionedFiles(text, names)
  if (!files.length) return text
  return `${text}\n\n[The user pointed at these files with @: ${files.map((name) => `"${name}"`).join(', ')}. They are in your sandbox home folder under these names: read them with the terminal and Python, and look at a picture with view_image.]`
}
