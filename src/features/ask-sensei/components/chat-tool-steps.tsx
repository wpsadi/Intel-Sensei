import { AlertCircle, DatabaseIcon, WrenchIcon } from 'lucide-react'
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought'
import type { ChatToolStep } from '@/features/note/db/types'

/** A tool call has the wrench icon, memory has a database icon, and a failed one has a warning. A plan is not a step: it shows as its own card with a document icon. */
const iconOf = (step: ChatToolStep) => (step.status === 'failed' ? AlertCircle : step.name === 'memory' ? DatabaseIcon : WrenchIcon)

/** The tool calls behind a live-call reply, shown as steps. Open while one is still running. `className` and `defaultOpen` let a compact host (the S-Note widget) drop the margin and keep it closed. */
export function ChatToolSteps({ steps, className = 'mb-3', defaultOpen }: { steps: ChatToolStep[]; className?: string; defaultOpen?: boolean }) {
  const running = steps.some((step) => step.status === 'running')
  return (
    <ChainOfThought defaultOpen={defaultOpen ?? running} className={className}>
      <ChainOfThoughtHeader icon={WrenchIcon}>{running ? 'Working…' : `Used ${steps.length === 1 ? 'a tool' : `${steps.length} tools`}`}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step) => (
          <ChainOfThoughtStep
            key={step.id}
            icon={iconOf(step)}
            label={step.label}
            description={step.status === 'failed' ? (step.detail ?? 'Failed') : step.detail}
            status={step.status === 'running' ? 'active' : 'complete'}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
