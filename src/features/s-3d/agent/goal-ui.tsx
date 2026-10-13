import { CheckCircle2Icon, CircleAlertIcon, ScanSearchIcon, TargetIcon } from 'lucide-react'
import { TypingDots } from '@/components/typing-dots'
import type { AgentMessage } from '../types'

/** Above the chat box while a /goal runs: what is being pursued and which agent is on it right now. */
export function GoalBanner({ message }: { message: AgentMessage }) {
  if (!message.goal || (message.goalState !== 'working' && message.goalState !== 'verifying')) return null
  const verifying = message.goalState === 'verifying'
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
      {verifying ? <ScanSearchIcon className="mt-0.5 size-4 shrink-0 text-primary" /> : <TargetIcon className="mt-0.5 size-4 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium">Pursuing goal · {verifying ? 'verifier is checking the result' : 'working'}</div>
        <div className="line-clamp-2 text-muted-foreground">{message.goal}</div>
      </div>
      <TypingDots className="mt-1" />
    </div>
  )
}

/** What the separate verifier concluded, in the same message as the work it checked. */
export function VerificationCards({ message }: { message: AgentMessage }) {
  const list = message.verification
  if (!list?.length) return null
  return (
    <div className="my-1.5 flex flex-col gap-1.5">
      {list.map((v) => (
        <div key={v.round} className={`rounded-lg border px-3 py-2 text-xs ${v.achieved ? 'border-green-600/40 bg-green-600/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
          <div className="flex items-center gap-1.5 font-medium">
            {v.achieved ? <CheckCircle2Icon className="size-3.5 text-green-600" /> : <CircleAlertIcon className="size-3.5 text-amber-600" />}
            Verifier{list.length > 1 ? ` · check ${v.round}` : ''}: {v.achieved ? 'goal achieved' : 'not there yet'}
          </div>
          <p className="mt-0.5 text-muted-foreground">{v.summary}</p>
          {!v.achieved && v.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {v.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
