import { useLayoutEffect } from 'react'
import { z } from 'zod'
import { useS3D } from '../store'
import { DESCRIPTIONS, impl, schemas } from '../agent/tools-impl'
import { exportSvgString } from '../export/exporter'

const LOG = '[S3D WebMCP]'

interface ModelContext {
  registerTool(tool: object, options?: { signal?: AbortSignal }): unknown
  unregisterTool?(name: string): void
}

const modelContext = () =>
  ((document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext) as ModelContext | undefined

async function respond(execute: (args: never) => unknown, args: unknown) {
  try {
    const value = await execute((args ?? {}) as never)
    // Renders come back as an image the agent can look at, with any other fields as text.
    if (value && typeof value === 'object' && 'image' in value && 'mediaType' in value) {
      const { image, mediaType, ...rest } = value as { image: string; mediaType: string }
      return { content: [{ type: 'image', data: image, mimeType: mediaType }, ...(Object.keys(rest).length ? [{ type: 'text', text: JSON.stringify(rest) }] : [])] }
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
    return { content: [{ type: 'text', text }] }
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true }
  }
}

function buildTools() {
  const map: Record<string, keyof typeof impl> = {
    s3d_get_document: 'get_document', s3d_create_nodes: 'create_nodes', s3d_update_nodes: 'update_nodes', s3d_delete_nodes: 'delete_nodes',
    s3d_select: 'select_nodes', s3d_list_pages: 'list_pages', s3d_set_page: 'set_page', s3d_verify_design: 'verify_design',
    s3d_create_scene: 'create_scene', s3d_add_objects: 'add_objects', s3d_update_objects: 'update_objects', s3d_delete_objects: 'delete_objects',
    s3d_set_scene: 'set_scene', s3d_get_scene: 'get_scene', s3d_render_scene: 'render_scene', s3d_render_timeline: 'render_timeline',
    s3d_add_character: 'add_character', s3d_animate_character: 'animate_character', s3d_set_keyframes: 'set_keyframes',
    s3d_capture_image: 'capture_image', s3d_record_video: 'record_video',
  }
  const tools = Object.entries(map).map(([name, key]) => ({
    name,
    description: DESCRIPTIONS[key],
    inputSchema: z.toJSONSchema(schemas[key]),
    execute: (args: unknown) => respond((a: never) => (impl[key] as (x: never) => unknown)(a), args),
  }))
  const svgSchema = z.object({ ids: z.array(z.string()).optional().describe('Node ids; defaults to the selection or the whole page') })
  tools.push({
    name: 's3d_export_svg',
    description: 'Export nodes as an SVG string.',
    inputSchema: z.toJSONSchema(svgSchema),
    execute: (args: unknown) => respond(async (a: { ids?: string[] }) => {
      const st = useS3D.getState()
      const ids = a.ids?.length ? a.ids : st.selection.length ? st.selection : (st.doc.pages.find((p) => p.id === st.pageId)?.children ?? [])
      return exportSvgString(ids)
    }, args),
  })
  return tools
}

/** Registers the S3D tools with the browser for in-browser agents while S3D is open. */
export function S3DTools() {
  const ready = useS3D((s) => s.ready)
  useLayoutEffect(() => {
    const mc = modelContext()
    if (!mc || !ready) return
    const controller = new AbortController()
    const tools = buildTools()
    const handles: unknown[] = []
    for (const t of tools) {
      try {
        handles.push(mc.registerTool(t, { signal: controller.signal }))
      } catch (error) {
        console.error(LOG, 'register failed', t.name, error)
      }
    }
    return () => {
      controller.abort()
      for (const h of handles) (h as { unregister?: () => void } | undefined)?.unregister?.()
      for (const t of tools) {
        try {
          mc.unregisterTool?.(t.name)
        } catch {
          // Already removed through the signal.
        }
      }
    }
  }, [ready])
  return null
}
