import { create } from 'zustand'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Questionnaire, QuestionnaireActions, QuestionnaireChoice, QuestionnaireChoiceDescription, QuestionnaireChoices, QuestionnaireDescription,
  QuestionnaireError, QuestionnaireInput, QuestionnaireItem, QuestionnaireNext, QuestionnairePrevious, QuestionnaireProgress, QuestionnaireSkip,
  QuestionnaireSubmit, QuestionnaireTitle,
} from '@/components/ui/questionnaire'
import type { ChatAnswers, ChatQuestion } from '@/features/note/db/types'

type Answer = ChatAnswers | { dismissed: true }
/** `remote`: shown here, but the run waiting on it is in another tab. */
type Pending = { id: string; chatId: string; questions: ChatQuestion[]; resolve: (a: Answer) => void; remote?: boolean }

/** Questions wait in line per chat; the panel shows the first one of the chat it is looking at. */
const useQuestions = create<{ queue: Pending[] }>()(() => ({ queue: [] }))

const settle = (p: Pending, a: Answer) => {
  if (!useQuestions.getState().queue.includes(p)) return
  useQuestions.setState((s) => ({ queue: s.queue.filter((x) => x !== p) }))
  p.resolve(a)
  channel?.postMessage({ kind: 'close', id: p.id } satisfies Sync)
}

/** Questions show in every tab of the app; whichever tab answers, the run in its own tab gets the answers. */
type Sync =
  | { kind: 'open'; id: string; chatId: string; questions: ChatQuestion[] }
  | { kind: 'answer'; id: string; answer: Answer }
  | { kind: 'close'; id: string }
  | { kind: 'hello' }
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('s3d-agent-questions') : null
channel?.addEventListener('message', (e: MessageEvent<Sync>) => {
  const msg = e.data
  const { queue } = useQuestions.getState()
  if (msg.kind === 'open') {
    if (queue.some((p) => p.id === msg.id)) return
    const p: Pending = { id: msg.id, chatId: msg.chatId, questions: msg.questions, remote: true, resolve: (answer) => channel?.postMessage({ kind: 'answer', id: msg.id, answer } satisfies Sync) }
    useQuestions.setState((s) => ({ queue: [...s.queue, p] }))
  } else if (msg.kind === 'answer') {
    const p = queue.find((x) => x.id === msg.id && !x.remote)
    if (p) settle(p, msg.answer)
  } else if (msg.kind === 'close') useQuestions.setState((s) => ({ queue: s.queue.filter((x) => x.id !== msg.id) }))
  else for (const p of queue) if (!p.remote) channel?.postMessage({ kind: 'open', id: p.id, chatId: p.chatId, questions: p.questions } satisfies Sync)
})
channel?.postMessage({ kind: 'hello' } satisfies Sync)

/** Shows the questions above the chat box and waits. Aborting `signal` withdraws them. */
export function askQuestions(chatId: string, questions: ChatQuestion[], signal: AbortSignal) {
  return new Promise<Answer>((resolve) => {
    if (signal.aborted) return resolve({ dismissed: true })
    const p: Pending = { id: crypto.randomUUID(), chatId, questions, resolve }
    useQuestions.setState((s) => ({ queue: [...s.queue, p] }))
    channel?.postMessage({ kind: 'open', id: p.id, chatId, questions } satisfies Sync)
    signal.addEventListener('abort', () => settle(p, { dismissed: true }), { once: true })
  })
}

/** Whether this chat is waiting on answers; the panel then hides the to-do list in favour of the form. */
export const useAsking = (chatId: string | null) => useQuestions((s) => !!chatId && s.queue.some((p) => p.chatId === chatId))

const isChoice = (q: ChatQuestion) => (q.kind === 'single' || q.kind === 'multiple') && !!q.choices?.length

/** The agent's questions as a compact form above the chat input. */
export function QuestionsDock({ chatId }: { chatId: string }) {
  const pending = useQuestions((s) => s.queue.find((p) => p.chatId === chatId))
  if (!pending) return null
  const { questions } = pending

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const result: ChatAnswers = {}
    for (const q of questions) {
      const values = data.getAll(q.id).map(String).filter(Boolean)
      result[q.id] = q.kind === 'multiple' ? values : (values[0] ?? '')
    }
    settle(pending, result)
  }

  return (
    <ScrollArea className="mb-2 rounded-lg border bg-background [&>[data-slot=scroll-area-viewport]]:max-h-[40vh]">
      <div className="px-3 py-3">
        <Questionnaire key={questions.map((q) => q.id).join()} onSubmit={submit} shortcuts="letters" className="gap-3 [&_[data-slot=questionnaire-item]]:gap-2 [&_[data-slot=questionnaire-choices]]:gap-1.5 [&_[data-slot=questionnaire-choice]]:min-h-0 [&_[data-slot=questionnaire-choice]]:px-3 [&_[data-slot=questionnaire-choice]]:py-2 [&_[data-slot=questionnaire-title]]:mb-1 [&_[data-slot=questionnaire-actions]]:min-h-0">
          {questions.length > 1 && <QuestionnaireProgress />}
          {questions.map((q) => (
            <QuestionnaireItem key={q.id} name={q.id} multiple={q.kind === 'multiple'} required={q.required}>
              <QuestionnaireTitle>{q.title}</QuestionnaireTitle>
              {q.description && <QuestionnaireDescription>{q.description}</QuestionnaireDescription>}
              {isChoice(q) ? (
                <QuestionnaireChoices>
                  {q.choices!.map((c) => (
                    <QuestionnaireChoice key={c.label} value={c.label}>
                      {c.label}
                      {c.description && <QuestionnaireChoiceDescription>{c.description}</QuestionnaireChoiceDescription>}
                    </QuestionnaireChoice>
                  ))}
                </QuestionnaireChoices>
              ) : (
                <QuestionnaireInput type="text" placeholder="Type your answer" />
              )}
              <QuestionnaireError />
            </QuestionnaireItem>
          ))}
          <QuestionnaireActions>
            <QuestionnairePrevious size="sm" />
            <QuestionnaireSkip size="sm" />
            <QuestionnaireNext size="sm" />
            <QuestionnaireSubmit size="sm" />
          </QuestionnaireActions>
        </Questionnaire>
      </div>
    </ScrollArea>
  )
}
