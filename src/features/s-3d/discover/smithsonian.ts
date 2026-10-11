/**
 * Smithsonian 3D API (Open Access, CC0): https://3d-api.si.edu. Each model is a "3d_package" holding several files
 * (GLBs at different qualities, preview JPGs); search returns files, so results are grouped back into packages.
 */
const API = 'https://3d-api.si.edu/api/v1.0/content/file/search'

export const OWNING_UNITS: Record<string, string> = {
  NASM: 'Air and Space Museum',
  NMNHPALEO: 'Natural History · Paleobiology',
  NMNHMAMMALS: 'Natural History · Mammals',
  NMNHFISHES: 'Natural History · Fishes',
  NMNHHERPS: 'Natural History · Reptiles & Amphibians',
  NMNHINV: 'Natural History · Invertebrates',
  NMNHEDUCATION: 'Natural History · Education',
  NMAH: 'American History',
  NMAAHC: 'African American History and Culture',
  NMAfA: 'African Art',
  CHNDM: 'Cooper Hewitt Design Museum',
  SAAM: 'American Art Museum',
  NPG: 'Portrait Gallery',
  FSG: 'Freer and Sackler Galleries',
  SAO: 'Astrophysical Observatory',
  DPO: 'Digitization Program Office',
  'OFEO-SG': 'Smithsonian Gardens',
}

export interface DiscoverItem {
  /** The package id, e.g. "3d_package:40cf5b52-…". */
  id: string
  title: string
  /** A web-sized GLB, preferring the lighter qualities. */
  glb: string
  thumb?: string
  draco: boolean
}

interface Row {
  title: string
  content: { usage?: string; quality?: string; uri: string; file_type?: string; model_url?: string; draco_compressed?: boolean | string }
}

async function query(params: Record<string, string | number | undefined>, signal?: AbortSignal) {
  const url = new URL(API)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url, { signal })
  // The API answers 404 when nothing matches.
  if (res.status === 404) return { rows: [] as Row[], rowCount: 0 }
  if (!res.ok) throw new Error(`Smithsonian search failed (${res.status})`)
  return (await res.json()) as { rows: Row[]; rowCount: number }
}

const GLB_RANK = ['Low', 'Medium', 'Thumb', 'High', 'Low_resolution', 'AR']
const rank = (q?: string) => {
  const i = GLB_RANK.indexOf(q ?? '')
  return i < 0 ? GLB_RANK.length : i
}

/** GLB file rows per batch; a model has several GLBs (up to ~25 for big packages), so a batch is 20–80 models. */
export const PAGE_ROWS = 600

/**
 * One page of models (1-based). An empty query lists everything, so a collection alone can be browsed.
 * Preview images follow a fixed naming in each package; ones that are missing fall back to an icon in the UI.
 */
export async function searchModels({ q, unit, page = 1, signal }: { q: string; unit?: string; page?: number; signal?: AbortSignal }) {
  const res = await query({ q: q.trim() || undefined, owning_unit: unit, file_type: 'glb', start: (page - 1) * PAGE_ROWS, rows: PAGE_ROWS }, signal)
  const byId = new Map<string, { title: string; glb: Row['content'] }>()
  for (const r of res.rows) {
    const id = r.content.model_url
    if (!id || r.content.usage === 'iOSApp3D') continue
    const cur = byId.get(id)
    if (!cur || rank(r.content.quality) < rank(cur.glb.quality)) byId.set(id, { title: r.title, glb: r.content })
  }
  const items: DiscoverItem[] = [...byId].map(([id, v]) => ({
    id,
    title: v.title,
    glb: v.glb.uri,
    thumb: `https://3d-api.si.edu/content/document/${id}/scene-image-low.jpg`,
    draco: String(v.glb.draco_compressed) === 'true',
  }))
  return { items, page, pages: Math.max(1, Math.ceil(res.rowCount / PAGE_ROWS)) }
}
