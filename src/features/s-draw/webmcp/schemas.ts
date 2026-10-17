import { z } from 'zod'

const id = z.string().min(1).max(100)
const revision = z.number().int().nonnegative().describe('Revision returned by get_document; reread after a human edit')
const bounds = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative().finite(),
  height: z.number().nonnegative().finite(),
})
const page = { offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(10).default(5) }
const ids = z.array(id).min(1).max(20)
const pointBinding = z
  .object({
    elementId: id,
    focus: z.number().finite(),
    gap: z.number().nonnegative().finite(),
    fixedPoint: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  })
  .nullable()
const endpoint = z
  .object({
    id: id.optional(),
    type: z.enum(['rectangle', 'ellipse', 'diamond', 'text']).optional(),
    text: z.string().max(100000).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().nonnegative().finite().optional(),
    height: z.number().nonnegative().finite().optional(),
  })
  .passthrough()
export const elementShape = z
  .object({
    type: z.enum([
      'rectangle',
      'ellipse',
      'diamond',
      'text',
      'arrow',
      'line',
      'freedraw',
      'image',
      'frame',
      'magicframe',
      'embeddable',
      'iframe',
    ]),
    x: z.number().finite(),
    y: z.number().finite(),
    id: id.optional(),
    width: z.number().nonnegative().finite().optional(),
    height: z.number().nonnegative().finite().optional(),
    text: z.string().max(100000).optional(),
    label: z
      .object({ text: z.string().max(10000) })
      .passthrough()
      .optional(),
    points: z
      .array(z.tuple([z.number().finite(), z.number().finite()]))
      .max(10000)
      .optional(),
    fileId: id.nullable().optional(),
    start: endpoint.optional(),
    end: endpoint.optional(),
    link: z.string().max(10000).nullable().optional(),
    containerId: id.nullable().optional(),
    boundElements: z
      .array(z.object({ id, type: z.enum(['arrow', 'text']) }))
      .max(10000)
      .nullable()
      .optional(),
    startBinding: pointBinding.optional(),
    endBinding: pointBinding.optional(),
    roundness: z
      .object({ type: z.union([z.literal(1), z.literal(2), z.literal(3)]), value: z.number().finite().optional() })
      .nullable()
      .optional(),
    crop: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().nonnegative().finite(),
        height: z.number().nonnegative().finite(),
        naturalWidth: z.number().positive().finite(),
        naturalHeight: z.number().positive().finite(),
      })
      .nullable()
      .optional(),
    scale: z.tuple([z.union([z.literal(-1), z.literal(1)]), z.union([z.literal(-1), z.literal(1)])]).optional(),
    pressures: z.array(z.number().min(0).max(1)).max(10000).optional(),
    simulatePressure: z.boolean().optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    fontFamily: z.number().int().min(1).max(10).optional(),
    lineHeight: z.number().positive().max(20).optional(),
    autoResize: z.boolean().optional(),
    originalText: z.string().max(100000).optional(),
    locked: z.boolean().optional(),
    strokeColor: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional(),
    fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    strokeWidth: z.number().min(0).max(100).optional(),
    roughness: z.number().min(0).max(10).optional(),
    opacity: z.number().min(0).max(100).optional(),
    fontSize: z.number().min(1).max(1000).optional(),
    angle: z.number().finite().optional(),
    groupIds: z.array(id).max(50).optional(),
    frameId: id.nullable().optional(),
    children: z.array(id).max(10000).optional(),
  })
  .passthrough()
  .describe('Native Excalidraw skeleton; supports styles, labels, bindings, groups, frames and links')

export const schemas = {
  sdraw_get_document: z.object({}),
  sdraw_list_sheets: z.object(page),
  sdraw_read_elements: z.object({
    ...page,
    scope: z.enum(['all', 'selection', 'region']).default('all'),
    region: bounds.optional(),
    query: z.string().max(200).optional(),
  }),
  sdraw_check_layout: z.object({
    ...page,
    scope: z.enum(['all', 'selection', 'region']).default('all'),
    region: bounds.optional(),
  }),
  sdraw_read_element_field: z.object({
    id,
    field: z.string().min(1).max(40),
    offset: z.number().int().nonnegative().default(0),
    length: z.number().int().min(1).max(600).default(600),
  }),
  sdraw_create_elements: z.object({ sheetId: id, expectedRevision: revision, elements: z.array(elementShape).min(1).max(20) }),
  sdraw_update_elements: z.object({
    sheetId: id,
    expectedRevision: revision,
    updates: z
      .array(z.object({ id, patch: z.record(z.string(), z.unknown()) }))
      .min(1)
      .max(20),
  }),
  sdraw_delete_elements: z.object({ sheetId: id, expectedRevision: revision, ids }),
  sdraw_select_elements: z.object({ ids: z.array(id).max(1000), fit: z.boolean().default(false) }),
  sdraw_manage_sheets: z.object({
    action: z.enum(['create', 'switch', 'rename', 'duplicate']),
    sheet: id.optional().describe('Sheet name or ID; required except for create'),
    name: z.string().min(1).max(160).optional(),
  }),
  sdraw_delete_sheet: z.object({
    sheet: id.describe('Exact sheet name or ID'),
    confirmDelete: z.literal(true).describe('User explicitly requested deletion of this sheet'),
  }),
  sdraw_set_view: z.object({
    fit: z.enum(['all', 'selection']).optional(),
    zoom: z.number().min(0.1).max(30).optional(),
    scrollX: z.number().finite().optional(),
    scrollY: z.number().finite().optional(),
    theme: z.enum(['light', 'dark']).optional(),
    background: z.string().max(100).optional(),
    grid: z.boolean().optional(),
  }),
  sdraw_add_files: z.object({
    sheetId: id,
    files: z
      .array(
        z.object({
          id,
          dataURL: z
            .string()
            .max(14000000)
            .regex(/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/),
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']),
        }),
      )
      .min(1)
      .max(5),
  }),
  sdraw_capture_view: z.object({
    scope: z.enum(['all', 'selection', 'elements']).default('all'),
    ids: z.array(id).min(1).max(100).optional().describe('Element IDs to view when scope is elements; includes their bound labels'),
    maxSize: z
      .number()
      .int()
      .min(800)
      .max(2400)
      .default(1600)
      .describe('Longest image edge in pixels; use a close-up when labels are too small'),
  }),
  sdraw_export_scene: z.object({ format: z.enum(['excalidraw', 'svg', 'png']), scope: z.enum(['all', 'selection']).default('all') }),
  sdraw_read_guide: z.object({ offset: z.number().int().nonnegative().default(0) }),
}

export const descriptions: Record<keyof typeof schemas, string> = {
  sdraw_get_document:
    'Inspect the active drawing, revision, selection and whole-workspace counts. Use before editing to identify the current sheet and focused region.',
  sdraw_list_sheets: 'List drawing sheets with their sizes. Use to find another sheet or inspect a large workspace in pages.',
  sdraw_read_elements:
    'Read drawing elements with bound labels and connector endpoints, bindings and arrowheads in bounded pages. Use to understand boxes, arrow direction and edit targets; filter by selection, region or text.',
  sdraw_read_element_field:
    'Read a complete element property in small JSON text chunks. Use for long labels, freehand points, bindings or other details omitted from summaries.',
  sdraw_check_layout:
    'Find labels outside boxes, unbound box text, arrows passing through content and overlapping or crossing connectors. Use after drawing or moving elements, then repair unintended issues and verify a rendered capture. Checks are advisory and paginated.',
  sdraw_create_elements:
    'Draw native Excalidraw shapes, text, arrows, images and frames while preserving the existing scene. Use when asked to add a diagram or drawing.',
  sdraw_update_elements:
    'Edit existing drawing elements in place, preserving identity and undo history. Use to move, style, relabel, group or bind inspected elements.',
  sdraw_delete_elements: 'Remove specific elements and repair their references. Use when the user asks to remove drawing content.',
  sdraw_select_elements:
    'Select drawing elements and optionally bring them into view. Use to show a result or focus an area for the human.',
  sdraw_manage_sheets:
    'Create, switch, rename or duplicate drawing sheets. Use to organize separate drawings without replacing the current scene.',
  sdraw_delete_sheet: 'Delete a drawing sheet permanently. Use only when the user explicitly asks to delete that sheet.',
  sdraw_set_view: 'Adjust the drawing viewport, appearance or grid. Use to frame content or apply requested canvas settings.',
  sdraw_add_files: 'Store image data in the active drawing. Use before creating image elements that reference these files.',
  sdraw_capture_view:
    'View the actual drawing as a PNG image. Use after creating or editing to inspect text fit, arrow routing and overlaps before finishing. Capture the whole sheet for context or specific elements for a readable close-up without changing the human selection.',
  sdraw_export_scene: 'Download the drawing as a native editable file, SVG or PNG. Use when the user requests a local export.',
  sdraw_read_guide:
    'Read the large-drawing skill in bounded pages. Use when the file or selection is too large to inspect in a single context.',
}

const reading = new Set([
  'sdraw_check_layout',
  'sdraw_get_document',
  'sdraw_list_sheets',
  'sdraw_read_elements',
  'sdraw_read_element_field',
  'sdraw_read_guide',
  'sdraw_capture_view',
])
const userContent = new Set([
  'sdraw_check_layout',
  'sdraw_get_document',
  'sdraw_list_sheets',
  'sdraw_read_elements',
  'sdraw_read_element_field',
  'sdraw_manage_sheets',
  'sdraw_capture_view',
])
export const toolDefinitions = Object.entries(schemas).map(([name, schema]) => ({
  name,
  description: descriptions[name as keyof typeof schemas],
  inputSchema: z.toJSONSchema(schema),
  ...(reading.has(name) || userContent.has(name) || name === 'sdraw_delete_sheet'
    ? {
        annotations: {
          ...(name === 'sdraw_delete_sheet' ? { consequentialHint: true } : {}),
          ...(reading.has(name) ? { readOnlyHint: true } : {}),
          ...(userContent.has(name) ? { untrustedContentHint: true } : {}),
        },
      }
    : {}),
}))
