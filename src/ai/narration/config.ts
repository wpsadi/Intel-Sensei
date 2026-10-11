import type { BlockType } from './blocks'

/**
 * How one kind of block is turned into words for the voice.
 * - speak: the text is said as it is, with the Markdown marks removed.
 * - describe: MINI_STUFF_MODEL writes a description, since the block is visual and cannot be read out.
 * - skip: nothing is said about it.
 */
export interface BlockNarration {
  mode: 'speak' | 'describe' | 'skip'
  /** For describe: the most sentences the description may have. More sentences means a more verbose narration. */
  sentences?: number
  /** For describe: what the description should cover. */
  cover?: string
}

/** The narration settings for every block type. Change a mode or a sentence count here to make the narration quieter or more verbose. */
export const NARRATION_CONFIG: Record<BlockType, BlockNarration> = {
  text: { mode: 'speak' },
  table: { mode: 'describe', sentences: 3, cover: 'what the table is about, its columns, how many rows it has, and the standout values or the trend' },
  code: { mode: 'describe', sentences: 3, cover: 'the language, what the code does, and the idea behind how it works' },
  diagram: { mode: 'describe', sentences: 3, cover: 'what the diagram shows and how the steps or parts connect' },
  math: { mode: 'describe', sentences: 2, cover: 'what the formula says in plain words and what its symbols stand for' },
}
