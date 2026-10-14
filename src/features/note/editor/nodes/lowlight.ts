import { all, createLowlight } from 'lowlight'

// Every highlight.js grammar, so any language name in a fence or the picker is colored.
export const lowlight = createLowlight(all)
export const LANGUAGES = ['auto', 'plaintext', 'mermaid', ...lowlight.listLanguages().filter((l) => l !== 'plaintext')]
