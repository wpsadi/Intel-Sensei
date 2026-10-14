import { tool } from 'ai'
import { z } from 'zod'

import { mountFiles, readSandboxFile, sandboxStatus, sandboxUnavailable } from '@/ai/sandbox/client'
import { MIME, mountKey } from '@/ai/sandbox/tools'
import { putMedia, readMedia, updateMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'

/** Added to the instructions of an agent that can hand sandbox files to the user. */
export const EXPORT_INSTRUCTIONS = `Artifacts are files you make for the user. They show as cards under your reply and open in a panel beside the chat, where the user can read and edit them. Their text is never in the chat or in your context, so do not paste it, and do not repeat it in your reply: say in a line or two what you made. An artifact is a file in the sandbox folder artifacts/ (read-only for the terminal), so to use one again, read it there. Two ways to make one:
- create_document: you write the text yourself (a PRD, report, plan, notes, an essay, an HTML page, a README). The text streams to the user live as you write it, so put the whole document in the one call, the best you can make it, with no placeholder to fill in later. Call it once per document: to make several documents, call it several times (they can be in the same step), one card each. To change a document you made earlier, call it again with the same title: it is replaced in place.
- export_file: the file is made by code (a chart, PDF, spreadsheet, converted or processed file, anything binary or built from data). Write it in the sandbox with a script, then call export_file with its path. Several files are several export_file calls.
Never use either for a short answer that fits in a message.`

/** The name a document is saved under: its title, safe as a file name, with the extension of its format. */
export function documentName(title: string, format: 'markdown' | 'html') {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'document'
  return `${base}.${format === 'html' ? 'html' : 'md'}`
}

/**
 * The tools that hand files to the user. The file is saved in the browser and `onFile` shows it with the reply, so the
 * bytes never enter the model's context. `callId` is the tool call that made it, which is also the id of its live draft.
 * `existing` lists the files already in the chat, so a document made again under the same title replaces the old one.
 */
export function createExportFileTool(
  onFile: (file: ChatAttachment, callId: string) => void,
  session?: string,
  existing: () => ChatAttachment[] = () => [],
) {
  /** Documents made in this reply, which `existing` does not know yet. */
  const madeNow = new Map<string, ChatAttachment>()
  const remount = (src: string, name: string) =>
    sandboxStatus(session) === 'ready'
      ? mountFiles([{ key: mountKey(src), name, load: () => readMedia(src), readonly: true }], undefined, session).catch(() => undefined)
      : undefined

  return {
    create_document: tool({
      description:
        'Writes a document for the user: it streams to a panel beside the chat as you write it, and is saved as a file. Use it for anything long the user will read, keep or reuse: a PRD, report, plan, notes, or an HTML page. Call once per document; call again with the same title to replace one. Needs no sandbox.',
      inputSchema: z.object({
        title: z.string().min(1).describe('The document name, such as "MMT Logic Modules PRD"'),
        format: z.enum(['markdown', 'html']).default('markdown').describe('"html" only for a full, self-contained HTML page'),
        content: z.string().min(1).describe('The whole document, finished'),
      }),
      execute: async ({ title, content, format }, { toolCallId }) => {
        const fileName = documentName(title, format)
        const type = MIME[format === 'html' ? 'html' : 'md']
        const blob = new Blob([content], { type })
        const old = madeNow.get(fileName) ?? existing().findLast((file) => file.artifact && file.name === fileName)
        if (old) {
          await updateMedia(old.src, blob, fileName, 'agent')
          const file = { ...old, size: blob.size }
          madeNow.set(fileName, file)
          onFile(file, toolCallId)
          await remount(old.src, fileName)
          return `Replaced "${fileName}" for the user. It is saved as an attachment, not in your context; it is in the sandbox as "artifacts/${fileName}".`
        }
        const src = await putMedia(blob, fileName)
        const file: ChatAttachment = { src, name: fileName, type, size: blob.size, artifact: true }
        madeNow.set(fileName, file)
        onFile(file, toolCallId)
        // Into the terminal's folder right away when the environment is already running; otherwise the chat's
        // attachments are mounted before the next command, as every attached file is.
        await remount(src, fileName)
        return `Opened "${fileName}" for the user beside the chat. It is saved as an attachment, so its text is not in your context; it is in the sandbox as "artifacts/${fileName}", read-only for the terminal. The user can edit it beside the chat.`
      },
    }),
    export_file: tool({
      description:
        'Gives the user a file from the sandbox (a chart, converted file, spreadsheet or generated document). It is shown under your reply. Use it instead of printing file contents.',
      inputSchema: z.object({
        path: z.string().min(1).describe('The file in the sandbox, such as "report.pdf" or "chart.png"'),
        name: z.string().optional().describe("The name to show. Leave out to use the file's own name"),
      }),
      execute: async ({ path, name }, { abortSignal, toolCallId }) => {
        const wait = sandboxUnavailable(session)
        if (wait) return wait
        const bytes = await readSandboxFile(path, abortSignal, session)
        const fileName = name?.trim() || path.split('/').at(-1) || 'file'
        const type = MIME[fileName.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream'
        const src = await putMedia(new Blob([bytes as BlobPart], { type }), fileName)
        onFile({ src, name: fileName, type, size: bytes.byteLength, artifact: true }, toolCallId)
        return `Shown to the user: "${fileName}".`
      },
    }),
  }
}
