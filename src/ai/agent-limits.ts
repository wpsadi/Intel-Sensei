/** Most steps (model turns, each of which may call tools) one request may take. Every agent stops here. */
export const MAX_AGENT_STEPS = 60

/** Share of the steps after which the agent is told to wrap up. */
export const STEP_WARNING_RATIO = 0.75

/** Steps already taken before this run (an agent that works in several passes) and the most the whole request may take. */
export interface StepBudget {
  used: number
  max: number
}

/**
 * What the model is told before the step it is about to take, or null while it has plenty left. `stepNumber` counts the
 * steps this run has finished. From 75% of the budget the agent is asked to wrap up; on the last step it may not call
 * tools, so it ends with an answer and not in the middle of a tool call with nothing said.
 */
export function stepNotice({ used, max }: StepBudget, stepNumber: number): { note: string; final: boolean } | null {
  const done = used + stepNumber
  if (done >= max - 1) {
    return {
      final: true,
      note: `This is your last step (step ${max} of ${max}) and you cannot call tools now. Write your final answer: what is done, and exactly what is left.`,
    }
  }
  if (done >= Math.ceil(max * STEP_WARNING_RATIO)) {
    return {
      final: false,
      note: `You have used ${done} of ${max} steps (${Math.round((done / max) * 100)}%); the steps are limited. Stop exploring: finish the most important remaining work in as few steps as you can, and keep a step to write your answer. If something cannot be finished, say exactly what is left.`,
    }
  }
  return null
}
