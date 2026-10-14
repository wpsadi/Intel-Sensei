import { tool } from 'ai'
import { z } from 'zod'

import type { ChatAnswers, ChatQuestion } from '@/features/note/db/types'

/** Added to the agent's instructions so it asks the user only when it cannot answer well without them. */
export const ASK_INSTRUCTIONS = `Call askUser when you need the user's choice or details you cannot guess (their goal, level, preferences) before you can answer well, or when the user asks you to quiz or ask them something. Ask at most 4 short questions at once, and offer choices whenever you can. Wait for the answers, then carry on. Do not ask what you can reasonably assume.`

/** The tool that shows the user a questionnaire and waits for their answers. `ask` shows it and resolves once they submit. */
export function createAskTools(ask?: (questions: ChatQuestion[]) => Promise<ChatAnswers>) {
  const askUser = tool({
    description:
      'Ask the user one or more questions in a form and wait for their answers. Use single or multiple with choices for multiple-choice questions and quizzes, and a typed kind for free answers.',
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            id: z.string().describe('Short unique key, such as "level"'),
            title: z.string().describe('The question'),
            description: z.string().optional().describe('A short hint under the question'),
            kind: z
              .enum(['single', 'multiple', 'text', 'number', 'date', 'time', 'email', 'url'])
              .describe(
                'single: multiple-choice, pick one. multiple: pick any number. text: a typed answer. number, date, time, email, url: a typed answer of that kind',
              ),
            choices: z
              .array(z.object({ label: z.string(), description: z.string().optional().describe('A short note under the option') }))
              .optional()
              .describe('The options, required for single and multiple'),
            placeholder: z.string().optional().describe('Example answer shown in an empty typed field'),
            required: z.boolean().optional().describe('True when the user cannot skip it'),
          }),
        )
        .min(1)
        .max(4),
    }),
    execute: async ({ questions }) => {
      if (!ask) return 'Questions cannot be shown here. Make a sensible assumption and say so.'
      const answers = await ask(questions)
      const lines = questions.map((question) => {
        const answer = answers[question.id]
        const text = Array.isArray(answer) ? answer.join(', ') : answer
        return `${question.title}: ${text || '(skipped)'}`
      })
      return `The user answered:\n${lines.join('\n')}`
    },
  })
  return { askUser }
}
