import { tool } from 'ai'
import { z } from 'zod'

const progressSchema = z.object({
  stage: z.enum(['working', 'finding']),
  summary: z
    .string()
    .min(1)
    .max(500)
    .describe('One short, user-facing sentence about current work or a finding supported by tool results.'),
})

/** Public milestones for the voice model, never private reasoning or unfinished text. */
export type AgentProgress = z.infer<typeof progressSchema>

export const PROGRESS_INSTRUCTIONS = `You are working in the background during a live voice call. Use reportProgress for meaningful milestones and useful intermediate findings, so the voice assistant can keep the user informed while you work. Report a short sentence when you begin substantive work and when verified results change what you can tell the user. Use stage "working" for activity and "finding" only for facts supported by results you have already received. Do not report every tool call, repeat a milestone, expose private reasoning, or invent progress. Keep writing the full answer normally; reportProgress does not replace it.`

export const createProgressTool = (onProgress: (progress: AgentProgress) => void) =>
  tool({
    description: 'Send a brief progress update or verified intermediate finding to the live voice assistant while continuing the task.',
    inputSchema: progressSchema,
    execute: async (progress) => {
      onProgress(progress)
      return { delivered: true }
    },
  })
