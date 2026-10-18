import type { Tool } from 'ai'

import { DESCRIPTIONS, impl, schemas } from './tools-impl'

/** The tools that only look at the design. Anything that changes it stays with the text agent and its approvals. */
const READ_TOOLS = ['get_document', 'list_pages', 'get_scene'] as const

/**
 * The 3D tools a live voice call may run: the same handlers as the text agent, limited to the ones that only read. A
 * change goes through the text agent, which asks for approval and groups each reply into one undo step; a voice call
 * has neither.
 */
export function createS3dLiveTools(): Record<string, Tool> {
  return Object.fromEntries(
    READ_TOOLS.map((name) => [
      name,
      // A plain tool object: the three schemas differ, so the `tool()` helper's single input type does not fit them.
      {
        description: DESCRIPTIONS[name],
        inputSchema: schemas[name],
        execute: async (args: unknown) => (impl[name] as (input: unknown) => unknown)(args),
      } as unknown as Tool,
    ]),
  )
}

/** What a live call is told about the screen: a design is open and how to read it. The design itself is read with the tools. */
export const S3D_LIVE_INSTRUCTIONS = [
  'The user has a 3D and design file open in S3D. You cannot see it up front: before you say what is in it, read it with get_document (the pages and nodes), list_pages, or get_scene with a scene id from get_document. Never invent what the design contains. A question that has nothing to do with the design needs no tools.',
  'From this call you can look at the design but not change it. If the user asks for a change, tell them to type it in the chat and the agent will make it with their approval.',
].join('\n\n')
