import { generateText } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { MINI_STUFF_MODEL } from '@/constants/ai'
import { type Block, parseBlocks, toSpeech } from './blocks'
import { NARRATION_CONFIG } from './config'

/** A description of a visual block for someone who cannot see it. It is only spoken, never shown. */
async function describeBlock(block: Block, config: (typeof NARRATION_CONFIG)[keyof typeof NARRATION_CONFIG]) {
  const apiKey = GEMINI_KEY.value
  const what = block.type === 'code' && block.lang ? `${block.lang} code block` : block.type === 'diagram' ? 'diagram' : `${block.type}`
  try {
    const { text } = await generateText({
      model: createGoogle({ apiKey })(MINI_STUFF_MODEL),
      prompt: `Someone is listening on a voice call and cannot see this ${what}. Describe it for them: ${config.cover}. Use at most ${config.sentences ?? 2} short sentences of plain spoken words. Never read it out line by line, cell by cell or symbol by symbol, and use no Markdown.\n\n${block.raw}`,
      maxOutputTokens: 300,
    })
    return text.replace(/[*_#`>|~]/g, '').trim()
  } catch {
    // The description is a nicety: without it the voice still knows a block is there.
    return `There is a ${what} here.`
  }
}

/**
 * What to say aloud about a written answer. The answer is split into blocks: text is said as it is,
 * and every table, code block, diagram and formula gets a description from MINI_STUFF_MODEL, in order.
 * How each kind is handled is set in `NARRATION_CONFIG`. The result is for the voice only.
 */
export async function writeNarration(answer: string, config = NARRATION_CONFIG) {
  const spoken = await Promise.all(
    parseBlocks(answer).map(async (block) => {
      const rule = config[block.type]
      if (rule.mode === 'skip') return ''
      if (rule.mode === 'speak') return toSpeech(block.raw)
      return describeBlock(block, rule)
    }),
  )
  return spoken.filter(Boolean).join('\n\n')
}
