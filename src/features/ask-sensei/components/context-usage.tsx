import { AI_MODELS } from '@/ai/providers'
import { messageText } from '@/ai/utils/messages'
import { Context, ContextContent, ContextContentBody, ContextContentHeader, ContextTrigger } from '@/components/ai-elements/context'
import type { ChatMessage } from '@/features/note/db/types'
import { cn } from '@/lib/utils'

/** Gemini Flash-Lite's context window. */
const MAX_TOKENS = 1_048_576

/** About how many tokens the instructions and tool definitions take, used until a reply has reported a total. */
const FALLBACK_SYSTEM_TOKENS = 1500

/** Rough token count: about four characters per token for English text. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4)

/**
 * The three parts of the context, in fixed order. Colors are categorical slots 1-3 of the dataviz reference
 * palette, each with its own dark-mode step. Gemini reports one total, so "Instructions & tools" is what is
 * left after the conversation: the instructions, memory, tool definitions, tool results and files.
 */
const PARTS = [
  { key: 'system', label: 'Instructions & tools', color: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  { key: 'human', label: 'You', color: 'bg-[#eb6834] dark:bg-[#d95926]' },
  { key: 'ai', label: 'Sensei', color: 'bg-[#1baf7a] dark:bg-[#199e70]' },
] as const

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

/**
 * How full the model's context is for this chat, as a ring in the composer. The total is the one Gemini
 * reported for the newest reply, so it is exact. Only the split into parts is estimated, from the
 * text of the messages. Before any reply has a reported total, everything is an estimate.
 * Hovering or focusing the ring opens a breakdown: a single stacked bar and a legend.
 */
export function ContextUsage({ messages }: { messages: ChatMessage[] }) {
  // The newest reply with a reported total. The messages after it are not counted in that total yet.
  const reportedIndex = messages.findLastIndex((message) => message.role === 'assistant' && message.usage)
  const reported = reportedIndex >= 0 ? messages[reportedIndex].usage : undefined

  const tokens: Record<(typeof PARTS)[number]['key'], number> = { system: 0, human: 0, ai: 0 }
  for (const [index, message] of messages.entries()) {
    // Files other than pictures, audio and video are not sent to the model, so only the text of the message counts here.
    const estimate = estimateTokens(messageText(message))
    if (message.role === 'user') tokens.human += estimate
    else tokens.ai += estimate
    if (index === reportedIndex) break
  }

  if (reported) {
    // What the conversation does not explain is the instructions, memory, tool definitions, tool results and files.
    const conversation = tokens.human + tokens.ai
    tokens.system = Math.max(0, reported.contextTokens - conversation)
    // If the text estimate overshoots the real total, shrink it to fit so the parts still add up.
    if (conversation > reported.contextTokens) {
      const scale = reported.contextTokens / conversation
      tokens.human = Math.round(tokens.human * scale)
      tokens.ai = Math.round(tokens.ai * scale)
    }
  } else {
    tokens.system = FALLBACK_SYSTEM_TOKENS
  }
  // Messages after the newest reported reply are not in its total, so they are added as estimates.
  for (const message of messages.slice(reportedIndex + 1)) {
    const estimate = estimateTokens(messageText(message))
    if (message.role === 'user') tokens.human += estimate
    else tokens.ai += estimate
  }
  const used = tokens.system + tokens.human + tokens.ai

  return (
    <Context usedTokens={used} maxTokens={MAX_TOKENS} modelId={AI_MODELS.chatId}>
      <ContextTrigger size="sm" className="h-8 px-2" aria-label="Context usage" />
      <ContextContent align="start" side="top" className="w-72">
        <ContextContentHeader />
        <ContextContentBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {reported ? 'What fills the context (total reported by Gemini, split estimated)' : 'What fills the context (estimated)'}
          </p>
          {/* One stacked bar; segments are separated by a 2px gap and the ends are rounded. */}
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm" role="img" aria-label="Context breakdown">
            {PARTS.filter((part) => tokens[part.key] > 0).map((part) => (
              <div
                key={part.key}
                title={`${part.label}: ${compact.format(tokens[part.key])} tokens`}
                className={cn('h-full min-w-1 first:rounded-l-sm last:rounded-r-sm', part.color)}
                style={{ flexGrow: tokens[part.key] }}
              />
            ))}
          </div>
          {/* Legend doubles as the table view: every part with its tokens and share. */}
          <ul className="space-y-1.5 text-xs">
            {PARTS.map((part) => (
              <li key={part.key} className="flex items-center gap-2">
                <span aria-hidden className={cn('size-2.5 rounded-sm', part.color)} />
                <span>{part.label}</span>
                <span className="ml-auto font-mono text-muted-foreground tabular-nums">
                  {compact.format(tokens[part.key])} · {percent.format(used ? tokens[part.key] / used : 0)}
                </span>
              </li>
            ))}
          </ul>
        </ContextContentBody>
      </ContextContent>
    </Context>
  )
}
