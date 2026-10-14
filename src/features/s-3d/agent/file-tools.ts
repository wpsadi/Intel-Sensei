import { tool } from 'ai'
import { z } from 'zod'

import { importMedia, mountFiles, readSandboxFile, sandboxUnavailable } from '@/ai/sandbox/client'

import { kindOf, readFile, storeFile } from '../files'
import type { AgentAttachment } from '../types'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'text/plain',
  stl: 'model/stl',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
}

/**
 * Puts the files the user attached to this chat into the sandbox, once each, under their own names. Files stay out of
 * the model's context: it reads them with the terminal and Python, like any file on a disk.
 */
export const mountAttachments = (attachments: AgentAttachment[], signal?: AbortSignal) =>
  mountFiles(
    attachments.map((a) => ({ key: a.ref, name: a.name, load: () => readFile(a.ref) })),
    signal,
  )

/** Moves files between the sandbox and this S-3D file: what a Python script makes becomes something the canvas can use. */
export function createFileTools(docId: string) {
  const import_file = tool({
    description:
      'Copies a file saved in this design (an s3d-file: ref, such as an image node src or a model src) into the sandbox home folder so the terminal and Python scripts can work on it. Files the user attached to the chat are already there. Returns the path.',
    inputSchema: z.object({
      ref: z.string().describe('The s3d-file:… ref'),
      name: z.string().optional().describe('The file name to use. Leave out to keep its own name'),
    }),
    execute: async ({ ref, name }, { abortSignal }) => {
      const wait = sandboxUnavailable()
      if (wait) return wait
      const blob = await readFile(ref)
      if (!blob) throw new Error('That file is no longer saved in this browser')
      return `Copied to ${await importMedia(name?.trim() || ref.split(':').at(-1) || 'file', blob, abortSignal)}`
    },
  })

  const export_file = tool({
    description:
      'Saves a file from the sandbox (a chart or image made by a script, a converted or generated model, a video) into this design. Returns an s3d-file: ref: use it as `src` in place_image for pictures, or as `src` of a model object in add_objects for a GLB/GLTF.',
    inputSchema: z.object({
      path: z.string().min(1).describe('The file in the sandbox, such as "chart.png"'),
      name: z.string().optional().describe("The name to save it under. Leave out to use the file's own name"),
    }),
    execute: async ({ path, name }, { abortSignal }) => {
      const wait = sandboxUnavailable()
      if (wait) return wait
      const bytes = await readSandboxFile(path, abortSignal)
      const fileName = name?.trim() || path.split('/').at(-1) || 'file'
      const type = MIME[fileName.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream'
      const ref = await storeFile(new Blob([bytes as BlobPart], { type }), fileName, docId)
      return `Saved "${fileName}" (${kindOf({ name: fileName, type })}). Its ref is ${ref}.`
    },
  })

  return { import_file, export_file }
}
