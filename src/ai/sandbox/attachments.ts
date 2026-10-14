import { warmSandbox } from './client'

/**
 * Only pictures, audio and video go to the model itself. Every other file (PDFs, documents, spreadsheets, text, code,
 * archives) stays a reference: it is read in the sandbox with the terminal and Python, so a big file never fills the
 * model's context.
 */
export const isModelMedia = (type: string) => type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')

/** Starts the Python environment in the background when any of these files is one the model reads through it. */
export function warmForFiles(files: { type: string }[], session?: string) {
  if (files.some((file) => !isModelMedia(file.type))) warmSandbox(session)
}

/** The text the model gets in place of a file it reads through the sandbox: a reference, not the contents. */
export const fileReference = (name: string, type: string, size: number) =>
  `Attached file "${name}" (${type || 'unknown type'}, ${size} bytes) is in the sandbox home folder under that name. Its contents are not shown to you: call load_skill with "files", then read it with the terminal and Python.`
