import { FileTextIcon, ListTodoIcon } from 'lucide-react'
import { Plan, PlanContent, PlanDescription, PlanHeader, PlanTitle, PlanTrigger } from '@/components/ai-elements/plan'
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue'
import type { ChatPlan, ChatTodoList } from '@/features/note/db/types'

/** A brief plan inside Sensei's reply: its title, approach and steps. */
export function ChatPlanCard({ plan, isStreaming }: { plan: ChatPlan; isStreaming: boolean }) {
  return (
    <Plan isStreaming={isStreaming} defaultOpen className="mb-3">
      <PlanHeader>
        <div className="flex items-start gap-2">
          <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <PlanTitle>{plan.title}</PlanTitle>
            {plan.description && <PlanDescription>{plan.description}</PlanDescription>}
          </div>
        </div>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent>
        <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm marker:text-muted-foreground">
          {plan.steps.map((step, index) => (
            <li key={index}>
              <span className="font-medium">{step.title}</span>
              {step.details && <p className="text-muted-foreground">{step.details}</p>}
            </li>
          ))}
        </ol>
      </PlanContent>
    </Plan>
  )
}

/** The newest to-do list as a checklist pinned above the chat input, until every item is done. */
export function ChatTodoQueue({ todos, open, onOpenChange }: { todos: ChatTodoList; open: boolean; onOpenChange: (open: boolean) => void }) {
  const done = todos.items.filter((item) => item.status === 'completed').length
  return (
    <Queue className="mb-2">
      <QueueSection open={open} onOpenChange={onOpenChange}>
        <QueueSectionTrigger>
          <QueueSectionLabel icon={<ListTodoIcon className="size-4" />} count={todos.items.length - done} label={`of ${todos.items.length} left · ${todos.title}`} />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {todos.items.map((item, index) => (
              <QueueItem key={index}>
                <div className="flex items-center gap-2">
                  <QueueItemIndicator completed={item.status === 'completed'} className={item.status === 'in_progress' ? 'border-primary bg-primary/20' : undefined} />
                  <QueueItemContent completed={item.status === 'completed'}>{item.title}</QueueItemContent>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  )
}
