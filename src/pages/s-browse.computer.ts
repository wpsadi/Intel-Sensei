import { type Tool, tool } from 'ai'
import { z } from 'zod'

import { type Screenshot, screenshotOf, screenshotsOn, shotScale } from './s-browse.screenshot'

/** What the computer tool needs from the SBrowse page. */
export interface ComputerHost {
  iframe(): HTMLIFrameElement | null
  /** The address open in the window now, or null when none is. */
  url(): string | null
  /** The user turned control mode on, which also shared the screen. Nothing is done to the page without it. */
  controlOn(): boolean
  /** Sends one action to the page's bridge; resolves true when the page confirmed it. */
  send(action: string, payload?: Record<string, unknown>): Promise<boolean>
  /** Shows the user where the agent acted. Coordinates are in iframe pixels. */
  pointer(x: number, y: number, kind: string): void
  /** Opens an address or search in the SBrowse window, like typing it in the address bar. Resolves with the address opened. */
  open(address: string): string | null
}

export const ACTIONS = ['open_url', 'screenshot', 'click', 'double_click', 'right_click', 'move', 'type', 'key', 'scroll', 'wait'] as const

export const computerInput = z.object({
  action: z.enum(ACTIONS).describe('What to do. "screenshot" only looks.'),
  url: z.string().optional().describe('For "open_url": a site address such as example.com, or words to search on Bing.'),
  x: z
    .number()
    .optional()
    .describe('Horizontal position in the screenshot, in its pixels. For click, double_click, right_click, move and scroll.'),
  y: z.number().optional().describe('Vertical position in the screenshot, in its pixels.'),
  text: z.string().optional().describe('For "type": the text to type into the focused field.'),
  key: z.string().optional().describe('For "key": one key or combination, such as Enter, Escape, Tab, ArrowDown or Control+a.'),
  scroll_y: z.number().optional().describe('For "scroll": screenshot pixels to scroll down (negative scrolls up).'),
  scroll_x: z.number().optional().describe('For "scroll": screenshot pixels to scroll right (negative scrolls left).'),
})

export type ComputerInput = z.infer<typeof computerInput>
export interface ComputerResult {
  note?: string
  shot?: Screenshot
}

export const COMPUTER_DESCRIPTION =
  'Looks at the page open in the SBrowse window and operates it like a person with a mouse and keyboard. To go to a site, use the open_url action; do not click the address bar, which is outside the page. Every call returns a fresh screenshot of the page after the action. Positions are pixels in the screenshot, from its top-left corner. Look at the screenshot, do one action, look again.'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runComputer(host: ComputerHost, input: ComputerInput): Promise<ComputerResult> {
  if (!host.controlOn())
    return {
      note: 'Control mode is off. Ask the user to turn it on in the CUA tab of SBrowse; that also shares the screen. Nothing was done.',
    }
  if (input.action === 'open_url') {
    if (!input.url?.trim()) return { note: '"open_url" needs a url.' }
    const opened = host.open(input.url)
    if (!opened) return { note: `Could not open "${input.url}". Give a site address or words to search.` }
    // The page takes a moment to start loading.
    await wait(2500)
  }
  const iframe = host.iframe()
  if (!iframe) return { note: 'No page is open in SBrowse. Ask the user to open one, or give an address.' }
  if (!screenshotsOn())
    return {
      note: 'The screen is not shared, so the page cannot be seen. Ask the user to turn control mode off and on again in the CUA tab.',
    }

  let note: string | undefined
  if (input.action !== 'screenshot' && input.action !== 'wait' && input.action !== 'open_url') {
    // The picture the model saw may be smaller than the iframe, so its coordinates are scaled back to iframe pixels.
    const scale = shotScale(iframe)
    const at = input.x !== undefined && input.y !== undefined ? { x: Math.round(input.x * scale), y: Math.round(input.y * scale) } : null
    const needsPoint = ['click', 'double_click', 'right_click', 'move'].includes(input.action)
    if (needsPoint && !at) return { note: `"${input.action}" needs x and y.` }
    if (input.action === 'type' && typeof input.text !== 'string') return { note: '"type" needs text.' }
    if (input.action === 'key' && !input.key) return { note: '"key" needs a key.' }
    if (at) host.pointer(at.x, at.y, input.action)
    const payload: Record<string, unknown> = {
      ...at,
      ...(input.text !== undefined && { text: input.text }),
      ...(input.key && { key: input.key }),
      ...(input.action === 'scroll' && { dx: Math.round((input.scroll_x ?? 0) * scale), dy: Math.round((input.scroll_y ?? 0) * scale) }),
    }
    const done = await host.send(input.action, payload)
    if (!done)
      note =
        'The page did not confirm the action: it has no Sensei bridge (public/sensei-cua-bridge.js), so a page from another site cannot be clicked or typed into. You can still see it. Tell the user instead of retrying.'
  } else if (input.action === 'wait') {
    await wait(1000)
  }
  // Let the page react before it is looked at again.
  await wait(input.action === 'screenshot' ? 0 : 500)
  const shot = await screenshotOf(iframe)
  return { note, shot: shot ?? undefined }
}

/** The tool the in-app Sensei agent uses. */
export function createComputerTool(host: ComputerHost): Tool {
  return tool({
    description: COMPUTER_DESCRIPTION,
    inputSchema: computerInput,
    execute: async (input: ComputerInput) => {
      const result = await runComputer(host, input)
      return {
        note: result.note ?? null,
        image: result.shot?.data ?? null,
        mediaType: 'image/png',
        size: result.shot ? `${result.shot.width}x${result.shot.height}` : null,
      }
    },
    // The model gets the picture itself, with a note when the action did not land.
    toModelOutput: ({ output }: { output: { note: string | null; image: string | null; mediaType: string; size: string | null } }) => ({
      type: 'content' as const,
      value: [
        ...(output.note ? [{ type: 'text' as const, text: output.note }] : []),
        ...(output.image
          ? [
              { type: 'text' as const, text: `Screenshot ${output.size}` },
              { type: 'file' as const, mediaType: output.mediaType, data: { type: 'data' as const, data: output.image } },
            ]
          : []),
      ],
    }),
  } as never) as Tool
}
