import { tool } from 'ai'
import { z } from 'zod'

import { readSandboxFile, sandboxUnavailable } from '@/ai/sandbox/client'
import { MIME } from '@/ai/sandbox/tools'
import { putMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'

/** Added to the instructions of an agent that can hand sandbox files to the user. */
export const EXPORT_INSTRUCTIONS = `Files for the user: when the answer is a file (a chart, a dashboard, a converted or generated document), make it in the sandbox with a script and call export_file. It shows under your reply for the user to open, so never paste its contents or base64 into the chat.`

/**
 * Hands a file from the sandbox to the user. The file is saved in the browser and `onFile` shows it with the reply, so
 * the bytes never enter the model's context.
 */
export function createExportFileTool(onFile: (file: ChatAttachment) => void, session?: string) {
  return {
    export_file: tool({
      description:
        'Gives the user a file from the sandbox (a chart, converted file, spreadsheet or generated document). It is shown under your reply. Use it instead of printing file contents.',
      inputSchema: z.object({
        path: z.string().min(1).describe('The file in the sandbox, such as "report.pdf" or "chart.png"'),
        name: z.string().optional().describe("The name to show. Leave out to use the file's own name"),
      }),
      execute: async ({ path, name }, { abortSignal }) => {
        const wait = sandboxUnavailable(session)
        if (wait) return wait
        const bytes = await readSandboxFile(path, abortSignal, session)
        const fileName = name?.trim() || path.split('/').at(-1) || 'file'
        const type = MIME[fileName.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream'
        const src = await putMedia(new Blob([bytes as BlobPart], { type }), fileName)
        onFile({ src, name: fileName, type, size: bytes.byteLength })
        return `Shown to the user: "${fileName}".`
      },
    }),
  }
}
