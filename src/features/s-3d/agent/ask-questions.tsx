import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@/components/ui/questionnaire'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChatAnswers, ChatQuestion } from '@/features/note/db/types'

import { settle, useQuestions } from './ask-questions-store'

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
        <Questionnaire
          key={questions.map((q) => q.id).join()}
          onSubmit={submit}
          shortcuts="letters"
          className="gap-3 [&_[data-slot=questionnaire-item]]:gap-2 [&_[data-slot=questionnaire-choices]]:gap-1.5 [&_[data-slot=questionnaire-choice]]:min-h-0 [&_[data-slot=questionnaire-choice]]:px-3 [&_[data-slot=questionnaire-choice]]:py-2 [&_[data-slot=questionnaire-title]]:mb-1 [&_[data-slot=questionnaire-actions]]:min-h-0"
        >
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
