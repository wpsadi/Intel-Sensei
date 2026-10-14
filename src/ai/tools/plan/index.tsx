import { tool } from 'ai'
import { z } from 'zod'

import type { ChatPlan } from '@/features/note/db/types'

/** Added to the agent's instructions so it makes a plan card only when the user asks for one. */
export const PLAN_INSTRUCTIONS = `Call createPlan only when the user explicitly asks you to make a plan. Otherwise do not make or show a plan, even for a task with several steps or a question about how to do something: just answer. A plan explains an approach. It is not a checklist you tick off: use createTodoList for that.`

/** The tool that shows a brief plan to the user as a card. `onPlan` receives each plan the model makes. */
export function createPlanTools(onPlan?: (plan: ChatPlan | undefined) => void) {
  const createPlan = tool({
    description: 'Show the user a brief plan for how to do something, as a card. Replaces any plan you made before in this reply.',
    inputSchema: z.object({
      title: z.string().describe('Short name of what the plan achieves'),
      description: z.string().optional().describe('One sentence on the approach'),
      steps: z
        .array(
          z.object({ title: z.string().describe('What to do'), details: z.string().optional().describe('A short note on how or why') }),
        )
        .min(1)
        .describe('The steps in order'),
    }),
    execute: (input) => {
      onPlan?.(input)
      return `The plan is shown with ${input.steps.length} steps.`
    },
  })
  return { createPlan }
}
