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
    s3d_select: 'select_nodes', s3d_adjust_image: 'adjust_image', s3d_remove_background: 'remove_background', s3d_list_pages: 'list_pages', s3d_set_page: 'set_page', s3d_verify_design: 'verify_design',
    s3d_create_scene: 'create_scene', s3d_add_objects: 'add_objects', s3d_update_objects: 'update_objects', s3d_delete_objects: 'delete_objects',
    s3d_set_scene: 'set_scene', s3d_get_scene: 'get_scene', s3d_render_scene: 'render_scene', s3d_render_views: 'render_views', s3d_render_turntable: 'render_turntable', s3d_subdivide_mesh: 'subdivide_mesh', s3d_sculpt_mesh: 'sculpt_mesh', s3d_paint_mesh: 'paint_mesh', s3d_set_fur: 'set_fur', s3d_set_lighting: 'set_lighting', s3d_join_meshes: 'join_meshes', s3d_fuse_objects: 'fuse_objects', s3d_smooth_mesh: 'smooth_mesh', s3d_clean_mesh: 'clean_mesh', s3d_export_mesh: 'export_mesh', s3d_snapshot_view: 'snapshot_view', s3d_render_timeline: 'render_timeline',
    s3d_add_character: 'add_character', s3d_animate_character: 'animate_character', s3d_set_keyframes: 'set_keyframes',
    s3d_capture_image: 'capture_image', s3d_record_video: 'record_video',
    s3d_create_screen: 'create_screen', s3d_create_page: 'create_page', s3d_search_3d_models: 'search_3d_models', s3d_import_3d_model: 'import_3d_model',
    s3d_place_image: 'place_image', s3d_crop_image: 'crop_image', s3d_resize_image: 'resize_image', s3d_canvas_size: 'canvas_size', s3d_paint_image: 'paint_image',
    s3d_clone_image: 'clone_image', s3d_heal_image: 'heal_image', s3d_fill_image: 'fill_image', s3d_pick_color: 'pick_color', s3d_vibrance_image: 'vibrance_image',
    s3d_revert_image: 'revert_image', s3d_undo: 'undo', s3d_redo: 'redo', s3d_set_view: 'set_view', s3d_export_image: 'export_image',
    s3d_straighten_image: 'straighten_image', s3d_select_pixels: 'select_pixels', s3d_inspect_image: 'inspect_image',
    s3d_hue_saturation_image: 'hue_saturation_image', s3d_add_shape: 'add_shape', s3d_arrange_nodes: 'arrange_nodes', s3d_group_nodes: 'group_nodes', s3d_get_history: 'get_history', s3d_set_colors: 'set_colors', s3d_list_swatches: 'list_swatches',
  }
  const tools = Object.entries(map).map(([name, key]) => ({
    name,
    description: DESCRIPTIONS[key],
    inputSchema: z.toJSONSchema(schemas[key]),
    execute: async (args: unknown) => {
      const started = performance.now()
      try {
        return await respond((a: never) => (impl[key] as (x: never) => unknown)(a), args)
      } finally {
        console.info(LOG, `${name}: answered in ${Math.round(performance.now() - started)}ms`)
      }
    },
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
