import { z } from 'zod'

/**
 * Tools about the conversation itself rather than the canvas. The runner answers them (they need the chat), so they
 * have no entry in `impl`.
 */
export const agentSchemas = {
  write_plan: z.object({
    title: z.string().describe('Short name for what will be built'),
    description: z.string().optional().describe('One or two sentences on the approach'),
    steps: z.array(z.object({
      title: z.string().describe('One concrete action, e.g. "Model the sofa frame with a roundedBox and 4 legs"'),
      details: z.string().optional().describe('Sizes, materials or tools to use'),
    })).min(1).describe('The to-dos, in the order they will be done. End with a verification step.'),
  }),
  update_todos: z.object({
    title: z.string().optional().describe('Name of the list; keep it the same between updates'),
    items: z.array(z.object({
      title: z.string(),
      status: z.enum(['pending', 'in_progress', 'completed']),
    })).min(1).describe('The WHOLE list every time, not only what changed'),
  }),
  complete_goal: z.object({
    summary: z.string().describe('What was achieved, in one or two sentences'),
    evidence: z.string().describe('How you verified it: which angles you rendered, what verify_design returned, what you compared'),
  }),
  ask_questions: z.object({
    questions: z.array(z.object({
      id: z.string(),
      title: z.string().describe('The question, one friendly sentence'),
      description: z.string().optional(),
      kind: z.enum(['single', 'multiple', 'text']).describe('single/multiple pick from choices; text is a typed answer'),
      choices: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional(),
      required: z.boolean().optional(),
    })).min(1).max(4),
  }),
}

export type AgentToolName = keyof typeof agentSchemas

export const agentDescriptions: Record<AgentToolName, string> = {
  write_plan: 'Plan mode only. Present the plan to the user: a title, the approach and the ordered to-do steps. This ends your turn; the user then chooses to build it.',
  update_todos: 'Create or update the to-do list shown above the chat box. Send the whole list each time. Keep exactly one item in_progress, mark items completed as soon as they are truly done, and keep a final verification item.',
  complete_goal: 'Goal runs only. Say you believe the goal is achieved; a SEPARATE verifier agent then checks the real result and sends you back with problems if it finds any. Call it ONLY after every part of the goal is built and you verified it (render_views from every angle, verify_design ok, to-dos completed); the run keeps going until you do.',
  ask_questions: 'Ask the user one to four short questions in a form above the chat box and WAIT for the answers (returns { [questionId]: answer }). Use it for choices that are theirs (style, size, which variant, missing details) instead of guessing. For picking between 3D model search results with pictures, use ask_user instead.',
}
