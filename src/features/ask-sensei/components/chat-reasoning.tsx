import { AlertCircle, DatabaseIcon, WrenchIcon } from 'lucide-react'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought'
import { Shimmer } from '@/components/ai-elements/shimmer'
import type { ChatToolStep } from '@/features/note/db/types'

const iconOf = (step: ChatToolStep) => (step.status === 'failed' ? AlertCircle : step.name === 'memory' ? DatabaseIcon : WrenchIcon)

const toolCount = (n: number) => (n === 1 ? 'used a tool' : `used ${n} tools`)

/**
 * Sensei's thinking and the tool calls it made, in one collapsible block: the thought summary first, then each
 * tool call as a step. Shared by Ask Sensei, the S-Note widget and the S3D agent so they read the same way.
 */
export function ChatReasoning({
  reasoning,
  steps,
  isStreaming,
  duration,
  defaultOpen,
  className,
}: {
  reasoning?: string
  steps?: ChatToolStep[]
  isStreaming: boolean
  duration?: number
  defaultOpen?: boolean
  className?: string
}) {
  if (!reasoning && !steps?.length) return null
  const running = steps?.some((s) => s.status === 'running')
  const label = (streaming: boolean, seconds?: number) => {
    if (streaming || running) return <Shimmer duration={1}>{running ? 'Working…' : 'Thinking…'}</Shimmer>
    const thought = reasoning ? (seconds ? `Thought for ${seconds} seconds` : 'Thought for a few seconds') : 'Done'
    return <p>{steps?.length ? `${thought} · ${toolCount(steps.length)}` : thought}</p>
  }
  return (
    <Reasoning isStreaming={isStreaming} duration={duration} defaultOpen={defaultOpen} className={className}>
      <ReasoningTrigger getThinkingMessage={label} />
      <ReasoningContent
        steps={
          steps?.length ? (
            <div className="mt-3 space-y-3">
              {steps.map((step) => (
                <ChainOfThoughtStep
                  key={step.id}
                  icon={iconOf(step)}
                  label={step.label}
                  description={step.status === 'failed' ? (step.detail ?? 'Failed') : step.detail}
                  status={step.status === 'running' ? 'active' : 'complete'}
                />
              ))}
            </div>
          ) : undefined
        }
      >
        {reasoning ?? ''}
      </ReasoningContent>
    </Reasoning>
  )
}
