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
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import type { ChatAnswers, ChatMessage, ChatQuestion } from '@/features/note/db/types'

/** A multiple-choice question; one without choices falls back to a typed answer. */
const isChoice = (question: ChatQuestion) => (question.kind === 'single' || question.kind === 'multiple') && !!question.choices?.length

/** Sensei's questions inside its reply. While it waits they are a form; once answered they show the answers. */
export function ChatQuestionsCard({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const answerQuestions = useAskSenseiStore((state) => state.answerQuestions)
  const { questions, answers } = message.questions!

  if (answers || !isStreaming) {
    return (
      <div className="my-2 flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        {questions.map((question) => {
          const answer = answers?.[question.id]
          const text = Array.isArray(answer) ? answer.join(', ') : answer
          return (
            <div key={question.id}>
              <div className="font-medium">{question.title}</div>
              <div className="text-muted-foreground">{text || (answers ? 'Skipped' : 'Not answered')}</div>
            </div>
          )
        })}
      </div>
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const result: ChatAnswers = {}
    for (const question of questions) {
      const values = data.getAll(question.id).map(String).filter(Boolean)
      result[question.id] = question.kind === 'multiple' ? values : (values[0] ?? '')
    }
    answerQuestions(message.chatId, message.id, result)
  }

  return (
    <ScrollArea className="mb-3 rounded-lg border bg-background [&>[data-slot=scroll-area-viewport]]:max-h-[35vh]">
      <div className="px-3 py-3">
        <Questionnaire
          onSubmit={submit}
          shortcuts="letters"
          className="gap-3 [&_[data-slot=questionnaire-item]]:gap-2 [&_[data-slot=questionnaire-choices]]:gap-1.5 [&_[data-slot=questionnaire-choice]]:min-h-0 [&_[data-slot=questionnaire-choice]]:py-2 [&_[data-slot=questionnaire-choice]]:px-3 [&_[data-slot=questionnaire-title]]:mb-1 [&_[data-slot=questionnaire-actions]]:min-h-0"
        >
          {questions.length > 1 && <QuestionnaireProgress />}
          {questions.map((question) => (
            <QuestionnaireItem key={question.id} name={question.id} multiple={question.kind === 'multiple'} required={question.required}>
              <QuestionnaireTitle>{question.title}</QuestionnaireTitle>
              {question.description && <QuestionnaireDescription>{question.description}</QuestionnaireDescription>}
              {isChoice(question) ? (
                <QuestionnaireChoices>
                  {question.choices!.map((choice) => (
                    <QuestionnaireChoice key={choice.label} value={choice.label}>
                      {choice.label}
                      {choice.description && <QuestionnaireChoiceDescription>{choice.description}</QuestionnaireChoiceDescription>}
                    </QuestionnaireChoice>
                  ))}
                </QuestionnaireChoices>
              ) : (
                <QuestionnaireInput
                  type={question.kind === 'single' || question.kind === 'multiple' ? 'text' : question.kind}
                  placeholder={question.placeholder ?? 'Type your answer'}
                />
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
