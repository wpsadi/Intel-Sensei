import type { Tool } from 'ai'

/**
 * Narrows Sensei to one app's job. An app with a profile gives the agent only the listed general tools, plus its own
 * tools and instructions. Without a profile the agent has everything, as in Ask Sensei.
 */
export interface ChatProfile {
  /** Names of the general tools to keep. */
  allow: string[]
  /** The app's own tools. */
  tools: Record<string, Tool>
  /** Added to the agent's instructions. */
  instructions: string
}
