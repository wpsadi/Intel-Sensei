import { AlertCircle, DatabaseIcon, WrenchIcon } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import { ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought'
import { Reasoning, ReasoningContent, ReasoningText, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Shimmer } from '@/components/ai-elements/shimmer'
import type { ChatToolStep } from '@/features/note/db/types'

const iconOf = (step: ChatToolStep) => (step.status === 'failed' ? AlertCircle : step.name === 'memory' ? DatabaseIcon : WrenchIcon)

const toolCount = (n: number) => (n === 1 ? 'used a tool' : `used ${n} tools`)

/**
 * Sensei's thinking and the tool calls it made, in one collapsible block, in the order they happened: each
 * stretch of thought, then the tool calls it led to. Shared by Ask Sensei, the S-Note widget and the S3D agent so they read the same way.
 */
export function ChatReasoning({
  reasoning,
  steps,
  isStreaming,
  duration,
  defaultOpen,
  className,
  toolCount: showToolCount = true,
}: {
  reasoning?: string
  steps?: ChatToolStep[]
  isStreaming: boolean
  duration?: number
  defaultOpen?: boolean
  className?: string
  /** Adds "· used N tools" to the header; off where the reply shows its own timing instead. */
  toolCount?: boolean
}) {
  if (!reasoning && !steps?.length) return null
  const running = steps?.some((s) => s.status === 'running')
  const label = (streaming: boolean, seconds?: number) => {
    if (streaming || running) return <Shimmer duration={1}>{running ? 'Working…' : 'Thinking…'}</Shimmer>
    const thought = reasoning ? (seconds ? `Thought for ${seconds} seconds` : 'Thought for a few seconds') : 'Done'
    return <p>{showToolCount && steps?.length ? `${thought} · ${toolCount(steps.length)}` : thought}</p>
  }
  const stepList = (list: ChatToolStep[], className = 'my-3 space-y-3') => (
    <div className={className}>
      {list.map((step) => (
        <ChainOfThoughtStep
          key={step.id}
          icon={iconOf(step)}
          label={step.label}
          description={step.status === 'failed' ? (step.detail ?? 'Failed') : step.detail}
          status={step.status === 'running' ? 'active' : 'complete'}
        />
      ))}
    </div>
  )
  // Steps that know where they fell in the thinking are shown there, so it reads think → tools → think → tools.
  // Older saved replies have no positions and keep the thinking first, then every step.
  const ordered = reasoning && steps?.length && steps.every((s) => s.at !== undefined)
  if (ordered) {
    const pieces: ReactNode[] = []
    let from = 0
    let group: ChatToolStep[] = []
    const flush = () => {
      if (group.length) pieces.push(<Fragment key={`steps-${group[0].id}`}>{stepList(group)}</Fragment>)
      group = []
    }
    for (const step of steps) {
      const at = Math.min(Math.max(step.at!, from), reasoning.length)
      const text = reasoning.slice(from, at).trim()
      if (text) {
        flush()
        pieces.push(<ReasoningText key={`text-${from}`}>{text}</ReasoningText>)
      }
      from = at
      group.push(step)
    }
    flush()
    const rest = reasoning.slice(from).trim()
    if (rest) pieces.push(<ReasoningText key={`text-${from}`}>{rest}</ReasoningText>)
    return (
      <Reasoning isStreaming={isStreaming} duration={duration} defaultOpen={defaultOpen} className={className}>
        <ReasoningTrigger getThinkingMessage={label} />
        <ReasoningContent steps={pieces}>{''}</ReasoningContent>
      </Reasoning>
    )
  }
  return (
    <Reasoning isStreaming={isStreaming} duration={duration} defaultOpen={defaultOpen} className={className}>
      <ReasoningTrigger getThinkingMessage={label} />
      <ReasoningContent steps={steps?.length ? stepList(steps, 'mt-3 space-y-3') : undefined}>{reasoning ?? ''}</ReasoningContent>
    </Reasoning>
  )
}
